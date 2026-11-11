// The first spec prep.mjs writes from its measurements: every shot, clip and act is there, timed, with a placeholder
// name to replace by eye and ear. Pure, so what a draft contains is tested (test/draft.test.mjs).
import { MAX_LANES } from "./layout.mjs";
import { firstBarAt } from "./timing.mjs";

/** Names prep leaves for a person to replace; render warns while any remain. */
export const PLACEHOLDER = { shot: "Shot", clip: "Name by ear", words: "Words?", act: "Act title" };
/** A lane name for each stem a separator writes, in the order the lanes are drafted. */
export const STEM_NAMES = { vocals: "Vocals", drums: "Drums", bass: "Bass", guitar: "Guitar", piano: "Keys", other: "Synths & FX" };
/** A clip quieter than this (dB below full scale at its peak) is inaudible on a phone speaker and is left out. */
export const AUDIBLE_DB = -35;

const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;

/** Words grouped into phrases at pauses longer than `gap` seconds: { start, end, text }. */
export function phrases(words, gap = 0.6) {
  const out = [];
  for (const w of words) {
    const last = out.at(-1);
    if (last && w.start - last.end <= gap) Object.assign(last, { end: w.end, text: `${last.text} ${w.text}` });
    else out.push({ start: w.start, end: w.end, text: w.text });
  }
  return out;
}

/** The parts of `clips` that no span covers, at least `min` seconds long. */
export function uncovered(clips, spans, min = 0.5) {
  const out = [];
  for (const c of clips) {
    let from = c.start;
    for (const s of spans.filter((s) => s.end > c.start && s.start < c.end).sort((a, b) => a.start - b.start)) {
      if (s.start - from >= min) out.push({ ...c, start: from, end: s.start });
      from = Math.max(from, s.end);
    }
    if (c.end - from >= min) out.push({ ...c, start: from, end: c.end });
  }
  return out;
}

/** Joins clips whose gap is shorter than `gap` seconds: a pumping bass or a run of hits is one clip to name. */
export function joinClips(clips, gap) {
  const out = [];
  for (const c of clips) {
    const last = out.at(-1);
    if (last && c.start - last.end < gap) out[out.length - 1] = { ...last, end: c.end, peakDb: Math.max(last.peakDb, c.peakDb) };
    else out.push({ ...c });
  }
  return out;
}

/**
 * A draft spec from prep's analysis (analyse.py) and the vocal stem's words. Paths are relative to the spec's folder.
 */
export function draftSpec(analysis, words = [], { source, stems, avatar = null } = {}) {
  const bounds = [0, ...analysis.cuts.map((c) => c.t), analysis.duration];
  const shots = bounds.slice(0, -1).map((a, i) => [a, bounds[i + 1]]).filter(([a, b]) => b - a > 0.05)
    .map(([a, b], i) => [a, b, `${PLACEHOLDER.shot} ${i + 1}`]);
  const order = Object.keys(STEM_NAMES);
  const rank = (name) => (order.includes(name) ? order.indexOf(name) : order.length);
  const tempo = analysis.tempo, gap = tempo ? 60 / tempo.bpm : 0.3;   // a beat
  const lanes = Object.entries(analysis.stems)
    .filter(([, s]) => s.audible && s.clips.some((c) => c.peakDb > AUDIBLE_DB))
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, MAX_LANES)
    .map(([stem, s]) => ({
      name: STEM_NAMES[stem] ?? stem[0].toUpperCase() + stem.slice(1),
      stem,
      clips: stem === "vocals" ? vocalClips(s.clips.filter((c) => c.peakDb > AUDIBLE_DB), words)
        : joinClips(s.clips.filter((c) => c.peakDb > AUDIBLE_DB), gap).map((c) => [c.start, c.end, PLACEHOLDER.clip]),
    }));
  return {
    _note: "Drafted by prep.mjs. Name every shot, clip and act by eye and ear (prep/shots.jpg, prep/stems.png, prep/words.txt), merge or split the measured clips, drop what you can't hear, then add the end scene.",
    source, stems,
    ...(avatar ? { avatar } : {}),
    cover: r1(analysis.duration * 0.5),
    // the anchor is any bar's start; the first one at or after 0 (drums on the very first frame can measure just below)
    ...(tempo ? { bpm: tempo.bpm, barAnchor: firstBarAt(tempo.barAnchor, tempo.bpm) } : { ruler: "seconds" }),
    pullBack: Math.max(0.1, r1(analysis.duration - 2.5)),
    hold: 1.2,
    acts: [{ start: 0, title: PLACEHOLDER.act }],
    lanes, transitions: [], shots,
  };
}

/** Vocal clips: one per heard phrase, named with its words, and "Words?" where the stem sounds but nothing was heard. */
function vocalClips(active, words) {
  // a lone word can come back with no length; give it a tenth of a second
  const said = phrases(words).map((p) => ({ ...p, start: r2(p.start), end: Math.max(r2(p.end), r2(p.start) + 0.1) }));
  return [...said.map((p) => [p.start, p.end, p.text]), ...uncovered(active, said).map((c) => [c.start, c.end, PLACEHOLDER.words])]
    .sort((a, b) => a[0] - b[0]);
}

/** How many names in a spec are still prep's placeholders. */
export function placeholders(spec) {
  const shot = new RegExp(`^${PLACEHOLDER.shot} \\d+$`), left = new Set([PLACEHOLDER.clip, PLACEHOLDER.words, PLACEHOLDER.act]);
  return spec.shots.filter((s) => shot.test(s.name)).length
    + spec.lanes.reduce((n, l) => n + l.clips.filter((c) => left.has(c.label)).length, 0)
    + spec.acts.filter((a) => left.has(a.title)).length;
}
