// Frames to H.264 on several cores. The command that renders is re-run as `jobs` worker processes (same arguments,
// BREAKDOWN_BLOCKS in the environment); each renders its share of the frames in blocks of 15, round-robin, to
// lossless FFV1 files. The parent decodes the blocks back in order and feeds the exact bytes one process would have
// produced to one encoder, so the film is the same whatever the number of workers.
//
// This works because a frame depends on its time alone, and because setup before encoding (probing, measuring) has
// no side effects a worker would repeat: workers skip decoding into the cache and read it.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const BLOCK = 15;
const ENV = "BREAKDOWN_BLOCKS";

/** The blocks of 15 frames worker `worker` of `of` renders: every `of`-th block from its own. */
export function blocksOf(worker, of, count) {
  const out = [];
  for (let b = worker; b * BLOCK < count; b += of) out.push([b * BLOCK, Math.min(count, (b + 1) * BLOCK)]);
  return out;
}
/** True inside a worker: only render frames; skip decoding, warnings and anything written beside the film. */
export const isWorker = () => Boolean(process.env[ENV]);

const writer = (ff) => (b) => new Promise((r) => (ff.stdin.write(b) ? r() : ff.stdin.once("drain", r)));
const closed = (p) => new Promise((resolve, reject) => p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));

/**
 * Renders frames 0…count−1 (`frameOf(i)` → an rgb24 Buffer of width×height) and encodes them with
 * `ffmpeg -f rawvideo … -i - <outArgs>`. In a worker this renders the worker's blocks and exits the process.
 */
export async function encodeFrames({ count, frameOf, width, height, fps, outArgs, jobs, scratch, log = (s) => process.stdout.write(`${s}\n`) }) {
  const input = ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-"];
  if (isWorker()) {
    const { dir, worker, of } = JSON.parse(process.env[ENV]);
    for (const [from, to] of blocksOf(worker, of, count)) {
      const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", ...input, "-c:v", "ffv1", "-level", "3", "-pix_fmt", "gbrp", "-threads", "1",
        path.join(dir, `block-${String(from / BLOCK).padStart(5, "0")}.mkv`)], { stdio: ["pipe", "inherit", "inherit"] });
      const write = writer(ff);
      for (let i = from; i < to; i++) await write(await frameOf(i));
      ff.stdin.end();
      await closed(ff);
    }
    process.exit(0);
  }
  const enc = spawn("ffmpeg", ["-y", "-loglevel", "error", ...input, ...outArgs], { stdio: ["pipe", "inherit", "inherit"] });
  const done = closed(enc);
  if (jobs <= 1) {
    const write = writer(enc);
    for (let i = 0; i < count; i++) { await write(await frameOf(i)); if (i % 60 === 0) log(`frame ${i}/${count}`); }
    enc.stdin.end();
    return done;
  }
  const dir = mkdtempSync(path.join(scratch, "render-"));
  try {
    const t0 = Date.now(), blocks = Math.ceil(count / BLOCK), n = Math.min(jobs, blocks);
    log(`rendering ${count} frames on ${n} workers`);
    const kids = Array.from({ length: n }, (_, k) => spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, [ENV]: JSON.stringify({ dir, worker: k, of: n }) },
    }));
    try {
      await Promise.all(kids.map((p, k) => new Promise((resolve, reject) => {
        p.on("error", reject);
        p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`render worker ${k} exited ${code}`))));
      })));
    } catch (e) {
      for (const p of kids) if (p.exitCode === null) p.kill("SIGTERM");
      enc.kill("SIGTERM");
      throw e;
    }
    log(`rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s; encoding`);
    const list = path.join(dir, "blocks.txt");
    writeFileSync(list, Array.from({ length: blocks }, (_, b) => `file 'block-${String(b).padStart(5, "0")}.mkv'\n`).join(""));
    const dec = spawn("ffmpeg", ["-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
    dec.stdout.pipe(enc.stdin);
    await Promise.all([closed(dec), done]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
