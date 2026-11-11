import assert from "node:assert/strict";
import { test } from "node:test";
import { END, FRAME, endRows, timelineLayout } from "../lib/layout.mjs";

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
