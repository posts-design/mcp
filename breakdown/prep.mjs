#!/usr/bin/env node
// Prepares a film for a breakdown: separates its mix into stems, transcribes the vocal stem, measures shots, tempo and
// when each stem plays, draws sheets to name them by, and drafts the spec. Everything runs on this machine unless
// ELEVENLABS_API_KEY is set (Scribe then hears the words) or you choose ElevenLabs stems, which use the same key.
//
//   node prep.mjs <film.mp4> <folder> [options]
//     --stems demucs|elevenlabs|<folder>   how to separate the mix (default demucs; a folder uses stems you already have)
//     --words auto|whisper|elevenlabs|none how to hear the words on the vocal stem (default auto: none when the vocal
//                                          stem is silent, else Scribe when ELEVENLABS_API_KEY is set, else whisper)
//     --whisper-model small                faster-whisper model (large-v3-turbo hears more, a 1.6 GB download)
//     --language en                        the words' language, when whisper guesses wrong
//     --avatar <image>                     the brand's avatar or logo, shown bottom right
//     --python python3                     the Python with numpy (py/requirements.txt), and Demucs or faster-whisper
//                                          when they run here (py/requirements-demucs.txt, py/requirements-whisper.txt)
//
// It writes into <folder>: the film, stems/, prep/ (analysis.json, words.txt, shots.jpg, stems.png) and
// breakdown.json, the draft spec. A spec that already exists is never overwritten; re-running reuses the stems.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { draftSpec } from "./lib/draft.mjs";
import { readArgs, runCli } from "./lib/cli.mjs";
import { COLOR } from "./lib/layout.mjs";
import { audioFiles, probe, requireTools, sha12, stemFile } from "./lib/media.mjs";
import { FONT, esc, requireFont } from "./lib/svg.mjs";

const KIT = path.dirname(fileURLToPath(import.meta.url));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 ** 2 }).toString().trim();
/** Unzips stems flat into a folder: a zip that keeps them in a subfolder still gives <folder>/<name>.mp3. */
const UNZIP_FLAT = `
import os, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    for item in z.infolist():
        name = os.path.basename(item.filename)
        if name and not item.is_dir():
            with open(os.path.join(sys.argv[2], name), "wb") as f:
                f.write(z.read(item))
`;
/** A stem's name as a spec uses it: "Lead Vocals.wav" becomes lead-vocals. */
const stemName = (file) => path.parse(file).name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "stem";
const KEY = Boolean(process.env.ELEVENLABS_API_KEY);
/** Stops before a long step when the Python lacks a package it needs, saying how to install it or what to use instead. */
function requireModule(python, module, install) {
  try { execFileSync(python, ["-I", "-c", `import importlib.util, sys; sys.exit(importlib.util.find_spec("${module}") is None)`], { stdio: "ignore" }); }
  catch { throw new Error(`${python} has no ${module}. ${install} The README's "What it downloads" has the sizes.`); }
}

