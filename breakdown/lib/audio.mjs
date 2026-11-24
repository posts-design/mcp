// Audio plumbing for layer.mjs: measuring with ffmpeg, mixing pieces of files onto a film's clock,
// mastering and putting the mix on the film.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { maxBuffer: 1 << 28 });
const ffInfo = (...a) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...a, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 }).stderr;
export const seconds = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

/** Integrated loudness (LUFS) and true peak (dBTP); a short sound is padded so it fills a 400 ms block. */
export function loudness(file, af = "") {
  const out = ffInfo("-i", file, "-af", `${af}apad=pad_dur=1,ebur128=peak=true`);
  const at = out.lastIndexOf("Integrated loudness");
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(out.slice(at))?.[1]), peak: Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(out.slice(at))?.[1]) };
}
/** Mean level (dB) of a file between two seconds. */
export const meanDb = (file, from, to) => Number(/mean_volume: (-?[\d.]+)/.exec(ffInfo("-ss", String(from), "-t", String(to - from), "-i", file, "-af", "volumedetect"))?.[1] ?? NaN);
/** Both channels made their sum, as a phone speaker plays them. */
export const MONO = "pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,";

export const RATE = 11025;
/** A file's mono samples at 11.025 kHz, after `af`. */
export function pcm(file, af) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", file, ...(af ? ["-af", af] : []), "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}
/** Level (dB) of samples between two seconds. */
export function levelDb(x, a, b) {
  const i0 = Math.max(0, Math.round(a * RATE)), i1 = Math.min(x.length, Math.round(b * RATE));
  let s = 0;
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-12);
}

/** A file's tempo and first bar line, read by py/analyse.py from its drums (or from the whole file). */
export function tempoOf(python, file) {
  return JSON.parse(execFileSync(python, ["-I", "-c", `import json, sys
sys.path.insert(0, sys.argv[1])
import analyse
a = analyse.activity(sys.argv[2], "drums")
print(json.dumps(analyse.tempo(sys.argv[2], a["clips"][0]["start"] if a["clips"] else 0)))`, path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "py"), file]).toString());
}

/**
 * Pieces of files mixed onto the film's clock as one 48 kHz stereo float WAV, `length` + 2 s: each is `file` from
 * `from` for `length` s (or to its end) placed at `at`, with fades (`fadeIn`, `fadeOut` s), a gain in dB and an
 * optional filter after them.
 */
export function mix(out, parts, length) {
  const chains = parts.map((p, i) => {
    const fadeIn = p.fadeIn ?? 0.006, fadeOut = p.fadeOut ?? 0.012, ms = Math.round(p.at * 1000);
    const trim = `atrim=start=${p.from.toFixed(4)}${p.length != null ? `:duration=${p.length.toFixed(4)}` : ""}`;
    const tail = p.length != null ? `,afade=t=out:st=${Math.max(0, p.length - fadeOut).toFixed(4)}:d=${fadeOut}` : "";
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,${trim},asetpts=PTS-STARTPTS,afade=t=in:d=${fadeIn}${tail},`
      + `volume=${(p.gain ?? 0).toFixed(2)}dB${p.filter ? `,${p.filter}` : ""},adelay=${ms}|${ms}[c${i}]`;
  });
  return sum(out, parts.map((p) => p.file), chains, length);
}

/** Runs `chains` (one per input file, input i labelled [i:a], output [c<i>]) and sums them onto `length` + 2 s. */
export function sum(out, files, chains, length) {
  // timestamps rebuilt from the sample count before the trim: adelay can emit its lead-in without them, and a trim
  // on those cut a bed to a second of silence in the film where this method was built
  const graph = `${chains.join(";")};${files.map((_, i) => `[c${i}]`).join("")}amix=inputs=${files.length}:normalize=0:dropout_transition=0,`
    + `apad=pad_dur=3,asetpts=N/SR/TB,atrim=duration=${(length + 2).toFixed(3)}[o]`;
  ff(...files.flatMap((f) => ["-i", f]), "-filter_complex", graph, "-map", "[o]", "-c:a", "pcm_f32le", out);
  return out;
}

/**
 * Masters `bed` to `out` (48 kHz, 24-bit): trimmed to `length`, the last `fade` s faded, brought to `lufs` and
 * limited under −1.5 dB; then puts it on `film` as `filmOut` (AAC 256k, the picture copied). Returns the levels.
 */
export function master({ bed, scratch, out, length, lufs, fade, film, filmOut }) {
  ff("-i", bed, "-af", `atrim=0:${length.toFixed(3)}${fade ? `,afade=t=out:st=${(length - fade).toFixed(3)}:d=${fade}` : ""}`, "-c:a", "pcm_f32le", scratch);
  const gain = lufs - loudness(scratch).lufs, ceiling = 10 ** (-1.5 / 20);
  ff("-i", scratch, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=${ceiling.toFixed(4)}:level=false:attack=2:release=60`, "-ar", "48000", "-c:a", "pcm_s24le", out);
  ff("-i", film, "-i", out, "-map", "0:v:0", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", filmOut);
  const m = loudness(out);
  return { lufs: m.lufs, truePeak: m.peak, monoLossDb: +(m.lufs - loudness(out, MONO).lufs).toFixed(1) };
}
