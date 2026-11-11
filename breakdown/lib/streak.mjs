// Streak: a transition between two pictures. Rays shoot in from the left edge, one per band of rows, each with its own
// delay, speed and tapered tail, and carry picture A out; the bands stand for a moment; then each pulls away to the
// right on its own schedule and uncovers picture B line by line. Each band's colour comes from A's busiest column, so
// the streak is made of the picture it replaces. Pure JavaScript on raw RGB buffers, deterministic for a seed.
//
//   const streak = createStreak({ width, height, seed: 11 });
//   streak.setSource(fromRgb);                       // optional: take the band colours from this picture
//   out = streak.frame(t, fromRgb, toRgb);           // 0 ≤ t ≤ streak.duration

const STREAK_TIMING = { out: 0.45, hold: 0.25, in: 0.42 };

const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));
const cubicOut = (x) => 1 - (1 - x) ** 3;
const cubicInOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

/** Band colours of a picture: each row from a few columns around its busiest column, softened vertically. */
function streakTexture(rgb, width, height, seed = 7) {
  let col = Math.round(width / 2), best = -1;
  for (let x = Math.round(width * 0.1); x < width * 0.9; x += 4) {
    let sum = 0, sq = 0, n = 0;
    for (let y = 0; y < height; y += 2) { const o = (y * width + x) * 3, l = 0.3 * rgb[o] + 0.59 * rgb[o + 1] + 0.11 * rgb[o + 2]; sum += l; sq += l * l; n++; }
    const variance = sq / n - (sum / n) ** 2;
    if (variance > best) { best = variance; col = x; }
  }
  const raw = new Float32Array(height * 3);
  for (let y = 0; y < height; y++) for (let c = 0; c < 3; c++) {
    let acc = 0, n = 0;
    for (let dx = -6; dx <= 6; dx += 3) { const x = Math.max(0, Math.min(width - 1, col + dx)); acc += rgb[(y * width + x) * 3 + c]; n++; }
    raw[y * 3 + c] = acc / n;
  }
  const soften = (r) => {
    const out = new Float32Array(height * 3);
    for (let y = 0; y < height; y++) for (let c = 0; c < 3; c++) {
      let acc = 0, n = 0;
      for (let d = -r; d <= r; d++) { acc += raw[Math.max(0, Math.min(height - 1, y + d)) * 3 + c]; n++; }
      out[y * 3 + c] = acc / n;
    }
    return out;
  };
  const rnd = lcg(seed), bandOf = new Int16Array(height), bands = [];
  for (let y = 0; y < height;) {
    const h = 2 + Math.floor(rnd() * 14);
    bands.push({ delay: rnd() * 0.24, dur: 0.1 + rnd() * 0.2, outDelay: rnd() * 0.2, outDur: 0.1 + rnd() * 0.12,
      hot: rnd() < 0.25 ? 1.5 + rnd() * 0.6 : 1, phase: rnd() * 6.28 });
    for (let k = 0; k < h && y < height; k++, y++) bandOf[y] = bands.length - 1;
  }
  return { rows: soften(1), glow: soften(28), bandOf, bands };
}

/**
 * A Streak transition of the given size. `frame(t, from, to)` returns a new RGB buffer for time t (seconds):
 * out phase [0, out), hold [out, out+hold), in phase [out+hold, duration]. Pass `to` from the in phase on.
 * Options: seed (band layout), timing (override STREAK_TIMING), glow (0–1, default 0.3), dim (hold darkening, 0.14).
 */
export function createStreak({ width, height, seed = 7, timing = {}, glow = 0.3, dim = 0.14 }) {
  const T = { ...STREAK_TIMING, ...timing }, duration = T.out + T.hold + T.in;
  let tex = null;
  return {
    duration,
    timing: T,
    /** Use another picture's colours for the bands (otherwise the first `from` passed to frame()). */
    setSource(rgb) { tex = streakTexture(rgb, width, height, seed); },
    frame(t, from, to) {
      tex ??= streakTexture(from, width, height, seed);
      const out = Buffer.allocUnsafe(width * height * 3);
      const darken = 1 - dim * ramp(t, T.out, T.out + T.hold);
      if (t < T.out) {
        // rays from the left over a dim glow; each band on its own schedule (times scale with the out duration)
        const k = T.out / STREAK_TIMING.out, g = cubicOut(ramp(t, 0.02 * k, 0.3 * k)) * glow;
        for (let y = 0; y < height; y++) {
          const band = tex.bands[tex.bandOf[y]], p = cubicOut(ramp(t, band.delay * k, (band.delay + band.dur) * k));
          const L = p * width * 1.35, tail = 0.35 * L + 24, boost = band.hot + (1 - band.hot) * p * p;
          const r0 = Math.min(255, tex.rows[y * 3] * boost), g0 = Math.min(255, tex.rows[y * 3 + 1] * boost), b0 = Math.min(255, tex.rows[y * 3 + 2] * boost);
          const gr = tex.glow[y * 3], gg = tex.glow[y * 3 + 1], gb = tex.glow[y * 3 + 2];
          for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 3;
            let R = from[o] + (gr - from[o]) * g, G = from[o + 1] + (gg - from[o + 1]) * g, B = from[o + 2] + (gb - from[o + 2]) * g;
            const a = clamp01((L - x) / tail);
            if (a > 0) { R += (r0 - R) * a; G += (g0 - G) * a; B += (b0 - B) * a; }
            out[o] = R; out[o + 1] = G; out[o + 2] = B;
          }
        }
        return out;
      }
      // standing bands; from the in phase on, each band pulls away to the right on its own schedule
      const inAt = T.out + T.hold, entering = t >= inAt && to, k = T.in / STREAK_TIMING.in;
      for (let y = 0; y < height; y++) {
        const band = tex.bands[tex.bandOf[y]];
        const edge = entering ? width * 1.15 * cubicInOut(ramp(t, inAt + band.outDelay * k, inAt + (band.outDelay + band.outDur) * k)) : 0;
        const r0 = tex.rows[y * 3] * darken, g0 = tex.rows[y * 3 + 1] * darken, b0 = tex.rows[y * 3 + 2] * darken;
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 3, s = 1 + 0.05 * Math.sin(x / 110 + t * 2.4 + band.phase);
          const R = Math.min(255, r0 * s), G = Math.min(255, g0 * s), B = Math.min(255, b0 * s);
          // B shows only left of the edge, so a band that hasn't started yet shows none of it
          if (!entering || x >= edge) { out[o] = R; out[o + 1] = G; out[o + 2] = B; continue; }
          if (x < edge - 36) { out[o] = to[o]; out[o + 1] = to[o + 1]; out[o + 2] = to[o + 2]; continue; }
          const a = (x - edge + 36) / 36;   // soft leading end on the departing streak
          out[o] = to[o] + (R - to[o]) * a; out[o + 1] = to[o + 1] + (G - to[o + 1]) * a; out[o + 2] = to[o + 2] + (B - to[o + 2]) * a;
        }
      }
      return out;
    },
  };
}
