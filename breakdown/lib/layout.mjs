// Where everything sits on the 4:5 frame. Pure numbers, no drawing, so the geometry can be tested on its own.
//
//   ┌──────────────────────────────┐  y 40   the post, in a rounded 16:9 window
//   │            window            │
//   └──────────────────────────────┘  y 603
//   ruler (bars or seconds)            y 626
//   V1  ▭▭▭▭▭ filmstrip of shots       y 672, 120 tall
//   A1  ▭▭ ▭▭▭  one track per lane     y 808 … 1202, shared by the lanes
//   …
//   01 Act now playing          mark   y 1296

export const FRAME = { width: 1080, height: 1350, fps: 30 };
/** A 9:16 copy puts the 4:5 frame on a taller ground, this far from the top. */
export const TALL = { height: 1920, top: 285 };

export const COLOR = {
  ground: "#101010", fg: "#f5f5f5", muted: "#a3a3a3", subtle: "#8a8a8a", faint: "#7a7a7a",
  line: "rgba(255,255,255,0.1)", lineStrong: "rgba(255,255,255,0.18)",
};

/** The post's window. A source of another shape is fitted inside it on the ground. */
export const WINDOW = { x: 40, y: 40, w: 1000, h: 563, r: 20 };

/** At most six audio tracks fit under V1 at a readable height. */
export const MAX_LANES = 6;

/** Label sizes in px: clip names on audio tracks, shot names on V1. */
export const LABEL = { clip: 26, shot: 23 };

/** Scrolling: 120 px per second of the post, under a playhead 36% across the tracks. */
export const SCROLL = { pxPerSecond: 120, playhead: 0.36 };

/** Labels stop this far inside the tracks' left edge, just inside its fade. */
export const STICK = 48;

/**
 * The timeline for `laneCount` audio tracks. Track headers sit in a left column (x 40…196) and tracks run from x0 to
 * x1. The audio tracks share the height down to y 1202: four tracks are 88 px tall, five 70, six 56.
 */
export function timelineLayout(laneCount) {
  if (!(laneCount >= 1)) throw new Error("a breakdown needs at least one audio track");
  const tl = { head: 40, x0: 210, x1: 1040, ruler: 626, video: 672, videoH: 120, audio0: 808, audioBottom: 1202, gap: laneCount > 4 ? 11 : 14 };
  tl.laneH = Math.floor((tl.audioBottom - tl.audio0 - tl.gap * (laneCount - 1)) / laneCount);
  tl.laneY = (i) => tl.audio0 + i * (tl.laneH + tl.gap);
  tl.bottom = tl.laneY(laneCount - 1) + tl.laneH;
  tl.playhead = tl.x0 + Math.round((tl.x1 - tl.x0) * SCROLL.playhead);
  tl.thumbW = Math.round(tl.videoH * WINDOW.w / WINDOW.h);   // a filmstrip thumbnail, the window's shape at V1's height
  return tl;
}

/** The footer: the act now playing, bottom left, numbered; the brand's mark at the right on the same line. */
export const FOOTER = { size: 32, gap: 16, y: FRAME.height - 54, markH: 54 };

/** The end scene: a closing line top left, rows of posts below it, all `margin` from each other and the frame. */
export const END = { margin: 96, rows: 3, rowGap: 20, line: { size: 84, weight: 500, ls: -0.035, fill: COLOR.fg, lead: 1.06 } };

/**
 * The end scene's rows between the closing line's ink and the floor (the frame's bottom margin, or the top of a
 * lockup drawn under them), `margin` from both.
 */
export function endRows(lineInkBottom, floor) {
  const top = Math.round(lineInkBottom + END.margin), bottom = Math.round(floor - END.margin);
  const h = Math.floor((bottom - top - (END.rows - 1) * END.rowGap) / END.rows);
  if (h < 60) throw new Error("the end scene's closing line leaves no room for the posts");
  return { top, bottom, h };
}
