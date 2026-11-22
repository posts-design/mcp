// Separating a mix into stems, shared by prep (a film's mix) and layer (a music track): Demucs on this machine,
// ElevenLabs with the person's own key, or a folder of stems they already have. Also the ElevenLabs requests both make.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { audioFiles } from "./media.mjs";

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
export const hasKey = () => Boolean(process.env.ELEVENLABS_API_KEY);

/** Stops before a long step when the Python lacks a package it needs, saying how to install it or what to use instead. */
export function requireModule(python, module, install) {
  try { execFileSync(python, ["-I", "-c", `import importlib.util, sys; sys.exit(importlib.util.find_spec("${module}") is None)`], { stdio: "ignore" }); }
  catch { throw new Error(`${python} has no ${module}. ${install} The README's "What it downloads" has the sizes.`); }
}

/**
 * Separates `input` (any file with sound) into `stems`, one plainly named file per stem, with `source` demucs,
 * elevenlabs or a folder of stems. Working files go in `work` under fixed names and are removed when the step ends,
 * so a stopped run's leftovers never pile up.
 */
export async function separate(input, stems, { source = "demucs", python, work }) {
  if (source === "demucs") requireModule(python, "demucs", "Install it with pip install -r py/requirements-demucs.txt "
    + "--extra-index-url https://download.pytorch.org/whl/cpu, or use --stems elevenlabs (with ELEVENLABS_API_KEY set) or --stems <folder>.");
  mkdirSync(stems, { recursive: true });
  const mix = path.join(work, "mix.wav"), out = path.join(work, "demucs"), zip = path.join(work, "stems.zip");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, "-vn", "-ac", "2", "-ar", "44100", mix], { stdio: ["ignore", "ignore", "inherit"] });
    if (source === "demucs") {
      // htdemucs_6s: drums, bass, vocals, guitar, piano, other; written beside the stems, so moving them never crosses disks.
      // WAV, not --mp3: its MP3s carry about 26 ms of encoder lead-in ffmpeg can't see, which put every stem late
      console.log("separating stems with Demucs (a few minutes on a laptop CPU)…");
      execFileSync(python, ["-m", "demucs", "-n", "htdemucs_6s", "-o", out, mix], { stdio: "inherit" });
      const made = path.join(out, "htdemucs_6s", "mix");
      for (const f of readdirSync(made)) renameSync(path.join(made, f), path.join(stems, f));
    } else if (source === "elevenlabs") {
      console.log("separating stems with ElevenLabs (uses your ELEVENLABS_API_KEY)…");
      writeFileSync(zip, Buffer.from(await (await elevenlabs("/music/stem-separation?output_format=mp3_44100_192", mix)).arrayBuffer()));
      execFileSync(python, ["-I", "-c", UNZIP_FLAT, zip, stems]);
    } else {
      if (!existsSync(source)) throw new Error(`--stems ${source}: expected demucs, elevenlabs or a folder of stems`);
      for (const f of audioFiles(source)) copyFileSync(path.join(source, f), path.join(stems, f));
    }
  } finally {
    for (const tmp of [mix, out, zip]) rmSync(tmp, { recursive: true, force: true });
  }
  if (!audioFiles(stems).length) throw new Error(`no stems in ${stems}`);
  // one plainly named file per stem, so a spec can name it
  const files = audioFiles(stems), names = files.map(stemName);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  if (twice.length) throw new Error(`two stems would both be called "${twice[0]}" in ${stems}; rename one`);
  files.forEach((f, i) => { const to = names[i] + path.extname(f).toLowerCase(); if (to !== f) renameSync(path.join(stems, f), path.join(stems, to)); });
}

/** An ElevenLabs file upload with the person's own key; the response returned for reading. */
export function elevenlabs(endpoint, file, fields = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([readFileSync(file)]), path.basename(file));
  return post(endpoint, form, {});
}

/** An ElevenLabs request with a JSON body, with the person's own key. */
export const elevenlabsJson = (endpoint, json) => post(endpoint, JSON.stringify(json), { "content-type": "application/json" });

async function post(endpoint, body, headers) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("set ELEVENLABS_API_KEY to use ElevenLabs, or choose the option that runs on this machine");
  const res = await fetch(`https://api.elevenlabs.io/v1${endpoint}`, { method: "POST", headers: { "xi-api-key": key, ...headers }, body });
  if (!res.ok) throw new Error(`ElevenLabs ${endpoint}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}
