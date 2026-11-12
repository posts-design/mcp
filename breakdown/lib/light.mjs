// Ambient light: the playing picture lights the space around its window, as an ambient-light TV lights the wall
// behind it. Built for posts.design's GTA VI pre-loading breakdown with its owner (2026-11-11/12), who kept a light
// that is faint and complementary, never a second picture:
// - it comes off the picture's edges: each point outside takes the colour of the nearest stretch of the picture's
//   border, blurred along it, and leans on the broad colour more than the detail as it travels;
// - bright areas are capped before the colour is taken, so a sky, white type or a pale card don't lead and the light
//   takes the shot's deeper colours;
// - it falls off with distance (wide to the sides, a little upward), tapers over the picture's lower part and stops
//   above the timeline;
// - it drifts behind the picture: it rises over about 0.4 s and settles over about a second, from up to three seconds
//   of frames, so a cut eases in and a flash never strobes;
// - the film opens without it; it eases in from 1.5 s to full at 6 s;
// - colours mix in linear light, and a fixed, seeded grain keeps the gradients from banding (so any number of render
//   processes draws the same film).
// The pure parts (falloff, ramp) are tested in test/light.test.mjs.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { clamp } from "./ease.mjs";
import { cached } from "./media.mjs";

export const LIGHT = {
  max: 0.026, knee: 0.07, cap: 0.12, saturation: 1.2, neutral: 0.25,   // level: a low ceiling with a soft knee
  side: 105, up: 60, down: 85, floor: 16, taper: 150,                  // reach, px
  attack: 12, release: 30, memory: 90,                                 // drift, frames
  introFrom: 1.5, introTo: 6,                                          // seconds
  thumbW: 36, nearPasses: 3, farPasses: 16, cell: 6, grain: 1.6,
};

const LIN = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toSrgb = (l) => { const c = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const smooth = (q) => q * q * (3 - 2 * q);

/** 0 before the light starts, easing to 1 once it is full. */
export const introRamp = (t) => smooth(clamp(0, 1, (t - LIGHT.introFrom) / (LIGHT.introTo - LIGHT.introFrom)));

/**
 * How much light reaches the canvas point (px, py) from the picture `rect` (canvas coordinates), 0–1: an exponential
 * core with a gaussian tail, anisotropic (sides, up, down), tapering over the picture's lower part to nothing `floor`
 * px below it. Also returns the effective distance `d`, which the colour uses to lean on the blurred edge.
 */
export function falloff(px, py, rect) {
  const o = LIGHT;
  const dx = px < rect.x ? rect.x - px : px > rect.x + rect.w ? px - rect.x - rect.w : 0;
  const dy = py < rect.y ? rect.y - py : py > rect.y + rect.h ? py - rect.y - rect.h : 0;
  const d = Math.hypot(dx / o.side, dy / (py < rect.y ? o.up : o.down));
  let f = Math.exp(-1.15 * d - 0.42 * d * d);
  const from = rect.y + rect.h - o.taper, to = rect.y + rect.h + o.floor;
  if (py > from) f *= 1 - smooth(Math.min(1, (py - from) / (to - from)));
  return { f, d };
}

/** Box blur of an interleaved RGB float image, separable, radius `r`, `passes` times, in place; edges average what exists. */
function boxBlur(img, w, h, r, passes) {
  const tmp = new Float32Array(img.length);
  const line = (src, dst, n, at) => {
    for (let ch = 0; ch < 3; ch++) {
      let s = 0, m = 0;
      for (let i = -r; i < n + r; i++) {
        if (i + r < n) { s += src[at(i + r) + ch]; m++; }
        if (i - r - 1 >= 0) { s -= src[at(i - r - 1) + ch]; m--; }
        if (i >= 0 && i < n) dst[at(i) + ch] = s / m;
      }
    }
  };
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) line(img, tmp, w, (x) => (y * w + x) * 3);
    for (let x = 0; x < w; x++) line(tmp, img, h, (y) => (y * w + x) * 3);
  }
  return img;
}

/** A fixed noise table from a seeded generator (mulberry32), so every render process adds the same grain. */
function noiseTable(n) {
  let a = 7;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return Float32Array.from({ length: n }, () => next() - next());
}

/**
 * The light for a film. `frames` comes from filmFrames (frames at the window's size, by index); `pic` is the picture's
 * rect inside the window and `rect` the same on the canvas; `fps` the film's frame rate; `width` the canvas width.
 * `strength` scales the light (1 is the kept level). In a render worker `decode` is false and the thumbnails the
 * parent made are read. `at(t)` returns a layer to screen over the top of the frame (raw RGB, from y 0 down to just
 * above the timeline), or null before the light starts.
 */
