// SCNet XL, layer.mjs's default separator: its melody stem carries far less kick and bass than Demucs' (about 10 dB
// less on our test track), and it kept a melody Demucs filed under the drums. About eight times slower than Demucs on
// a CPU.
import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { sha256 } from "./media.mjs";
import { requireModule, separate } from "./stems.mjs";

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCNET_WEIGHTS = {
  url: "https://github.com/ZFTurbo/Music-Source-Separation-Training/releases/download/v1.0.15/model_scnet_ep_36_sdr_10.0891.ckpt",
  sha256: "ac25975f0f5704f3d1a3c3c251505b7a0f417a22eafe82773440ee4f7e14b74f",
  bytes: 214063778,
};

/** How layer.mjs splits a track unless told otherwise. */
export const DEFAULT_STEMS = "scnet";
const verified = new Set();   // files already hashed this run

/**
 * The SCNet weights at `file`, downloaded on first use. Only a file with the expected hash is used: a download that
 * differs is removed and refused, so a swapped or broken file never loads.
 */
export async function scnetWeights(file = path.join(KIT, "models", "scnet-xl-ihf.ckpt"), want = SCNET_WEIGHTS) {
  const key = `${file} ${want.sha256}`;
  if (verified.has(key) && existsSync(file)) return file;
  if (existsSync(file) && (await sha256(file)) === want.sha256) {
    verified.add(key);
    return file;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const part = `${file}.part`;
  try {
    console.log(`downloading the SCNet model (${Math.round(want.bytes / 1e6)} MB, once)…`);
    const res = await fetch(want.url);
    if (!res.ok) throw new Error(`the SCNet model download failed: HTTP ${res.status} from ${want.url}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
    const got = await sha256(part);
    if (got !== want.sha256) {
      throw new Error(`the SCNet model downloaded from ${want.url} is not the expected file (sha256 ${got}); not using it`);
    }
    renameSync(part, file);
    verified.add(key);
    return file;
  } finally {
    rmSync(part, { force: true });
  }
}

/**
 * Splits `input` into `stems` like stems.mjs' separate(), with `source` scnet as well as demucs, elevenlabs or a
 * folder. SCNet writes into `work`/scnet first and the stems move in only when all four are written.
 */
export async function splitTrack(input, stems, { source = DEFAULT_STEMS, python, work }) {
  if (!["scnet", "demucs", "elevenlabs"].includes(source) && !existsSync(source)) {
    throw new Error(`--stems ${source}: expected scnet, demucs, elevenlabs or a folder of stems`);
  }
  if (source !== "scnet") return separate(input, stems, { source, python, work });
  requireModule(python, "torch", "SCNet runs on PyTorch: install it with pip install -r py/requirements-demucs.txt "
    + "--extra-index-url https://download.pytorch.org/whl/cpu (it brings PyTorch), "
    + "or use --stems demucs or elevenlabs.");
  const weights = await scnetWeights(), tmp = path.join(work, "scnet");
  rmSync(tmp, { recursive: true, force: true });
  try {
    console.log("separating stems with SCNet (minutes a track: about 8 s per second of music on 8 CPU cores)…");
    execFileSync(python, ["-I", path.join(KIT, "py/scnet_separate.py"), input, weights, tmp], { stdio: "inherit" });
    mkdirSync(stems, { recursive: true });
    for (const f of readdirSync(tmp)) renameSync(path.join(tmp, f), path.join(stems, f));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
