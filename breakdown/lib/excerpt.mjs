// Shifting a spec into one stretch of its film (excerpt.mjs). Pure, so it is tested with the rest (test/excerpt.test.mjs).
import { firstBarAt } from "./timing.mjs";

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * The spec for film time [from, to], pulling back at `pull`: every time shifted by −from, items outside the stretch
 * dropped and items across an edge clipped to it. Names, stems and the end scene are kept. Takes and returns the
 * spec as written (tuples), not parseSpec's form.
 */
export function excerptSpec(raw, { from, pull, to, note }) {
  if (!(from < pull && pull < to)) throw new Error("excerpt: expected from < pull < to");
  const span = ([a, b, ...rest]) => (b <= from || a >= to ? null : [r3(Math.max(a, from) - from), r3(Math.min(b, to) - from), ...rest]);
  const keep = (items) => items.map(span).filter(Boolean);
  // an act runs until the next one starts
  const acts = raw.acts.map((a, i) => span([a.start, raw.acts[i + 1]?.start ?? Infinity, a.title])).filter(Boolean)
    .map(([start, , title]) => ({ start, title }));
  const out = {
    ...raw,
    _note: [note, raw._note].filter(Boolean).join(" "),
    cover: r3(raw.cover - from),
    pullBack: r3(pull - from),
    acts: acts.length ? acts : [{ start: 0, title: raw.acts[0].title }],
    lanes: raw.lanes.map((l) => ({ ...l, clips: keep(l.clips) })),
    shots: keep(raw.shots),
    transitions: (raw.transitions ?? []).filter((t) => t > from && t < to).map((t) => r3(t - from)),
  };
  if (raw.bpm) out.barAnchor = firstBarAt((raw.barAnchor ?? 0) - from, raw.bpm);
  if (!(out.cover >= 0 && out.cover < out.pullBack)) throw new Error(`excerpt: cover ${raw.cover} s is outside the stretch before the pull-back; set another cover first`);
  return out;
}
