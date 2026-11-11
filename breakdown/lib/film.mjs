// One breakdown film from a checked spec: the post plays in its window over the timeline; at `pullBack` the timeline
// eases out to the whole post, holds, and the Streak carries it into the end scene (or the film ends on the hold when
// the spec has no end scene). `frameAt(t)` returns a frame as raw rgb24, from time alone.
import sharp from "sharp";
import { clamp } from "./ease.mjs";
import { createEndScene } from "./end-scene.mjs";
import { COLOR, FOOTER, FRAME, WINDOW, timelineLayout } from "./layout.mjs";
import { envelope, filmFrames, probe, stemFile } from "./media.mjs";
import { createStreak } from "./streak.mjs";
import { createTimeline } from "./timeline.mjs";
import { createView, schedule } from "./timing.mjs";
import path from "node:path";

/**
 * `spec` comes from parseSpec. Paths in it are relative to `base`. `cacheDir` holds decoded frames between runs.
 * In a render worker `decode` is false: the parent has filled the cache and the worker only reads it.
 */
export async function createBreakdown(spec, { base, cacheDir, decode = true, log = console.log, lockup = null }) {
  const { width: W, height: H } = FRAME;
  const source = path.resolve(base, spec.source), info = probe(source), duration = info.duration;
  const frameFile = await filmFrames(source, info, cacheDir, { decode, ground: COLOR.ground });

  // the post in its rounded window
  const mask = Buffer.from(`<svg width="${WINDOW.w}" height="${WINDOW.h}"><rect width="${WINDOW.w}" height="${WINDOW.h}" rx="${WINDOW.r}" fill="#fff"/></svg>`);
  // raw pixels go straight into the frame's composite, with no PNG encode and decode in between
  const videoAt = (t) => sharp(frameFile(t)).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).raw().toBuffer();
  // the filmstrip's thumbnails, made as the timeline needs them
  const tl = timelineLayout(spec.lanes.length), thumbs = new Map();
  const thumbAt = async (tc) => {
    const f = frameFile(clamp(0, duration - 0.001, tc));
    if (!thumbs.has(f)) thumbs.set(f, `data:image/jpeg;base64,${(await sharp(f).resize(tl.thumbW, tl.videoH).jpeg({ quality: 86 }).toBuffer()).toString("base64")}`);
    return thumbs.get(f);
  };

  const stemsDir = path.resolve(base, spec.stems);
  const stems = [...new Set(spec.lanes.flatMap((l) => [l.stem, ...l.clips.map((c) => c.stem)]))];
  const envelopes = Object.fromEntries(stems.map((stem) => [stem, envelope(stemFile(stemsDir, stem))]));

  const { pull, streakAt } = schedule(spec, duration);
  const view = createView({ duration, pull, tl });
  const timeline = await createTimeline({ spec, tl, view, duration, pull, thumbAt, envelopes });
  const mark = spec.avatar ? await brandMark(path.resolve(base, spec.avatar), spec.markKey) : null;

  async function breakdownAt(t) {
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
      + `<rect x="${WINDOW.x - 0.75}" y="${WINDOW.y - 0.75}" width="${WINDOW.w + 1.5}" height="${WINDOW.h + 1.5}" `
      + `rx="${WINDOW.r + 0.75}" fill="none" stroke="${COLOR.line}" stroke-width="1.5"/>`
      + (await timeline.svg(t)) + timeline.footer(t) + `</svg>`;
    return sharp({ create: { width: W, height: H, channels: 3, background: COLOR.ground } }).composite([
      { input: await videoAt(Math.min(t, duration - 0.001)), raw: { width: WINDOW.w, height: WINDOW.h, channels: 4 }, left: WINDOW.x, top: WINDOW.y },
      { input: Buffer.from(svg), left: 0, top: 0 },
      ...(mark ? [{ input: mark.png, left: tl.x1 - mark.w, top: Math.round(FOOTER.y - FOOTER.size * 0.36 - mark.h / 2) }] : []),
    ]).removeAlpha().raw().toBuffer();
  }

  if (!spec.end) return { duration, total: streakAt, info, frameAt: breakdownAt };

  // The held whole-post frame streaks out; the end scene comes in under it.
  const streak = createStreak({ width: W, height: H, seed: 11 });
  const endScene = await createEndScene({ end: spec.end, base, cacheDir, decode, log, start: streakAt, revealAt: streakAt + streak.duration, lockup });
  let held = null;
  async function frameAt(t) {
    if (t < streakAt) return breakdownAt(t);
    if (t >= streakAt + streak.duration) return endScene.frame(t);
    if (!held) { held = await breakdownAt(streakAt); streak.setSource(held); }
    // the end scene shows only once the bands start pulling away, so it isn't drawn before
    const e = t - streakAt, shown = e >= streak.timing.out + streak.timing.hold;
    return streak.frame(e, held, shown ? await endScene.frame(t) : null);
  }
  return { duration, total: endScene.end, info, frameAt };
}

/**
 * The brand's mark, keyed off its avatar's ground so it sits on ours without a box: a colour mark on black keeps its
 * colours (markKey "black"); a black mark on white turns white (markKey "white").
 */
async function brandMark(file, key) {
  const size = FOOTER.markH * 3;
  const { data, info } = await sharp(file).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    if (key === "white") { rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = 245; rgba[p * 4 + 3] = Math.round(255 * clamp(0, 1, (255 - Math.min(r, g, b) - 12) / 40)); }
    else { rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = Math.round(255 * clamp(0, 1, (Math.max(r, g, b) - 16) / 28)); }
  }
  const trimmed = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).trim().png().toBuffer();
  const png = await sharp(trimmed).resize({ height: FOOTER.markH }).png().toBuffer({ resolveWithObject: true });
  return { png: png.data, w: png.info.width, h: png.info.height };
}