runCli(async () => {
  const { values, positionals: [input, folder] } = readArgs(process.argv.slice(2), ["stems", "words", "whisper-model", "language", "avatar", "python"]);
  if (!input || !folder) {
    console.error("usage: node prep.mjs <film.mp4> <folder> [--stems demucs|elevenlabs|<folder>] [--words auto|whisper|elevenlabs|none] [--whisper-model small] [--avatar <image>] [--python <path>]");
    process.exit(2);
  }
  const python = values.python ?? process.env.PYTHON ?? "python3", stemSource = values.stems ?? "demucs", wordSource = values.words ?? "auto";
  if (!["auto", "whisper", "elevenlabs", "none"].includes(wordSource)) throw new Error(`--words ${wordSource}: expected auto, whisper, elevenlabs or none`);
  requireTools();
  await requireFont();
  requireModule(python, "numpy", "Install it with pip install -r py/requirements.txt and pass that Python with --python.");
  const DIR = path.resolve(folder), PREP = path.join(DIR, "prep"), STEMS = path.join(DIR, "stems");
  mkdirSync(PREP, { recursive: true });
  const film = `film${path.extname(input).toLowerCase() || ".mp4"}`, SRC = path.join(DIR, film);
  // a folder holds one film's prep: its stems and words would be wrong for another
  const ID = path.join(PREP, "film.sha256"), id = await sha12(input);
  if (existsSync(ID) && readFileSync(ID, "utf8").trim() !== id) throw new Error(`${folder} holds another film's prep; use a new folder for this film`);
  writeFileSync(ID, `${id}\n`);
  if (path.resolve(input) !== SRC) copyFileSync(input, SRC);
  const info = probe(SRC);
  if (!info.audio) throw new Error(`${input} has no sound; a sound breakdown needs the film's own mix`);

  // ---------- stems ----------
  const haveStems = () => existsSync(STEMS) && audioFiles(STEMS).length > 0;
  if (haveStems()) console.log("reusing stems/ (delete it to separate again)");
  else {
    if (stemSource === "demucs") requireModule(python, "demucs", "Install it with pip install -r py/requirements-demucs.txt "
      + "--extra-index-url https://download.pytorch.org/whl/cpu, or use --stems elevenlabs (with ELEVENLABS_API_KEY set) or --stems <folder>.");
    if (KEY && !values.stems) console.log("ELEVENLABS_API_KEY is set: --stems elevenlabs separates with it instead of Demucs");
    mkdirSync(STEMS, { recursive: true });
    const mix = path.join(PREP, "mix.wav");
    run("ffmpeg", ["-v", "error", "-y", "-i", SRC, "-vn", "-ac", "2", "-ar", "44100", mix]);
    if (stemSource === "demucs") {
      // htdemucs_6s: drums, bass, vocals, guitar, piano, other
      console.log("separating stems with Demucs (a few minutes on a laptop CPU)…");
      const out = mkdtempSync(path.join(PREP, "demucs-"));   // beside the stems, so moving them never crosses disks
      execFileSync(python, ["-m", "demucs", "-n", "htdemucs_6s", "--mp3", "-o", out, mix], { stdio: "inherit" });
      const made = path.join(out, "htdemucs_6s", "mix");
      for (const f of readdirSync(made)) renameSync(path.join(made, f), path.join(STEMS, f));
      rmSync(out, { recursive: true, force: true });
    } else if (stemSource === "elevenlabs") {
      console.log("separating stems with ElevenLabs (uses your ELEVENLABS_API_KEY)…");
      const zip = path.join(PREP, "stems.zip");
      writeFileSync(zip, Buffer.from(await (await elevenlabs("/music/stem-separation?output_format=mp3_44100_192", mix)).arrayBuffer()));
      run(python, ["-I", "-c", UNZIP_FLAT, zip, STEMS]);
      rmSync(zip);
    } else {
      if (!existsSync(stemSource)) throw new Error(`--stems ${stemSource}: expected demucs, elevenlabs or a folder of stems`);
      for (const f of audioFiles(stemSource)) copyFileSync(path.join(stemSource, f), path.join(STEMS, f));
    }
    rmSync(mix, { force: true });
    if (!haveStems()) throw new Error(`no stems in ${STEMS}`);
    // one plainly named file per stem, so a spec can name it
    const files = audioFiles(STEMS), names = files.map(stemName);
    const twice = names.filter((n, i) => names.indexOf(n) !== i);
    if (twice.length) throw new Error(`two stems would both be called "${twice[0]}" in ${STEMS}; rename one`);
    files.forEach((f, i) => { const to = names[i] + path.extname(f).toLowerCase(); if (to !== f) renameSync(path.join(STEMS, f), path.join(STEMS, to)); });
  }
  const stemPath = (name) => stemFile(STEMS, name);
  const stems = audioFiles(STEMS);
  console.log(`stems: ${stems.join(", ")}`);

  // ---------- shots, tempo and stem activity ----------
  const ANALYSIS = path.join(PREP, "analysis.json");
  console.log(run(python, ["-I", path.join(KIT, "py/analyse.py"), SRC, String(info.fps), STEMS, ANALYSIS]));
  const A = JSON.parse(readFileSync(ANALYSIS, "utf8"));

  // ---------- words, from the vocal stem (the music buries sung words in the mix) ----------
  // auto: skip a silent vocal stem (no download, no call), use the person's key when they set one, else whisper here
  const WORDS = path.join(PREP, "words.json"), vocals = A.stems.vocals;
  const [hear, why] = existsSync(WORDS) ? ["none", "reusing prep/words.json (delete it to transcribe again)"]
    : !vocals ? ["none", "no vocal stem, so no words"]
    : wordSource !== "auto" ? [wordSource]
    : !vocals.audible ? ["none", "the vocal stem is silent, so no words (--words whisper or elevenlabs to transcribe it anyway)"]
    : KEY ? ["elevenlabs", "ELEVENLABS_API_KEY is set, so Scribe hears the words (--words whisper keeps them on this machine)"]
    : ["whisper"];
  if (why) console.log(why);
  if (hear === "whisper") {
    const model = values["whisper-model"] ?? "small";
    requireModule(python, "faster_whisper", "Install it with pip install -r py/requirements-whisper.txt and run prep again, "
      + `or ${KEY ? "use --words elevenlabs" : "set ELEVENLABS_API_KEY for Scribe"}, or --words none and name the vocals by ear.`);
    console.log(`transcribing the vocal stem with faster-whisper (${model})…`);
    execFileSync(python, ["-I", path.join(KIT, "py/words.py"), stemPath("vocals"), WORDS, "--model", model,
      ...(values.language ? ["--language", values.language] : [])], { stdio: "inherit" });
  } else if (hear === "elevenlabs") {
    console.log("transcribing the vocal stem with ElevenLabs Scribe…");
    const heard = await (await elevenlabs("/speech-to-text", stemPath("vocals"), { model_id: "scribe_v2", timestamps_granularity: "word" })).json();
    // Scribe gives a log-probability; keep the same field as whisper's probability
    const words = (heard.words ?? []).filter((w) => w.type === "word").map((w) => ({ start: w.start, end: w.end, text: w.text, probability: Math.round(Math.exp(w.logprob ?? 0) * 1000) / 1000 }));
    writeFileSync(WORDS, JSON.stringify({ words }, null, 1));
  }
  const words = existsSync(WORDS) ? JSON.parse(readFileSync(WORDS, "utf8")).words : [];
  // one line per word; "?" marks words the transcriber was unsure of (check them against the mix by ear)
  writeFileSync(path.join(PREP, "words.txt"), words.map((w) => `${w.start.toFixed(2)}\t${w.end.toFixed(2)}\t${w.text}${w.probability < 0.8 ? "\t?" : ""}`).join("\n") + "\n");
  const draft = draftSpec(A, words, { source: film, stems: "stems" });

  // ---------- contact sheet: each candidate shot's middle frame, with its number and start ----------
  const TW = 320, TH = Math.round((TW * info.height) / info.width), COLS = 6, BAR = 34;
  const sheet = draft.shots.map(([a, b], i) => {
    const frame = execFileSync("ffmpeg", ["-v", "error", "-ss", String((a + b) / 2), "-i", SRC, "-frames:v", "1", "-vf", `scale=${TW}:${TH}`, "-f", "image2pipe", "-vcodec", "png", "-"]);
    const soft = A.cuts.find((c) => c.t === a)?.kind === "soft" ? " soft" : "";
    const label = `<svg width="${TW}" height="${BAR}"><rect width="${TW}" height="${BAR}" fill="${COLOR.ground}"/><text x="8" y="24" font-family="${FONT}" font-size="19" fill="${COLOR.fg}">${i + 1} · ${a.toFixed(2)}s${soft}</text></svg>`;
    const x = (i % COLS) * TW, y = Math.floor(i / COLS) * (TH + BAR);
    return [{ input: Buffer.from(label), left: x, top: y }, { input: frame, left: x, top: y + BAR }];
  });
  await sharp({ create: { width: COLS * TW, height: Math.ceil(draft.shots.length / COLS) * (TH + BAR), channels: 3, background: COLOR.ground } })
    .composite(sheet.flat()).jpeg({ quality: 80 }).toFile(path.join(PREP, "shots.jpg"));

  // ---------- spectrograms: one row per stem on one time axis, the cuts over them (amber: soft) ----------
  const SW = 2400, SH = 220, names = Object.keys(A.stems), rowH = SH + 30, px = (s) => Math.round((s / A.duration) * SW);
  const grams = names.map((n) => execFileSync("ffmpeg", ["-v", "error", "-i", stemPath(n), "-lavfi", `showspectrumpic=s=${SW}x${SH}:legend=0:scale=log:fscale=log:color=intensity`, "-f", "image2pipe", "-vcodec", "png", "-"]));
  const overlay = `<svg width="${SW}" height="${names.length * rowH + 30}">`
    + A.cuts.map((c) => `<line x1="${px(c.t)}" x2="${px(c.t)}" y1="0" y2="${names.length * rowH}" stroke="${c.kind === "soft" ? "#ffb020" : "#ffffff"}" stroke-opacity="0.35" stroke-width="2"/>`).join("")
    + names.map((n, k) => `<text x="10" y="${k * rowH + 22}" font-family="${FONT}" font-size="20" fill="${COLOR.fg}">${esc(n)}  peak ${A.stems[n].peakDb} dB${A.stems[n].audible ? "" : " (inaudible)"}</text>`).join("")
    + Array.from({ length: Math.floor(A.duration / 5) + 1 }, (_, k) => `<text x="${px(k * 5) + 4}" y="${names.length * rowH + 22}" font-family="${FONT}" font-size="18" fill="${COLOR.muted}">${k * 5}s</text>`).join("")
    + "</svg>";
  await sharp({ create: { width: SW, height: names.length * rowH + 30, channels: 3, background: COLOR.ground } })
    .composite([...grams.map((input, k) => ({ input, left: 0, top: k * rowH + 30 })), { input: Buffer.from(overlay), left: 0, top: 0 }])
    .png().toFile(path.join(PREP, "stems.png"));

  // ---------- the draft spec ----------
  const SPEC = path.join(DIR, "breakdown.json");
  if (existsSync(SPEC)) console.log(`${SPEC} exists; left as is (the new measurements are in prep/; set "avatar" in it yourself)`);
  else {
    const avatar = values.avatar;
    if (avatar) { draft.avatar = `avatar${path.extname(avatar)}`; copyFileSync(avatar, path.join(DIR, draft.avatar)); }
    writeFileSync(SPEC, JSON.stringify(draft, null, 1) + "\n");
    console.log(`drafted ${SPEC}: ${draft.shots.length} shots, ${draft.lanes.length} tracks (${draft.lanes.map((l) => `${l.stem} ${l.clips.length}`).join(", ")})`);
  }
  console.log(`prep/: analysis.json, words.txt (${words.length} words), shots.jpg, stems.png. Next: name everything, then node render.mjs ${path.relative(process.cwd(), SPEC)} --stills …`);
});

/** One ElevenLabs request with the person's own key: a file upload, the response returned for reading. */
async function elevenlabs(endpoint, file, fields = {}) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("set ELEVENLABS_API_KEY to use ElevenLabs, or use --stems demucs / --words whisper or none");
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([readFileSync(file)]), path.basename(file));
  const res = await fetch(`https://api.elevenlabs.io/v1${endpoint}`, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs ${endpoint}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}
