#!/usr/bin/env node
// Renders a sound breakdown: one spec in, one film out.
//
//   node render.mjs breakdown.json                       the film, as breakdown.mp4 beside the spec
//   node render.mjs breakdown.json out.mp4 --stills 4,12,30   PNG stills at those seconds instead, to check quickly
//   options: --jobs <n> (render processes, default up to 4), --cache <dir> (decoded frames; default ~/.cache/sound-breakdown)
//
// The film is the post at its own speed and with its own sound, over an editor's timeline of itself (README.md).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync, renameSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readArgs, runCli } from "./lib/cli.mjs";
import { encodeFrames, isWorker } from "./lib/encode.mjs";
import { createBreakdown } from "./lib/film.mjs";
import { FRAME, TALL } from "./lib/layout.mjs";
import { defaultCache, localPost, requireTools, stemFile } from "./lib/media.mjs";
import { parseSpec, warnings } from "./lib/spec.mjs";
import { requireFont } from "./lib/svg.mjs";

/**
 * Renders `specFile` to `out`, or writes stills at `stills` seconds. Paths in the spec are relative to `base`
 * (default: the spec's folder). `lockup` is the one drawing hook for a script that imports this: a mark drawn under
 * the end scene's wall, `{ top, svg(t, at) }` (its ink's top in px, and its SVG at time t once it plants at `at`).
 *
 * With more than one job, render processes re-run the script that called this with the same arguments (see
 * lib/encode.mjs), so a script that calls render() must reach it the same way every time and do nothing else first.
 */
export async function render({ specFile, out, stills = null, jobs = Math.min(4, os.availableParallelism()), base, cacheDir = defaultCache(),
  lockup = null, log = console.log }) {
  const worker = isWorker(), say = worker ? () => {} : log;
  let raw;
  try { raw = JSON.parse(await readFile(specFile, "utf8")); } catch (e) { throw new Error(`${specFile}: ${e.message}`); }
  const spec = parseSpec(raw);
  base ??= path.dirname(path.resolve(specFile));
  out = path.resolve(out ?? specFile.replace(/\.json$/i, "") + ".mp4");
  if (!worker) { requireTools(); await requireFont(); await preflight(spec, base, cacheDir); }
  const film = await createBreakdown(spec, { base, cacheDir, decode: !worker, log: say, lockup });
  if (!worker) for (const w of warnings(spec, film.duration)) say(`warning: ${w}`);
  const { width: W, height: H, fps } = FRAME, tall = spec.aspect === "9:16", ground = film.colors.ground;

  if (stills) {
    for (const s of stills) {
      const file = `${out.replace(/\.mp4$/i, "")}-${s}.png`;
      let img = sharp(await film.frameAt(s), { raw: { width: W, height: H, channels: 3 } });
      if (tall) img = sharp(await img.png().toBuffer()).extend({ top: TALL.top, bottom: TALL.height - H - TALL.top, background: ground });
      await img.png().toFile(file);
      say(file);
    }
    return;
  }

  // Frame 0 is the cover (a settled, busy moment, `cover`); playback starts on frame 1, so the sound is delayed a frame.
  const count = Math.round(film.total * fps) + 1, silent = out.replace(/\.mp4$/i, "") + "-silent.mp4";
  const pad = tall ? ["-vf", `pad=${W}:${TALL.height}:0:${TALL.top}:color=0x${ground.slice(1)}`] : [];
  await encodeFrames({ count, frameOf: (i) => film.frameAt(i === 0 ? spec.cover : (i - 1) / fps), width: W, height: H, fps, jobs, scratch: cacheDir, log: say,
    outArgs: [...pad, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", silent] });
  if (!film.info.audio) {
    renameSync(silent, out);
    say(`done ${out} (${(count / fps).toFixed(2)} s, the source has no sound)`);
    return;
  }
  // The post's own mix under a true-peak guard: a limiter at 4× the rate keeps decoded peaks under −1.5 dBTP. `gainDb`
  // trims a mix first (loudness() suggests it above −15 LUFS, to reach −16).
  const gain = spec.gainDb ? `volume=${spec.gainDb}dB,` : "", delay = Math.round(1000 / fps);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", silent, "-i", path.resolve(base, spec.source), "-filter_complex",
    `[1:a]${gain}aresample=192000,alimiter=limit=0.78:attack=1:release=60:level=0,aresample=48000,adelay=${delay}:all=1,apad[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-t", (count / fps).toFixed(3), "-movflags", "+faststart", out]);
  rmSync(silent, { force: true });
  say(`done ${out} (${(count / fps).toFixed(2)} s)`);
  say(loudness(out));
}

/**
 * What a render needs, found before the film is decoded rather than minutes into it: the film, every stem a lane
 * draws, and the end scene's linked posts (downloaded now, into the cache).
 */
async function preflight(spec, base, cacheDir) {
  const source = path.resolve(base, spec.source), stems = path.resolve(base, spec.stems);
  if (!existsSync(source)) throw new Error(`source: no film at ${source}`);
  if (!existsSync(stems)) throw new Error(`stems: no folder at ${stems}`);
  for (const stem of new Set(spec.lanes.flatMap((l) => [l.stem, ...l.clips.map((c) => c.stem)]))) stemFile(stems, stem);
  for (const post of spec.end?.posts ?? []) {
    const file = await localPost(post.file, base, cacheDir);
    if (!existsSync(file)) throw new Error(`end.posts: no file at ${file}`);
  }
}

/** Integrated loudness and true peak of the film's sound, with what to change when it is far from −16 LUFS. */
function loudness(file) {
  // ebur128 writes its summary to stderr
  const log = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";
  const summary = log.slice(log.lastIndexOf("Summary:"));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]), peak = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs)) return "loudness: not measured";
  const hint = lufs > -15 ? `; set "gainDb": ${(-16 - lufs).toFixed(1)} for −16 LUFS` : lufs < -18 ? "; the post's own mix is quiet, which is fine to keep" : "";
  return `loudness ${lufs.toFixed(1)} LUFS, true peak ${peak.toFixed(1)} dBTP${hint}`;
}

/** Command-line arguments: the spec, an optional output, and flags; undefined where not given. */
export function parseArgs(argv) {
  const { values, positionals } = readArgs(argv, ["stills", "jobs", "cache"]);
  const stills = values.stills?.split(",").map(Number);
  if (stills && !stills.every((s) => Number.isFinite(s) && s >= 0)) throw new Error("--stills takes seconds, such as --stills 4,12,30");
  const jobs = values.jobs === undefined ? undefined : Number(values.jobs);
  if (jobs !== undefined && !(Number.isInteger(jobs) && jobs >= 1)) throw new Error("--jobs takes a whole number of processes, such as --jobs 4");
  return { specFile: positionals[0], out: positionals[1], stills, jobs, cacheDir: values.cache };
}

const USAGE = "usage: node render.mjs <breakdown.json> [out.mp4] [--stills 4,12,30] [--jobs 4] [--cache <dir>]";
// run as a command (compared as real paths: a symlinked folder must still count)
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(async () => {
    const args = parseArgs(process.argv.slice(2));
    if (!args.specFile) { console.error(USAGE); process.exit(2); }
    await render(Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)));
  });
}
