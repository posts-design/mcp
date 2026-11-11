// Reading media with ffprobe and ffmpeg. Decoded frames are cached on disk by the file's hash, once per film, so
// render workers and later renders read JPEGs by index instead of decoding again.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { clamp } from "./ease.mjs";
import { COLOR, WINDOW } from "./layout.mjs";

const run = (cmd, args, opts) => execFileSync(cmd, args, { maxBuffer: 256 * 1024 ** 2, ...opts });
const AUDIO = /\.(mp3|wav|flac|m4a|ogg)$/i;
/** The audio files in a folder, by name. */
export const audioFiles = (dir) => readdirSync(dir).filter((f) => AUDIO.test(f));
export const isUrl = (s) => /^https?:\/\//i.test(s);

/** Decoded frames and render scratch run to gigabytes, so they live in the user's cache folder, not a RAM-backed /tmp. */
export function defaultCache() {
  const home = os.homedir();
  const base = process.env.XDG_CACHE_HOME || (process.platform === "darwin" ? path.join(home, "Library", "Caches") : path.join(home, ".cache"));
  return path.join(base, "sound-breakdown");
}

/** Stops early when ffmpeg or ffprobe is missing, rather than failing later with "spawnSync ffprobe ENOENT". */
export function requireTools() {
  for (const tool of ["ffmpeg", "ffprobe"]) {
    try { run(tool, ["-version"], { stdio: "ignore" }); }
    catch { throw new Error(`${tool} is not on your PATH. Install ffmpeg (with libx264), which includes ffprobe, and run again.`); }
  }
  // some Linux builds leave out the H.264 encoder, which would only show after every frame is drawn
  if (!/\blibx264\b/.test(run("ffmpeg", ["-hide_banner", "-encoders"], { stdio: ["ignore", "pipe", "ignore"] }).toString())) {
    throw new Error("this ffmpeg has no libx264 (H.264) encoder; install a full ffmpeg build and run again");
  }
}

/** The first 12 hex of a file's SHA-256, streamed. */
export function sha12(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("error", reject).on("end", () => resolve(h.digest("hex").slice(0, 12)));
  });
}

/**
 * Duration (the container's), frame rate, size as shown (a phone video stored turned is turned back, as ffmpeg
 * decodes it) and whether it has sound.
 */
export function probe(file) {
  const { format, streams } = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,r_frame_rate,avg_frame_rate,width,height:stream_tags=rotate:stream_side_data=rotation", "-of", "json", file]));
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`${file} has no video stream`);
  const rate = (r) => { const [num, den] = String(r).split("/").map(Number); return num / (den || 1); };
  // a variable-rate file can report a nominal 90000 fps; its average is the real one
  const fps = rate(video.r_frame_rate) > 0 && rate(video.r_frame_rate) <= 120 ? rate(video.r_frame_rate) : rate(video.avg_frame_rate);
  if (!(fps > 0 && fps <= 120)) throw new Error(`${file}: can't read its frame rate`);
  // newer files carry rotation as side data, older ones as a rotate tag
  const rotation = video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0;
  const turned = Math.abs(Number(rotation)) % 180 === 90;
  return { duration: Number(format.duration), fps, width: turned ? video.height : video.width, height: turned ? video.width : video.height,
    audio: streams.some((s) => s.codec_type === "audio") };
}

/**
 * Runs `fill` once for a cache folder. It fills a private folder that is renamed into place when complete, so a
 * killed run leaves nothing half-written and two renders of the same film never read each other's partial frames.
 */
