#!/usr/bin/env node
// Cuts a breakdown down to one stretch of its film, for networks that cap a video at 60 s (a breakdown runs its film
// plus about 7.5 s of pull-back and end scene).
//
//   node excerpt.mjs <breakdown.json> <folder> --from <s> --pull <s> --to <s> [--fade <s>]
//
// --from: where the excerpt starts (pick an edit and the start of a line). --pull: when the timeline pulls back, in
// the film's time; keep it under about 52 s after --from. --to: where the film's sound ends; it plays on under the
// streak and the end scene and fades out over the last --fade seconds (default 1.2), so it never stops mid-phrase.
// Writes <folder>/film.mp4, <folder>/stems/ and <folder>/breakdown.json with every time shifted into the excerpt and
// anything outside it dropped or clipped. Render it like any spec.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readArgs, runCli } from "./lib/cli.mjs";
import { excerptSpec } from "./lib/excerpt.mjs";
import { audioFiles, isUrl } from "./lib/media.mjs";
import { parseSpec } from "./lib/spec.mjs";

runCli(async () => {
  const { values, positionals: [specFile, folder] } = readArgs(process.argv.slice(2), ["from", "pull", "to", "fade"]);
  const from = Number(values.from), pull = Number(values.pull), to = Number(values.to), fade = Number(values.fade ?? 1.2);
  if (!specFile || !folder || ![from, pull, to, fade].every(Number.isFinite)) {
    console.error("usage: node excerpt.mjs <breakdown.json> <folder> --from <s> --pull <s> --to <s> [--fade <s>]");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(specFile, "utf8")), base = path.dirname(path.resolve(specFile)), at = (p) => path.resolve(base, p);
  parseSpec(raw);
  const DIR = path.resolve(folder), OUT = path.join(DIR, "breakdown.json");
  if (existsSync(OUT)) throw new Error(`${OUT} exists; delete it to cut again`);
  // the times first, so a bad stretch stops before any encoding
  const out = excerptSpec(raw, { from, pull, to, note: `Excerpt of ${path.basename(specFile)}, film time ${from}–${to} s, sound fading over the last ${fade} s.` });
  mkdirSync(path.join(DIR, "stems"), { recursive: true });
  const length = to - from;

  // the film, re-encoded near-losslessly (the renderer samples its frames), its sound faded out at the end
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(from), "-i", at(raw.source), "-t", String(length), "-c:v", "libx264", "-preset", "slow", "-crf", "10",
    "-pix_fmt", "yuv420p", "-af", `afade=t=out:st=${(length - fade).toFixed(3)}:d=${fade}`, "-c:a", "aac", "-b:a", "320k", path.join(DIR, "film.mp4")]);
  // the stems, trimmed the same way without the fade, so their clips draw as they do in the full film
  for (const f of audioFiles(at(raw.stems)))
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(from), "-i", path.join(at(raw.stems), f), "-t", String(length), "-c:a", "libmp3lame", "-b:a", "320k",
      path.join(DIR, "stems", `${path.parse(f).name}.mp3`)]);

  // the end scene's posts and the avatar keep pointing where they were
  const rebase = (p) => (isUrl(p) ? p : path.relative(DIR, at(p)));
  Object.assign(out, { source: "film.mp4", stems: "stems", ...(raw.avatar ? { avatar: rebase(raw.avatar) } : {}) });
  if (raw.end) out.end = { ...raw.end, posts: raw.end.posts.map((p) => (Array.isArray(p) ? [rebase(p[0]), p[1]] : rebase(p))) };
  parseSpec(out);
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`excerpt ${OUT}: ${length.toFixed(2)} s of film, ${out.shots.length} shots, ${out.lanes.reduce((n, l) => n + l.clips.length, 0)} clips, ${out.acts.length} acts`);
});