export async function createLight({ frames, pic, rect, fps, width, strength = 1, decode = true }) {
  const o = LIGHT, max = o.max * strength;
  const TW = o.thumbW, TH = Math.max(8, Math.round(TW * pic.h / pic.w)), n = TW * TH * 3;
  // one small thumbnail of the picture per frame, made once by the parent and read by every render process
  const dir = `${frames.dir}-light-${TW}x${TH}`;
  if (decode && !existsSync(path.join(dir, "done"))) {
    const bufs = [];
    for (let i = 0; i < frames.count; i += 8) bufs.push(...await Promise.all(Array.from({ length: Math.min(8, frames.count - i) }, (_, k) =>
      sharp(frames.byIndex(i + k)).extract({ left: pic.x, top: pic.y, width: pic.w, height: pic.h }).resize(TW, TH, { kernel: "cubic" }).removeAlpha().raw().toBuffer())));
    cached(dir, (d) => writeFileSync(path.join(d, "thumbs.bin"), Buffer.concat(bufs)));
  }
  // in linear light, each pixel's brightness capped (hue kept), once for the whole film
  const bytes = readFileSync(path.join(dir, "thumbs.bin")), thumbs = new Float32Array(bytes.length);
  for (let p = 0; p < bytes.length; p += 3) {
    const r = LIN[bytes[p]], g = LIN[bytes[p + 1]], b = LIN[bytes[p + 2]], Y = luma(r, g, b), s = Y > o.cap ? o.cap / Y : 1;
    thumbs[p] = r * s; thumbs[p + 1] = g * s; thumbs[p + 2] = b * s;
  }

  // the field: one cell per `cell` px over the band above the timeline; each lit cell's falloff, how far it leans on
  // the blurred edge, and where it samples the picture, worked out once
  const FW = Math.ceil(width / o.cell), band = Math.ceil(rect.y + rect.h + o.floor + 24), FH = Math.ceil(band / o.cell);
  const cells = [];
  for (let gy = 0; gy < FH; gy++) for (let gx = 0; gx < FW; gx++) {
    const px = (gx + 0.5) * o.cell, py = (gy + 0.5) * o.cell, { f, d } = falloff(px, py, rect);
    if (f < 0.004) continue;
    const u = clamp(0, 1, (px - rect.x) / rect.w) * (TW - 1), v = clamp(0, 1, (py - rect.y) / rect.h) * (TH - 1);
    const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(TW - 1, x0 + 1), y1 = Math.min(TH - 1, y0 + 1), ax = u - x0, ay = v - y0;
    cells.push({ at: (gy * FW + gx) * 3, f, far: Math.min(1, 0.55 + d / 1.4),
      idx: [(y0 * TW + x0) * 3, (y0 * TW + x1) * 3, (y1 * TW + x0) * 3, (y1 * TW + x1) * 3], wt: [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay] });
  }
  const NOISE = noiseTable(1 << 20), MASK = (1 << 20) - 1;

  // the picture's light at frame i: fast and slow memories, the brighter per channel, blurred along the picture to a
  // near level and a far one
  function lightAt(i) {
    const fast = new Float32Array(n), slow = new Float32Array(n);
    let wf = 0, ws = 0;
    for (let k = 0; k <= o.memory && i - k >= 0; k++) {
      const a = Math.exp(-k / o.attack), b = Math.exp(-k / o.release), off = (i - k) * n;
      wf += a; ws += b;
      for (let p = 0; p < n; p++) { const x = thumbs[off + p]; fast[p] += a * x; slow[p] += b * x; }
    }
    for (let p = 0; p < n; p++) fast[p] = Math.max(fast[p] / wf, slow[p] / ws);
    const near = boxBlur(fast, TW, TH, 1, o.nearPasses).slice();
    return { near, far: boxBlur(fast, TW, TH, 1, o.farPasses - o.nearPasses) };
  }

  async function at(t) {
    const ramp = introRamp(t);
    if (ramp <= 0) return null;
    const img = lightAt(clamp(0, frames.count - 1, Math.floor(t * fps + 1e-6)));
    const field = new Float32Array(FW * FH * 3), c = [0, 0, 0];
    for (const cell of cells) {
      for (let ch = 0; ch < 3; ch++) {
        let a = 0, b = 0;
        for (let q = 0; q < 4; q++) { a += img.near[cell.idx[q] + ch] * cell.wt[q]; b += img.far[cell.idx[q] + ch] * cell.wt[q]; }
        c[ch] = a * (1 - cell.far) + b * cell.far;
      }
      const Y = luma(c[0], c[1], c[2]), mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), sat = mx > 1e-4 ? (mx - mn) / mx : 0;
      // a low ceiling with a soft knee: however bright the frame, the light stays a tint; neutral light dims further
      const k = Y > 1e-5 ? max / (Y + o.knee) * cell.f * ramp * (o.neutral + (1 - o.neutral) * Math.min(1, sat * 1.6)) : 0;
      for (let ch = 0; ch < 3; ch++) field[cell.at + ch] = Math.max(0, (Y + (c[ch] - Y) * o.saturation) * k);
    }
    boxBlur(field, FW, FH, 4, 2);
    const srgb = Buffer.alloc(field.length);
    for (let p = 0; p < field.length; p++) srgb[p] = toSrgb(field[p]);
    const raw = await sharp(srgb, { raw: { width: FW, height: FH, channels: 3 } }).resize(width, band, { kernel: "cubic", fit: "fill" }).blur(5).raw().toBuffer();
    const off = (Math.round(t * 30) * 7919) & MASK;
    for (let p = 0; p < raw.length; p++) { const x = raw[p] + NOISE[(off + p) & MASK] * o.grain; raw[p] = x < 0 ? 0 : x > 255 ? 255 : x; }
    return { input: raw, raw: { width, height: band, channels: 3 }, left: 0, top: 0, blend: "screen" };
  }
  return { at };
}
