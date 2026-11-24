// Layered sound, the pure part: where a music track's bars fall under a film, which stretch of the track plays where,
// and when each layer is heard. layer.mjs measures the track and runs ffmpeg with these.
//
// The arc: the melody alone in the first bar, hi-hats from the second, kick and bass in on the landing, out for about
// two bars of breath before the logo, back on the logo. Instruments change on the track's bar lines; the cut to the
// track's closing bars lands exactly on the logo, where the sting covers it.

/** Seconds of fade on a layer's window: in over 20 ms ending on its start, out over 80 ms from its end. */
export const FADE = { in: 0.02, out: 0.08 };

/**
 * The arc on the film's clock, given its length, the landing and logo marks (film s) and the track's bar (s). The film's
 * bar lines run through the landing. `beat` is where kick and bass play, `hats` where the high-passed drums play alone,
 * `opening` where the melody is lifted.
 */
export function arc({ length, land, logo, bar }) {
  if (!(land > 0 && land < logo && logo < length)) throw new Error(`the marks must fall inside the film in order: 0 < --land ${land} < --logo ${logo} < ${length.toFixed(2)} s`);
  const bars = Math.round((logo - land) / bar);
  if (bars < 2) throw new Error(`--logo ${logo} is less than two bars after --land ${land} (a bar of this track is ${bar.toFixed(2)} s): mark them further apart`);
  const breath = +(land + Math.max(1, bars - 2) * bar).toFixed(4);
  // hats join on the first bar line at least about a bar in, so the melody has its bar alone
  const first = land - Math.floor(land / bar) * bar;
  const hatsFrom = +(first >= 0.75 * bar ? first : first + bar).toFixed(4);
  return {
    land, logo, breath, bar,
    hats: hatsFrom < land - 0.05 ? [[hatsFrom, land]] : [],
    beat: [[land, breath], [logo, length + 2]],
    opening: [0, land],
  };
}

/** An ffmpeg volume expression in t: 1 inside `windows` ([[a, b], …] s), 0 outside, with FADE at the edges. */
export const windowGain = (windows) => windows == null ? "1"
  : windows.length === 0 ? "0"
  : `min(1,${windows.map(([a, b]) => `clip((t-${(a - FADE.in).toFixed(3)})/${FADE.in},0,1)*(1-clip((t-${b.toFixed(3)})/${FADE.out},0,1))`).join("+")})`;

/** The track's bar lines (track s), every `bar` through `anchor`, inside [0, duration). */
export function downbeats(anchor, bar, duration) {
  const out = [];
  for (let t = anchor - Math.floor(anchor / bar) * bar; t < duration; t += bar) out.push(+t.toFixed(4));
  return out;
}

/**
 * The track second that plays on the landing: the bar line with the biggest rise in low end over the bar before it (a
 * drop), among those that leave the landing's lead-in and the whole stretch to the logo inside the track, preferring
 * ones where the groove holds (every bar to the breath within 10 dB of the track's fullest). `barDb[i]` is the low
 * end's level over the bar from `beats[i]`.
 */
export function pickLanding({ beats, barDb, land, logo, breath, bar, duration }) {
  const holdBars = Math.max(1, Math.round((breath - land) / bar)), top = Math.max(...barDb);
  const fits = beats.map((d, i) => ({ d, i })).filter(({ d }) => d - land >= -1e-6 && d - land + logo <= duration + 1e-6);
  if (!fits.length) throw new Error(`the track is too short: it needs ${land.toFixed(1)} s before a bar line and ${(logo - land).toFixed(1)} s after it`);
  const rise = (i) => barDb[i] - (i > 0 ? barDb[i - 1] : -90);
  const holds = (i) => barDb.slice(i, i + holdBars).every((db) => db >= top - 10);
  const best = (list) => list.reduce((a, b) => (rise(b.i) > rise(a.i) ? b : a));
  const held = fits.filter(({ i }) => holds(i));
  return best(held.length ? held : fits).d;
}

/**
 * The track second that plays on the logo: the latest bar line from the landing on that leaves the rest of the film
 * (`rest` s) inside the track's sound, so its closing bars ring under the end; else the latest that fits at all.
 */
export function pickEnding({ beats, soundEnd, rest, after }) {
  const fit = beats.filter((d) => soundEnd - d >= rest - 1e-6);
  if (!fit.length) throw new Error(`the track is too short: its sound ends at ${soundEnd.toFixed(1)} s, and the film runs ${rest.toFixed(1)} s past the logo`);
  const late = fit.filter((d) => d >= after - 1e-6);
  return (late.length ? late : fit).at(-1);
}

/** The kick filtered out, for the one-track cut's opening and breath. */
export const NO_KICK = "highpass=f=320,lowshelf=f=500:g=-3";

/**
 * Pieces of the track on the film's clock: [{ from (track s), at (film s), length (s, null to the end), filter }]. The
 * track plays from `start` until the logo, then from `ending`, one piece when the track reaches the ending by itself.
 * With `oneTrack`, the opening and the breath are split off with the kick filtered out.
 */
export function pieces({ start, ending, arc: a, oneTrack = false }) {
  const joined = Math.abs(ending - (start + a.logo)) < 0.01;
  const source = (t) => (t < a.logo || joined ? start : ending - a.logo);   // track s = film s + offset
  const cuts = oneTrack ? [[0, a.land, NO_KICK], [a.land, a.breath, null], [a.breath, a.logo, NO_KICK], [a.logo, null, null]]
    : joined ? [[0, null, null]] : [[0, a.logo, null], [a.logo, null, null]];
  return cuts.map(([at, to, filter]) => ({ from: +(source(at) + at).toFixed(4), at, length: to == null ? null : +(to - at).toFixed(4), filter }));
}

/** When each accent plays (film s): a whoosh on the open, a hit on the landing, a riser ending on the logo, a sting on it. */
export const accentTimes = (a, riserSeconds) => ({ open: 0, hit: Math.max(0, a.land - 0.05), riser: Math.max(0, a.logo - riserSeconds), sting: a.logo });

/**
 * Where a voice speaks, as windows (s) from its level every `hop` s (`db`, dBFS), inside [0, `length`]: runs within
 * 30 dB of its speaking level (the 95th percentile, so one clap doesn't set it), joined across pauses under `gap`,
 * widened by `pad` either side so the music dips before the first word and returns after the last, dropping blips
 * shorter than `min`. None when the voice never rises above −60 dBFS.
 */
export function speechWindows(db, hop, { length = Infinity, floor = -30, gap = 0.5, pad = 0.15, min = 0.2 } = {}) {
  const ref = [...db].sort((a, b) => a - b)[Math.floor(db.length * 0.95)] ?? -Infinity, runs = [];
  if (!(ref > -60)) return [];
  db.forEach((v, i) => {
    if (v < ref + floor) return;
    const t = i * hop, last = runs.at(-1);
    if (last && t - last[1] <= gap) last[1] = t + hop; else runs.push([t, t + hop]);
  });
  return runs.filter(([a, b]) => b - a >= min && a < length).map(([a, b]) => [+Math.max(0, a - pad).toFixed(3), +Math.min(length, b + pad).toFixed(3)]);
}

/** An ffmpeg volume expression in t: 1, dipping by `dB` inside `windows` (the music under a voice). */
export const duckGain = (windows, dB) => windows.length ? `(1-${(1 - 10 ** (-Math.abs(dB) / 20)).toFixed(4)}*${windowGain(windows)})` : "1";
