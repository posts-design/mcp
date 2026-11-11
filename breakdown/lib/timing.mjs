// The film's clock and the timeline's scroll, as pure functions of time. A frame depends on its time alone, which is
// what lets frames render in any order on several workers.
import { T, easeInOut, easeOut, mix } from "./ease.mjs";
import { SCROLL } from "./layout.mjs";

/** The pull-back to the whole post takes 1.5 s; the whole post then holds `hold` seconds (the spec's default is HOLD). */
export const PULL_BACK = 1.5;
export const HOLD = 1.2;
/** The text reveal (closing line and act titles): each word rises a third of its size and fades in, 0.12 s after the one before. */
export const WORD_REVEAL = { stagger: 0.12, rise: 0.33, length: 0.5, fade: 0.3 };

/** When the timeline pulls back (pull.a → pull.b) and when the whole post streaks out into the end scene. */
export function schedule({ pullBack, hold }, duration) {
  const a = Math.min(duration, pullBack);
  return { pull: { a, b: a + PULL_BACK }, streakAt: a + PULL_BACK + hold };
}

/**
 * The end scene's clock, from when the streak has carried the post out (`revealAt`): the closing line's words
 * (`wordCounts`, one per line), then the lockup a beat after the last word settles, and the film's last frame.
 */
export function endSchedule(revealAt, wordCounts) {
  const lines = [revealAt - 0.2];
  if (wordCounts.length > 1) lines.push(lines[0] + wordCounts[0] * WORD_REVEAL.stagger);
  const settled = lines.at(-1) + (wordCounts.at(-1) - 1) * WORD_REVEAL.stagger + WORD_REVEAL.length;
  const lockAt = settled + 0.3;
  return { lines, lockAt, end: lockAt + 2.8 };
}

/**
 * The timeline's view at time t. While the post plays, the tracks scroll under a fixed playhead at `pxPerSecond`; from
 * pull.a to pull.b they ease out to the whole post fitted across the tracks (z goes 0 → 1). X maps post time to x.
 */
export function createView({ duration, pull, tl }) {
  const fit = (tl.x1 - tl.x0) / duration, pxs = SCROLL.pxPerSecond;
  return (t) => {
    const z = easeInOut(T(t, pull.a, pull.b)), tt = Math.min(t, duration);
    const X = (tc) => mix(tl.playhead + (tc - tt) * pxs, tl.x0 + tc * fit, z);
    return { z, tt, X, pxs: mix(pxs, fit, z), head: mix(tl.playhead, tl.x0 + tt * fit, z) };
  };
}

/** How lit a clip is at time t: 0 at rest, 1 while it sounds; a quick 60 ms attack and a slower 300 ms release. */
export function lit({ start, end }, t) {
  if (t < start - 0.06 || t > end + 0.3) return 0;
  if (t < start) return easeOut(T(t, start - 0.06, start));
  return t <= end ? 1 : 1 - easeOut(T(t, end, end + 0.3));
}

/** The bar and beat grid of a tempo, phased so that `anchor` (seconds) starts a bar. Times of the first bar and beat. */
export function beatGrid(bpm, anchor = 0) {
  const bar = 240 / bpm, beat = bar / 4;
  return { bar, beat, firstBar: anchor - Math.floor(anchor / bar) * bar, firstBeat: anchor - Math.floor(anchor / beat) * beat };
}

/** A bar anchor moved to the first bar start at or after 0 s (the same grid), to the millisecond. */
export function firstBarAt(anchor, bpm) {
  const bar = 240 / bpm;
  return Math.round(((anchor % bar) + bar) % bar * 1000) / 1000;
}

/** m:ss.d, the running time on the playhead. */
export const timecode = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s * 10) % 10)}`;

/** The act playing at post time t: the last that has started (the first before any has). */
export const actIndexAt = (acts, t) => Math.max(0, acts.findLastIndex((a) => t >= a.start));
