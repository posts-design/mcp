#!/usr/bin/env node
// Scores a film in layers from a music track you made or have the rights to: the track is split into stems and cut to
// the film on its bar lines, and the instruments enter and leave with the story. The melody plays alone in the first
// bar, hi-hats join from the second, kick and bass land on --land with a hit, step out for about two bars with a riser,
// and come back on --logo with a sting, over the track's closing bars. The opening sits about 6 dB under the landing
// in the finished mix, which is mastered to −16 LUFS.
//
//   node layer.mjs <film.mp4> <music> <folder> --land <s> --logo <s> [options]
//     --land s, --logo s                film seconds: where kick and bass land, and the logo or end card. Leave both
//                                       out to get the film's shot boundaries (marks.jpg) and the track's bar length
//     --stems scnet|demucs|elevenlabs|<folder> how to split the track (default scnet, the cleanest; demucs is about
//                                       8 times faster; elevenlabs uses ELEVENLABS_API_KEY)
//     --open f --hit f --riser f --sting f  accent sounds of your own: a whoosh on the open, a hit on the landing, a
//                                       riser ending on the logo, a sting on it (any of them)
//     --accents elevenlabs              make the four accents with ElevenLabs sound effects on your key, kept in
//                                       <folder>/accents/ and reused
//     --no-accents                      no accents
//     --voice film|<file>               a voice-over or dialogue to keep, on the film's clock: the film's own sound
//                                       (when it is voice alone) or a file; the music dips 12 dB while it speaks
//     --lufs -16                        the master's loudness (default −16; −14 for a YouTube- or TikTok-first film)
//     --one-track                       the whole track, with the kick filtered out of the opening and the breath
//                                       (no stems)
//     --landing s, --ending s           the track seconds that play on the landing and on the logo, used exactly,
//                                       when the picked ones don't suit (put them on the track's bar lines; a track
//                                       already cut to the film plays as is with --landing = --land, --ending = --logo)
//     --python python3                  the Python with numpy, and PyTorch (scnet) or Demucs (demucs) for the stems
//
// It writes into <folder>: stems/ (the track's, reused on a rerun), layered.wav (the mix), <film>-layered.mp4 (the
// film with it) and receipt.json (marks, tempo, the cut, stems, accents, the voice, levels, and how much of the mix a
// phone speaker's mono loses).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { RATE, levelDb, loudness, master, meanDb, mix, pcm, seconds, sum, tempoOf } from "./lib/audio.mjs";
import { readArgs, runCli } from "./lib/cli.mjs";
import { accentTimes, arc as arcOf, downbeats, duckGain, pickEnding, pickLanding, pieces, speechWindows, windowGain } from "./lib/layer.mjs";
import { COLOR } from "./lib/layout.mjs";
import { audioFiles, probe, requireTools, sha12 } from "./lib/media.mjs";
import { DEFAULT_STEMS, splitTrack } from "./lib/scnet.mjs";
import { elevenlabsJson, requireModule } from "./lib/stems.mjs";
import { FONT, esc } from "./lib/svg.mjs";

