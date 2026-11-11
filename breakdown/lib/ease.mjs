// Easing and interpolation, evaluated per frame so every render of a spec is the same.
//
// `cubicBezier` is Motion's (motion.dev, MIT), itself Gaëtan Renaudeau's BezierEasing (MIT) solved by binary
// subdivision only. It is copied rather than imported so the kit needs no animation library, and copied exactly so a
// film eases the same as one made with Motion.

const calcBezier = (t, a1, a2) => (((1.0 - 3.0 * a2 + 3.0 * a1) * t + (3.0 * a2 - 6.0 * a1)) * t + 3.0 * a1) * t;

function binarySubdivide(x, lower, upper, x1, x2) {
  let currentX, currentT, i = 0;
  do {
    currentT = lower + (upper - lower) / 2.0;
    currentX = calcBezier(currentT, x1, x2) - x;
    if (currentX > 0.0) upper = currentT;
    else lower = currentT;
  } while (Math.abs(currentX) > 0.0000001 && ++i < 12);
  return currentT;
}

/** A CSS-style cubic-bezier easing: 0..1 in, eased 0..1 out. */
export function cubicBezier(x1, y1, x2, y2) {
  if (x1 === y1 && x2 === y2) return (t) => t;
  return (t) => (t === 0 || t === 1 ? t : calcBezier(binarySubdivide(t, 0, 1, x1, x2), y1, y2));
}

/** posts.design's easing tokens: a quick start that settles softly, and a symmetric move. */
export const easeOut = cubicBezier(0.23, 1, 0.32, 1);
export const easeInOut = cubicBezier(0.77, 0, 0.175, 1);

export const clamp = (min, max, v) => (v > max ? max : v < min ? min : v);
export const mix = (from, to, p) => from + (to - from) * p;
/** Where `value` sits between `from` and `to`, unclamped (1 when the range is empty). */
export const progress = (from, to, value) => (to - from ? (value - from) / (to - from) : 1);
/** 0→1 over [a, b] seconds, clamped, then eased. */
export const T = (t, a, b, ease = (x) => x) => ease(clamp(0, 1, progress(a, b, t)));
