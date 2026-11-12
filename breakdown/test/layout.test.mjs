import assert from "node:assert/strict";
import { test } from "node:test";
import { COLOR, END, FRAME, WINDOW, endRows, palette, pictureRect, timelineLayout } from "../lib/layout.mjs";

test("audio tracks share the space under V1 without overlapping or passing the footer", () => {
  assert.deepEqual([4, 5].map((n) => timelineLayout(n).laneH), [88, 70]);
  for (let n = 1; n <= 6; n++) {
    const tl = timelineLayout(n);
    assert.ok(tl.laneY(0) >= tl.video + tl.videoH);
    for (let i = 1; i < n; i++) assert.ok(tl.laneY(i) >= tl.laneY(i - 1) + tl.laneH);
    assert.ok(tl.bottom <= tl.audioBottom);
    assert.ok(tl.playhead > tl.x0 && tl.playhead < tl.x1);
  }
  assert.throws(() => timelineLayout(0));
});

test("the end scene's rows sit a margin below the line and above the floor", () => {
  const rows = endRows(260, FRAME.height);
  assert.equal(rows.top, 260 + END.margin);
  assert.ok(rows.top + END.rows * rows.h + (END.rows - 1) * END.rowGap <= FRAME.height - END.margin);
  assert.throws(() => endRows(1000, FRAME.height));
});

test("a fitted picture sits where ffmpeg pads it: 16:9 fills the window, a square or vertical film is centred", () => {
  assert.deepEqual(pictureRect(1920, 1080), { x: 0, y: 0, w: WINDOW.w, h: WINDOW.h });
  assert.deepEqual(pictureRect(1080, 1080), { x: 218, y: 0, w: 563, h: 563 });   // measured from ffmpeg's output
  assert.deepEqual(pictureRect(1080, 1920), { x: 341, y: 0, w: 317, h: 563 });
});

test("without a style the house palette is used as is", () => {
  assert.equal(palette(null), COLOR);
  assert.equal(palette({ ground: null, accent: null, light: 1 }), COLOR);
  assert.deepEqual([palette({ ground: "#15121a", accent: null }).ground, palette({ accent: "#ef6fa8" }).accent], ["#15121a", "#ef6fa8"]);
});