const KIT = path.dirname(fileURLToPath(import.meta.url));
// Where each accent sits, in LU against the music's own loudness (from a mix approved by ear).
const ACCENT_LU = { open: -11, hit: -7.5, riser: -4.5, sting: -9 };
const ACCENT_PROMPTS = {
  open: [1.2, "Airy soft whoosh rising upward, clean and modern, no impact"],
  hit: [1.6, "One clean deep sub bass hit with a short punchy thump, modern, no reverb tail"],
  riser: [2, "Electro house white noise riser building over two seconds to a sudden cut, filtered sweep upward, no impact at the end"],
  sting: [1.6, "Short bright electronic logo sting: one punchy filtered synth stab with a clean sub thump and a short shimmering tail, modern, no melody"],
};
const MELODY_LIFT_TARGET = 4.5;
// a voice sits 1 LU over the track before the arc, and the music dips 12 dB under it: the voice about 13 dB clear
const VOICE_LU = 1, DUCK_DB = 12;
runCli(async () => {
  const { values, positionals: [film, music, folder] } = readArgs(process.argv.slice(2),
    ["land", "logo", "stems", "open", "hit", "riser", "sting", "accents", "landing", "ending", "voice", "lufs", "python"], ["no-accents", "one-track"]);
  if (!film || !music || !folder) {
    console.error("usage: node layer.mjs <film.mp4> <music> <folder> --land <s> --logo <s> [--stems scnet|demucs|elevenlabs|<folder>]\n"
      + "         [--open f --hit f --riser f --sting f | --accents elevenlabs | --no-accents] [--voice film|<file>] [--lufs -16]\n"
      + "         [--one-track] [--landing s] [--ending s] [--python <path>]");
    process.exit(2);
  }
  const python = values.python ?? process.env.PYTHON ?? "python3", oneTrack = values["one-track"];
  if ((values.land == null) !== (values.logo == null)) throw new Error("give both --land and --logo, or neither to see the film's boundaries first");
  const TARGET_LUFS = Number(values.lufs ?? -16);
  if (!(TARGET_LUFS >= -24 && TARGET_LUFS <= -9)) throw new Error(`--lufs ${values.lufs}: expected a loudness from -24 to -9`);
  if (values.accents && values.accents !== "elevenlabs") throw new Error(`--accents ${values.accents}: expected elevenlabs (or --open, --hit, --riser, --sting with your own files)`);
  requireTools();
  requireModule(python, "numpy", "Install it with pip install -r py/requirements.txt and pass that Python with --python.");
  const DIR = path.resolve(folder), STEMS = path.join(DIR, "stems");
  mkdirSync(DIR, { recursive: true });
  const info = probe(film), LENGTH = info.duration, TRACK = seconds(music);
  // a folder holds one track's stems: they would be wrong for another
  const ID = path.join(DIR, "music.sha256"), id = await sha12(music);
  if (existsSync(ID) && readFileSync(ID, "utf8").trim() !== id) throw new Error(`${folder} holds another track's stems; use a new folder for this track`);
  writeFileSync(ID, `${id}\n`);

  // ---------- stems and tempo ----------
  if (!oneTrack) {
    if (existsSync(STEMS) && audioFiles(STEMS).length) console.log("reusing stems/ (delete it to separate again)");
    else await splitTrack(music, STEMS, { source: values.stems ?? DEFAULT_STEMS, python, work: DIR });
  }
  const stems = existsSync(STEMS) ? Object.fromEntries(audioFiles(STEMS).map((f) => [path.parse(f).name, path.join(STEMS, f)])) : {};
  // the tempo from the drum stem when there is one (kick and bass set the downbeat), else from the whole track
  const tempo = tempoOf(python, stems.drums ?? music);
  const BAR = 4 * 60 / tempo.bpm;
  console.log(`track: ${TRACK.toFixed(1)} s at ${tempo.bpm} BPM, a bar every ${BAR.toFixed(3)} s from ${tempo.barAnchor} s`);

  if (values.land == null) return proposeMarks(film, info, DIR, python, BAR);

  // ---------- the arc and the cut ----------
  const land = Number(values.land), logo = Number(values.logo);
  const A = arcOf({ length: LENGTH, land, logo, bar: BAR });
  // a pin is used exactly: the bar grid is measured and can sit a beat off on a mix
  const beats = downbeats(tempo.barAnchor, BAR, TRACK);
  const low = pcm(music, "lowpass=f=150"), full = pcm(music);
  const landing = values.landing != null ? Number(values.landing)
    : pickLanding({ beats, barDb: beats.map((d) => levelDb(low, d, d + BAR)), land, logo, breath: A.breath, bar: BAR, duration: TRACK });
  if (landing < land - 1e-6) throw new Error(`--landing ${landing} leaves less than ${land} s of the track before it`);
  // where the track's sound ends: the last 50 ms within 45 dB of its loudest
  const win = Array.from({ length: Math.floor(TRACK / 0.05) }, (_, k) => levelDb(full, k * 0.05, (k + 1) * 0.05)), loud = Math.max(...win);
  const soundEnd = (win.findLastIndex((db) => db > loud - 45) + 1) * 0.05;
  const ending = values.ending != null ? Number(values.ending) : pickEnding({ beats, soundEnd, rest: LENGTH - logo, after: landing });
  const start = landing - land, plan = pieces({ start, ending, arc: A, oneTrack });
  if (start + logo > TRACK + 1e-6) throw new Error(`the track ends before the logo when it plays from ${start.toFixed(2)} s; pass an earlier --landing`);
  console.log(`the track plays from ${start.toFixed(2)} s, ${landing.toFixed(2)} s on the landing, then from ${ending.toFixed(2)} s on the logo`);

  // ---------- accents ----------
  const ACC = path.join(DIR, "accents");
  const accentFile = async (name) => {
    if (values["no-accents"]) return null;
    if (values[name]) return path.resolve(values[name]);
    if (values.accents !== "elevenlabs") return null;
    const file = path.join(ACC, `${name}.mp3`);
    if (!existsSync(file)) {
      mkdirSync(ACC, { recursive: true });
      const [duration_seconds, text] = ACCENT_PROMPTS[name];
      console.log(`making the ${name} accent with ElevenLabs sound effects…`);
      const res = await elevenlabsJson("/sound-generation", { text, duration_seconds, prompt_influence: 0.5 });
      writeFileSync(`${file}.part`, Buffer.from(await res.arrayBuffer()));
      renameSync(`${file}.part`, file);
    }
    return file;
  };
  const level = loudness(music).lufs, GAIN = -15 - level;   // the track at about −15 LUFS before the arc
  const files = Object.fromEntries(await Promise.all(Object.keys(ACCENT_LU).map(async (k) => [k, await accentFile(k)])));
  const at = accentTimes(A, files.riser ? seconds(files.riser) : 0);
  const accents = Object.entries(files).filter(([, f]) => f).map(([k, file]) => ({ name: k, file, at: +at[k].toFixed(3), gain: +(-15 + ACCENT_LU[k] - loudness(file).lufs).toFixed(2) }));

  // ---------- a voice: the music dips while it speaks, the accents don't ----------
  let voice = null;
  if (values.voice) {
    const src = values.voice === "film" ? film : path.resolve(values.voice);
    if (values.voice === "film" && !info.audio) throw new Error(`--voice film: ${film} has no sound`);
    const x = pcm(src), levels = Array.from({ length: Math.floor(x.length / RATE / 0.05) }, (_, k) => levelDb(x, k * 0.05, (k + 1) * 0.05));
    const speech = speechWindows(levels, 0.05, { length: LENGTH });
    if (!speech.length) throw new Error(`--voice ${values.voice}: no speech found in it within the film`);
    voice = { file: src, gainDb: +(-15 + VOICE_LU - loudness(src).lufs).toFixed(2), duckDb: DUCK_DB, speech };
  }
  const ducked = (layers, withVoice = true) => !voice || !withVoice ? layers
    : [...layers.map((l) => ({ ...l, duck: voice.speech })), { file: voice.file, gain: voice.gainDb }];

  // ---------- the bed ----------
  // working files go in one folder, removed when the mix is done
  const WORK = path.join(DIR, "mixing"), bed = path.join(WORK, "bed.wav");
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK);
  let lift = null;
  if (oneTrack) {
    const whole = mix(path.join(WORK, "track.wav"), plan.map((p) => ({ ...p, file: music, gain: GAIN + (p.filter ? 4 : 0), fadeIn: p.at === 0 ? 0.25 : undefined })), LENGTH);
    layered(bed, ducked([{ file: whole }]), accents, LENGTH);
  } else {
    const names = Object.keys(stems), melody = names.filter((s) => !["drums", "bass"].includes(s));
    if (!names.includes("drums") || !names.includes("bass") || !melody.length) throw new Error(`layering needs drums, bass and a melody stem; ${STEMS} has ${names.join(", ")} (try --one-track)`);
    const beds = Object.fromEntries(names.map((s) => [s, mix(path.join(WORK, `${s}.wav`), plan.map((p) => ({ ...p, file: stems[s], gain: GAIN })), LENGTH)]));
    // a separator can file a whole melody under drums or bass (Demucs did on a filter house take): the arc would open on silence
    const level = (names) => Math.max(...names.map((s) => meanDb(beds[s], 0, LENGTH)));
    const gap = level(["drums", "bass"]) - level(melody);
    if (gap > 30) throw new Error(`the melody stems are ${gap.toFixed(0)} dB under the drums and bass: the separation put the melody in them. Use --one-track, or split again with another --stems source in a new folder`);
    const build = (dB, withVoice) => layered(bed, ducked([
      { file: beds.drums, windows: A.beat }, { file: beds.bass, windows: A.beat },
      ...(A.hats.length ? [{ file: beds.drums, windows: A.hats, gain: 4, filter: "highpass=f=5000,highpass=f=5000" }] : []),
      ...melody.map((s) => ({ file: beds[s], boost: [[...A.opening, dB]] })),
    ], withVoice), accents, LENGTH);
    build(0, false);
    // lift the melody until the opening sits 4.5 dB under the landing (about 6 under once mastered)
    lift = +Math.min(12, Math.max(0, meanDb(bed, land, A.breath) - MELODY_LIFT_TARGET - meanDb(bed, 0, land))).toFixed(1);
    build(lift, true);
  }
  // ---------- master: −16 LUFS (or --lufs), peaks under −1.5 dB, the last half second faded ----------
  const out = path.join(DIR, "layered.wav"), filmOut = path.join(DIR, `${path.parse(film).name}-layered.mp4`);
  const mastered = master({ bed, scratch: path.join(WORK, "premix.wav"), out, length: LENGTH, lufs: TARGET_LUFS, fade: 0.5, film, filmOut });
  rmSync(WORK, { recursive: true, force: true });

  const r = (n) => +n.toFixed(1);
  const levels = { opening: r(meanDb(out, 0, land)), landing: r(meanDb(out, land, A.breath)), breath: r(meanDb(out, A.breath, logo)), logo: r(meanDb(out, logo, LENGTH)), ...mastered };
  const receipt = {
    film: path.basename(film), music: path.basename(music), length: +LENGTH.toFixed(3),
    marks: { land, logo, breath: A.breath, hatsFrom: A.hats[0]?.[0] ?? null },
    tempo: { bpm: tempo.bpm, bar: +BAR.toFixed(4), barAnchor: tempo.barAnchor },
    cut: { start: +start.toFixed(4), landing, ending, pieces: plan },
    mode: oneTrack ? "one-track" : "layered", stems: oneTrack ? [] : Object.keys(stems), stemSource: oneTrack ? null : values.stems ?? DEFAULT_STEMS, melodyLiftDb: lift,
    accents: accents.map(({ name, file, at: t, gain: g }) => ({ name, file: path.basename(file), at: t, gainDb: g })),
    voice: voice && { ...voice, file: path.basename(voice.file) }, levels,
    files: { mix: path.basename(out), film: path.basename(filmOut) },
  };
  writeFileSync(path.join(DIR, "receipt.json"), JSON.stringify(receipt, null, 1) + "\n");
  console.log(`wrote ${filmOut} and layered.wav: ${levels.lufs} LUFS, peak ${levels.truePeak} dB; `
    + `opening ${levels.opening}, landing ${levels.landing}, breath ${levels.breath}, logo ${levels.logo} dB; mono loses ${levels.monoLossDb} dB`);
  // wide pads lose about 3 dB in mono; more means parts of the mix cancel on a phone speaker
  if (Math.abs(levels.lufs - TARGET_LUFS) > 1) console.log(`warning: the mix reached ${levels.lufs} LUFS, not ${TARGET_LUFS}: the limiter holds its peaks; aim quieter`);
  if (levels.monoLossDb > 4) console.log(`warning: the mix loses ${levels.monoLossDb} dB on a phone speaker (mono); try --one-track or another track`);
});

