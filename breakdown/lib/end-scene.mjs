// The end scene: the brand's other posts playing in rows (the Marquee) under a closing line, revealed word by word.
// Every post is dealt twice; the second pass is rotated so a post's two copies sit in different rows and as far apart
// as they can while the wall is on screen.
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { COLOR, END, FRAME, endRows } from "./layout.mjs";
import { createMarquee } from "./marquee.mjs";
import { darkSeconds, localPost, probe, tileFrames } from "./media.mjs";
import { inkBox, measureWords, text, wordReveal } from "./svg.mjs";
import { endSchedule } from "./timing.mjs";

/** Each tile plays 8 s of its post, from 1 s in (past fade-ins) unless the spec gives another start. */
const TILE = { from: 1, length: 8 };
const MARQUEE = { rows: END.rows, gap: END.rowGap, speed: 70, fade: 120, ground: COLOR.ground, r: 16 };

/**
 * The cards of a wall of `n` posts, each dealt twice; the second pass starts half a loop later in its clip and
 * is rotated by `rot`.
 */
export const deal = (n, rot) => [...Array.from({ length: n }, (_, i) => ({ i, off: 0 })), ...Array.from({ length: n }, (_, j) => ({ i: (j + rot) % n, off: 0.5 }))];

/** A rotation keeps a post's two copies in different rows: cards are dealt to rows round-robin. */
export function rowsApart(n, rot, rows = MARQUEE.rows) {
  const cards = deal(n, rot);
  return cards.every((c, k) => k >= n || cards.findIndex((d, m) => m >= n && d.i === c.i) % rows !== k % rows);
}

/**
 * The rotation whose copies stay furthest apart on screen over `seconds` of the wall, among those that keep copies in
 * different rows (every rotation when none does). `ratios` are the posts' width/height.
 */
export function bestRotation(ratios, layout, seconds, fps = FRAME.fps) {
  const n = ratios.length;
  const spread = (rot) => {
    const cs = deal(n, rot).map((c) => ({ ...c, ratio: ratios[c.i], href: "" })), m = createMarquee({ ...MARQUEE, ...layout, cards: cs });
    let d = Infinity;
    for (let e = 0; e <= seconds; e += 1 / fps) {
      const v = m.visible(e).map((x) => ({ p: cs[x.card].i, c: x.x + x.w / 2 }));
      for (let a = 0; a < v.length; a++) for (let b = a + 1; b < v.length; b++) if (v[a].p === v[b].p) d = Math.min(d, Math.abs(v[a].c - v[b].c));
    }
    return d;
  };
  const all = Array.from({ length: n - 1 }, (_, k) => k + 1), apart = all.filter((rot) => rowsApart(n, rot));
  const best = (apart.length ? apart : all).map((rot) => ({ rot, d: spread(rot) })).reduce((a, b) => (b.d > a.d ? b : a));
  return { rotation: best.rot, apart: best.d };
}

/**
 * Prepares the end scene, which starts playing at `start` and is fully uncovered by the streak at `revealAt`, and
 * returns `frame(t)` (an rgb24 Buffer) and `end`, the film's last moment. `lockup`, optional, is a mark drawn under
 * the wall: { top (its ink's top in px), svg(t, at) }.
 */
export async function createEndScene({ end, base, cacheDir, decode, log, start, revealAt, lockup, ground = COLOR.ground }) {
  const { width: W, height: H, fps } = FRAME;
  const lines = await Promise.all(end.line.map((l) => measureWords(l, END.line)));
  const y1 = END.margin + END.line.size * 0.73, y2 = y1 + END.line.size * END.line.lead;
  const lineInk = await inkBox(text(100, 400, end.line.at(-1), END.line));
  const lastBaseline = lines.length > 1 ? y2 : y1;
  const rows = endRows(lastBaseline + lineInk.top + lineInk.height, lockup ? lockup.top : H);
  const clock = endSchedule(revealAt, lines.map((l) => l.words.length));

  const tiles = [];
  for (const [k, post] of end.posts.entries()) {
    const file = await localPost(post.file, base, cacheDir), from = post.from ?? TILE.from;
    const tile = await tileFrames(file, { from, length: TILE.length, fps, rowH: rows.h, cacheDir, decode, defaultFrom: TILE.from });
    if (!tile.frames.length) throw new Error(`end post ${k + 1} (${post.file}) has no picture from ${from} s; give it an earlier "from" or pick another`);
    if (decode) {
      // a tile must play its whole window with picture in it: a short or dark post reads as a hole in the wall
      const dark = await darkSeconds(tile, fps);
      if (tile.frames.length < TILE.length * fps * 0.95 || dark > TILE.length / 3) {
        log(`warning: end post ${k + 1} (${post.file}): ${(tile.frames.length / fps).toFixed(1)} of ${TILE.length} s, ${dark} dark seconds; pick another`);
      }
    }
    const { width, height } = probe(file);
    tiles.push({ ...tile, n: tile.frames.length, ratio: width / height });
  }

  const layout = { width: W, top: rows.top, height: rows.h };
  const { rotation, apart } = bestRotation(tiles.map((t) => t.ratio), layout, clock.end - start);
  if (decode) log(`end wall: second pass rotated by ${rotation}, copies of a post at least ${Math.round(apart)} px apart`);
  const cards = deal(tiles.length, rotation).map((c, k) => ({ ...c, ratio: tiles[c.i].ratio, href: `@@T${k}@@` }));
  const marquee = createMarquee({ ...MARQUEE, ...layout, cards, ground });
  const uris = new Map();
  const tileUri = (c, e) => {
    const tl = tiles[c.i], idx = (Math.floor((e + c.off * TILE.length) * fps) % tl.n + tl.n) % tl.n, f = `${tl.dir}/${String(idx + 1).padStart(4, "0")}.jpg`;
    if (!uris.has(f)) uris.set(f, `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`);
    return uris.get(f);
  };

  async function frame(t) {
    const e = t - start;   // the posts are already playing when the streak lifts
    let body = marquee.svg(e).replace(/@@T(\d+)@@/g, (_, k) => tileUri(cards[k], e));
    body += wordReveal(lines[0], END.margin, y1, t, clock.lines[0]) + (lines[1] ? wordReveal(lines[1], END.margin, y2, t, clock.lines[1]) : "");
    if (lockup) body += lockup.svg(t, clock.lockAt);
    return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
      + `<rect width="${W}" height="${H}" fill="${ground}"/>${body}</svg>`)).removeAlpha().raw().toBuffer();
  }
  return { frame, end: clock.end };
}
