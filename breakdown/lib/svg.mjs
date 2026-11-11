// SVG building blocks. Every frame is drawn as one SVG string and rasterised by sharp (librsvg), so text is measured
// the same way it is drawn: rendered, trimmed and read back. Type is Inter throughout.
import sharp from "sharp";
import { easeOut } from "./ease.mjs";
import { COLOR } from "./layout.mjs";
import { WORD_REVEAL } from "./timing.mjs";

/** Inter as installed from rsms.me or Google Fonts (static "Inter"), or Inter 4's variable font ("Inter Variable"). */
export const FONT = "Inter, Inter Variable";
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
export const f2 = (n) => Math.round(n * 100) / 100;
let uid = 0;
/** A unique SVG id (clips, gradients) within this process. */
export const nextId = (prefix = "fx") => `${prefix}${uid++}`;

/** One line of text. `ls` is letter-spacing in em. */
export function text(x, y, s, { size, weight = 400, fill = COLOR.fg, anchor = "start", ls = 0, opacity = 1 }) {
  return `<text x="${f2(x)}" y="${f2(y)}" font-family="${FONT}" font-size="${f2(size)}" font-weight="${weight}" letter-spacing="${f2(ls * size)}" text-anchor="${anchor}" fill="${fill}" opacity="${f2(opacity)}">${esc(s)}</text>`;
}

/** The ink box of an SVG fragment drawn at (originX, originY): its left and top relative to that origin, and its size. */
export async function inkBox(inner, { originX = 100, originY = 400, width = 4000, height = 900 } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000"/>${inner}</svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return { left: -info.trimOffsetLeft - originX, top: -info.trimOffsetTop - originY, width: info.width, height: info.height };
}

async function inkWidth(inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="600"><rect width="4000" height="600" fill="#000"/>${inner}</svg>`;
  return (await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true })).info.width;
}

const labelWidths = new Map();
/** Ink width of a label in px; `tracking` is letter-spacing in px, as the timeline's labels set it. Cached. */
export async function labelWidth(s, size, weight = 500, tracking = 0) {
  const key = `${s}|${size}|${weight}|${tracking}`;
  if (!labelWidths.has(key)) {
    const svg = `<svg width="2400" height="${size * 3}"><text x="10" y="${size * 2}" font-family="${FONT}" font-weight="${weight}" letter-spacing="${tracking}" font-size="${size}" fill="#000">${esc(s)}</text></svg>`;
    labelWidths.set(key, (await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true })).info.width);
  }
  return labelWidths.get(key);
}

/** Fails early when Inter is missing: librsvg would fall back to another face and every label would be measured wrong. */
export async function requireFont() {
  const probe = (family) => `<text x="40" y="400" font-family="${family}" font-size="100" fill="#fff">Breakdown 0123</text>`;
  if ((await inkWidth(probe(FONT))) === (await inkWidth(probe("no-such-font-family")))) {
    throw new Error("The Inter font is not installed. Install it (https://rsms.me/inter/) and run again.");
  }
}

/** A rounded image card centred on (cx, cy). */
export function card(href, cx, cy, w, h, { r = 10 } = {}) {
  const id = nextId("c");
  return `<g transform="translate(${f2(cx)} ${f2(cy)}) rotate(0) scale(1)" opacity="1">`
    + `<clipPath id="${id}"><rect x="${f2(-w / 2)}" y="${f2(-h / 2)}" width="${f2(w)}" height="${f2(h)}" rx="${f2(r)}"/></clipPath>`
    + `<image href="${href}" x="${f2(-w / 2)}" y="${f2(-h / 2)}" width="${f2(w)}" height="${f2(h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/></g>`;
}

// ---------- word reveal (timing.mjs WORD_REVEAL) ----------
const window01 = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

/** Splits a line into words and measures where each starts. `style`: { size, weight, ls, fill }. */
export async function measureWords(str, style) {
  const s = { ...style, anchor: "start", fill: "#fff" }, h = await inkWidth(text(40, 400, "H", s));
  const prefix = async (k) => (k === 0 ? 0 : (await inkWidth(text(40, 400, `${str.slice(0, k)}H`, s))) - h);
  const words = [];
  for (const m of str.matchAll(/\S+/g)) words.push({ text: m[0], x: await prefix(m.index) });
  return { str, style, words, width: await prefix(str.length) };
}

/** Vertical offset (in units of the text size) and opacity of word `n` of a line revealed from `start`. */
export function wordAt(t, start, n) {
  const from = start + n * WORD_REVEAL.stagger, p = easeOut(window01(t, from, from + WORD_REVEAL.length));
  return { dy: (1 - p) * WORD_REVEAL.rise, opacity: window01(t, from, from + WORD_REVEAL.fade) };
}

/** The line at time t, left edge at x, baseline at y. */
export function wordReveal(m, x, y, t, start) {
  return m.words.map((w, n) => {
    const a = wordAt(t, start, n);
    return a.opacity <= 0 ? "" : text(x + w.x, f2(y + a.dy * m.style.size), w.text, { ...m.style, anchor: "start", opacity: a.opacity });
  }).join("");
}