function cached(dir, fill) {
  if (existsSync(path.join(dir, "done"))) return dir;
  clearStale(path.dirname(dir), `${path.basename(dir)}.part-`);
  const tmp = `${dir}.part-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try { fill(tmp); writeFileSync(path.join(tmp, "done"), ""); } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; }
  if (!existsSync(path.join(dir, "done"))) rmSync(dir, { recursive: true, force: true });   // an older run's leftover
  try { renameSync(tmp, dir); } catch (e) { rmSync(tmp, { recursive: true, force: true }); if (!existsSync(path.join(dir, "done"))) throw e; }
  return dir;
}
const jpegs = (dir) => readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();

/**
 * Every frame of the film at the window's size, as numbered JPEGs. A source that isn't 16:9 is fitted inside the
 * window on the ground. `frameAt(t)` gives the file for post time t. Workers pass `decode: false` and only read.
 */
export async function filmFrames(src, info, cacheDir, { decode = true, ground = COLOR.ground } = {}) {
  const wide = Math.abs(info.width / info.height - 16 / 9) < 0.01;
  const dir = path.join(cacheDir, `${await sha12(src)}-${WINDOW.w}${wide ? "" : "-fit"}`);
  const scale = wide ? `scale=${WINDOW.w}:${WINDOW.h}:flags=lanczos`
    : `scale=${WINDOW.w}:${WINDOW.h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${WINDOW.w}:${WINDOW.h}:(ow-iw)/2:(oh-ih)/2:color=${ground}`;
  if (decode) cached(dir, (d) => run("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", scale, "-q:v", "1", "-qmin", "1", path.join(d, "%05d.jpg")]));
  const count = jpegs(dir).length;
  if (!count) throw new Error(`no frames decoded from ${src}`);
  return (t) => path.join(dir, `${String(clamp(0, count - 1, Math.floor(t * info.fps + 1e-6)) + 1).padStart(5, "0")}.jpg`);
}

/** True while a process with this id runs (a stale scratch folder's owner, for instance). */
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** Removes `<prefix><pid>…` folders in `dir` left by processes that have stopped (a killed render, say). */
export function clearStale(dir, prefix) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const pid = Number(/^(\d+)/.exec(name.slice(prefix.length))?.[1]);
    if (name.startsWith(prefix) && pid && !alive(pid)) rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

/** A stem's file in the stems folder, whatever its audio format. */
export function stemFile(dir, stem) {
  const found = audioFiles(dir).filter((f) => path.parse(f).name === stem);
  if (!found.length) throw new Error(`no stem "${stem}" in ${dir} (expected ${stem}.mp3, .wav, .flac, .m4a or .ogg)`);
  if (found.length > 1) throw new Error(`two files for the stem "${stem}" in ${dir} (${found.join(", ")}); keep one`);
  return path.join(dir, found[0]);
}

const ENVELOPE_HOP = 0.01;
/** A stem's loudness every 10 ms (RMS), scaled so its 99th percentile is 1 and clipped there. */
export function envelope(file) {
  const raw = run("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "22050", "-f", "f32le", "-"]);
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), hop = 220.5, n = Math.floor(x.length / hop), e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const a = Math.floor(i * hop), b = Math.floor((i + 1) * hop);
    for (let k = a; k < b; k++) s += x[k] * x[k];
    e[i] = Math.sqrt(s / (b - a));
  }
  const p99 = [...e].sort((a, b) => a - b)[Math.floor(n * 0.99)] || 1;
  return e.map((v) => Math.min(1, v / p99));
}

/** RMS of an envelope between two times. */
export function envelopeRms(e, a, b) {
  const i0 = Math.max(0, Math.floor(a / ENVELOPE_HOP)), i1 = Math.min(e.length - 1, Math.max(i0, Math.ceil(b / ENVELOPE_HOP)));
  if (i1 < i0) return 0;   // past the stem's end
  let s = 0;
  for (let i = i0; i <= i1; i++) s += e[i] * e[i];
  return Math.sqrt(s / (i1 - i0 + 1));
}

/** `length` seconds of a post from `from`, at `fps` and twice the row height, for an end-scene tile. */
export async function tileFrames(file, { from, length, fps, rowH, cacheDir, decode = true, defaultFrom }) {
  const dir = path.join(cacheDir, `tiles-${await sha12(file)}-${rowH}${from === defaultFrom ? "" : `-${from}`}`);
  if (decode) cached(dir, (d) => run("ffmpeg", ["-v", "error", "-y", "-ss", String(from), "-t", String(length), "-i", file,
    "-vf", `fps=${fps},scale=-2:${rowH * 2}:flags=lanczos`, "-q:v", "2", path.join(d, "%04d.jpg")]));
  return { dir, frames: jpegs(dir) };
}

/** Seconds of a tile that are nearly black (mean luminance under 24 of 255), sampled once a second. */
export async function darkSeconds({ dir, frames }, fps) {
  let dark = 0;
  for (const f of frames.filter((_, i) => i % fps === 0)) if ((await sharp(path.join(dir, f)).greyscale().stats()).channels[0].mean < 24) dark++;
  return dark;
}

/** Where a post given as a link is kept once downloaded. */
export const postCacheFile = (url, cacheDir) =>
  path.join(cacheDir, "posts", createHash("sha256").update(url).digest("hex").slice(0, 16) + (path.extname(new URL(url).pathname) || ".mp4"));

/** A post given as a link is downloaded once, into the cache on this machine; a file is resolved against `base`. */
export async function localPost(fileOrUrl, base, cacheDir) {
  if (!isUrl(fileOrUrl)) return path.resolve(base, fileOrUrl);
  const file = postCacheFile(fileOrUrl, cacheDir), part = `${file}.part`;
  if (existsSync(file)) return file;
  mkdirSync(path.dirname(file), { recursive: true });
  let res;
  try { res = await fetch(fileOrUrl, { signal: AbortSignal.timeout(120_000) }); }
  catch (e) { throw new Error(`could not download ${fileOrUrl}: ${e.cause?.message ?? e.message}`); }
  if (!res.ok) throw new Error(`could not download ${fileOrUrl}: HTTP ${res.status}`);
  writeFileSync(part, Buffer.from(await res.arrayBuffer()));
  // a page or a sign-in wall comes back 200 too: keep the file only if it is a video
  try { probe(part); } catch { rmSync(part, { force: true }); throw new Error(`${fileOrUrl} is not a video; link the video file itself`); }
  renameSync(part, file);
  return file;
}
