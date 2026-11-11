// Marquee: endless rows of post tiles sliding sideways at an even pace, alternate rows going opposite ways, with a
// soft fade into the ground at the left and right edges. Constant speed (a marquee never stops) and seamless: each row
// repeats its own sequence.
import { COLOR } from "./layout.mjs";
import { card, f2, nextId } from "./svg.mjs";

/**
 * cards: [{ href, ratio }] (ratio = width / height; tiles keep their ratio at the row height). rows, top (y of the first
 * row), height (row height), gap (px between tiles and rows), speed (px/s; row k moves at speed × (1 + 0.12k), odd rows
 * the other way), fade (edge fade width px, 0 for none), ground (the colour the edges fade into), r (corner radius).
 */
export function createMarquee({ width, cards, rows = 3, top = 0, height = 180, gap = 20, speed = 60, fade = 220, ground = COLOR.ground, r = 14 }) {
  const lanes = Array.from({ length: rows }, (_, k) => {
    // deal the cards round-robin so neighbouring rows don't repeat each other
    const own = cards.map((c, card) => ({ ...c, card })).filter((_, i) => i % rows === k), tiles = [];
    let x = 0;
    for (const c of own) { const w = Math.round(height * Math.min(2, Math.max(0.6, c.ratio))); tiles.push({ ...c, x, w }); x += w + gap; }
    return { tiles, span: x, dir: k % 2 ? 1 : -1, speed: speed * (1 + 0.12 * k), y: top + k * (height + gap) + height / 2, offset: (k * 137) % Math.max(1, x) };
  });
  const fadeSvg = (() => {
    if (!fade) return "";
    const id = nextId("mq"), y0 = top - gap, h = rows * (height + gap) + gap;
    return `<linearGradient id="${id}l" x1="0" x2="1"><stop offset="0" stop-color="${ground}"/><stop offset="1" stop-color="${ground}" stop-opacity="0"/></linearGradient>` +
      `<linearGradient id="${id}r" x1="1" x2="0"><stop offset="0" stop-color="${ground}"/><stop offset="1" stop-color="${ground}" stop-opacity="0"/></linearGradient>` +
      `<rect x="0" y="${f2(y0)}" width="${fade}" height="${f2(h)}" fill="url(#${id}l)"/>`
        + `<rect x="${f2(width - fade)}" y="${f2(y0)}" width="${fade}" height="${f2(h)}" fill="url(#${id}r)"/>`;
  })();
  // every tile on screen at time t: { card (index into cards), row, x (left edge), w }
  const visible = (t) => {
    const out = [];
    lanes.forEach((lane, row) => {
      if (!lane.span) return;
      const shift = ((((lane.dir * lane.speed * t + lane.offset) % lane.span) + lane.span) % lane.span);
      // enough copies of the row to cover the frame
      for (let base = shift - lane.span; base < width; base += lane.span) {
        for (const tile of lane.tiles) {
          const x = base + tile.x;
          if (x + tile.w >= 0 && x <= width) out.push({ card: tile.card, row, x, w: tile.w, tile });
        }
      }
    });
    return out;
  };
  return {
    svg(t) {
      return visible(t).map(({ x, w, row, tile }) => card(tile.href, x + w / 2, lanes[row].y, w, height, { r })).join("") + fadeSvg;
    },
    visible: (t) => visible(t).map(({ card, row, x, w }) => ({ card, row, x, w })),
  };
}
