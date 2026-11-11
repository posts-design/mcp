import assert from "node:assert/strict";
import { test } from "node:test";
import { cubicBezier, easeOut } from "../lib/ease.mjs";
import { timelineLayout } from "../lib/layout.mjs";
import { HOLD, PULL_BACK, WORD_REVEAL, actIndexAt, beatGrid, createView, endSchedule, lit, schedule, timecode } from "../lib/timing.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("easing: fixed ends, linear when the curve is, monotone in between", () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  close(cubicBezier(0.25, 0.25, 0.75, 0.75)(0.3), 0.3);
  let last = 0;
  for (let x = 0.01; x < 1; x += 0.01) { const y = easeOut(x); assert.ok(y >= last); last = y; }
});

test("the pull-back starts at pullBack (or the film's end) and the streak follows the hold", () => {
  assert.deepEqual(schedule({ pullBack: 24.4, hold: 0.6 }, 30), { pull: { a: 24.4, b: 24.4 + PULL_BACK }, streakAt: 24.4 + PULL_BACK + 0.6 });
  assert.equal(schedule({ pullBack: 40, hold: HOLD }, 30).streakAt, 30 + PULL_BACK + HOLD);
});

test("the end scene's clock: lines word by word, the lockup after the last word settles", () => {
  const two = endSchedule(10, [3, 3]);
  close(two.lines[0], 9.8);
  close(two.lines[1], 9.8 + 3 * WORD_REVEAL.stagger);
  close(two.lockAt, two.lines[1] + 2 * WORD_REVEAL.stagger + WORD_REVEAL.length + 0.3);
  close(two.end, two.lockAt + 2.8);
  const one = endSchedule(10, [3]);
  assert.equal(one.lines.length, 1);
  close(one.lockAt, 9.8 + 2 * WORD_REVEAL.stagger + WORD_REVEAL.length + 0.3);
});

test("the view: the playing moment sits under the playhead, then the whole film fits the tracks", () => {
  const tl = timelineLayout(5), view = createView({ duration: 30, pull: { a: 24, b: 25.5 }, tl });
  for (const t of [0, 7.3, 20]) { const v = view(t); assert.equal(v.z, 0); close(v.X(t), tl.playhead); close(v.head, tl.playhead); assert.equal(v.pxs, 120); }
  const whole = view(26);
  assert.equal(whole.z, 1);
  close(whole.X(0), tl.x0);
  close(whole.X(30), tl.x1);
  assert.ok(view(24.75).z > 0 && view(24.75).z < 1);
});

test("a clip lights over 60 ms before it starts and releases over 300 ms after it ends", () => {
  const c = { start: 2, end: 3 };
  assert.equal(lit(c, 1.9), 0);
  assert.ok(lit(c, 1.97) > 0 && lit(c, 1.97) < 1);
  assert.equal(lit(c, 2.5), 1);
  assert.ok(lit(c, 3.15) > 0 && lit(c, 3.15) < 1);
  assert.equal(lit(c, 3.31), 0);
});

test("the beat grid is phased so the anchor starts a bar", () => {
  const g = beatGrid(120, 6.18);
  close(g.bar, 2);
  close(g.beat, 0.5);
  close(g.firstBar, 0.18);
  close(g.firstBeat, 0.18);
  assert.ok(g.firstBar >= 0 && g.firstBar < g.bar);
});

test("running time and the playing act", () => {
  assert.equal(timecode(0), "0:00.0");
  assert.equal(timecode(83.47), "1:23.4");
  const acts = [{ start: 0 }, { start: 6.1 }, { start: 14.7 }];
  assert.deepEqual([0, 6.0, 6.1, 20].map((t) => actIndexAt(acts, t)), [0, 0, 1, 2]);
  assert.equal(actIndexAt([{ start: 2 }], 0), 0);
});