/** The film's shot boundaries as a contact sheet, marks.jpg, with the bar length, so the person can pick the marks. */
async function proposeMarks(film, info, DIR, python, bar) {
  const empty = path.join(DIR, "no-stems"), out = path.join(DIR, "shots.json");
  mkdirSync(empty, { recursive: true });
  try { execFileSync(python, ["-I", path.join(KIT, "py/analyse.py"), film, String(info.fps), empty, out], { stdio: ["ignore", "ignore", "inherit"] }); }
  finally { rmSync(empty, { recursive: true, force: true }); }
  const cuts = JSON.parse(readFileSync(out, "utf8")).cuts;
  rmSync(out);
  const TW = 320, TH = Math.round((TW * info.height) / info.width), COLS = 6, LABEL = 34;
  if (!cuts.length) throw new Error(`no shot boundaries found in ${film}; choose --land and --logo by watching it`);
  const tiles = cuts.map((c, i) => {
    const frame = execFileSync("ffmpeg", ["-v", "error", "-ss", String(c.t + 0.1), "-i", film, "-frames:v", "1", "-vf", `scale=${TW}:${TH}`, "-f", "image2pipe", "-vcodec", "png", "-"]);
    const label = `<svg width="${TW}" height="${LABEL}"><rect width="${TW}" height="${LABEL}" fill="${COLOR.ground}"/>`
      + `<text x="8" y="24" font-family="${FONT}" font-size="19" fill="${COLOR.fg}">${esc(`${i + 1} · ${c.t.toFixed(2)}s${c.kind === "soft" ? " soft" : ""}`)}</text></svg>`;
    const x = (i % COLS) * TW, y = Math.floor(i / COLS) * (TH + LABEL);
    return [{ input: Buffer.from(label), left: x, top: y }, { input: frame, left: x, top: y + LABEL }];
  });
  await sharp({ create: { width: COLS * TW, height: Math.ceil(cuts.length / COLS) * (TH + LABEL), channels: 3, background: COLOR.ground } })
    .composite(tiles.flat()).jpeg({ quality: 80 }).toFile(path.join(DIR, "marks.jpg"));
  console.log(`${cuts.length} boundaries: ${cuts.map((c) => `${c.t.toFixed(2)}${c.kind === "soft" ? " soft" : ""}`).join(", ")}`);
  console.log(`marks.jpg shows the frame after each. Pick --land (where the film turns: kick and bass come in) and --logo `
    + `(the logo or end card), at least ${(2 * bar).toFixed(1)} s apart, then run again with both.`);
}

/**
 * The layered bed: `layers` [{ file, windows (audible only inside; none for throughout), gain dB, boost [[a, b, dB]],
 * duck (windows where it dips DUCK_DB), filter }] on the film's clock, and `accents` [{ file, at, gain dB }], summed onto `length` + 2 s.
 */
function layered(out, layers, accents, length) {
  const chains = layers.map((l, i) => {
    const boost = (l.boost ?? []).map(([a, b, db]) => `if(between(t,${a},${b}),${(10 ** (db / 20)).toFixed(4)},1)`).join("*") || "1";
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo${l.filter ? `,${l.filter}` : ""},`
      + `volume='${windowGain(l.windows)}*${duckGain(l.duck ?? [], DUCK_DB)}*${boost}*${(10 ** ((l.gain ?? 0) / 20)).toFixed(4)}':eval=frame[c${i}]`;
  }).concat(accents.map((a, j) => {
    const i = layers.length + j, ms = Math.round(a.at * 1000);
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${a.gain.toFixed(2)}dB,adelay=${ms}|${ms}[c${i}]`;
  }));
  return sum(out, [...layers, ...accents].map((x) => x.file), chains, length);
}
