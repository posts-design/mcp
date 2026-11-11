import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { excerptSpec } from "../lib/excerpt.mjs";
import { parseSpec } from "../lib/spec.mjs";

const example = () => JSON.parse(readFileSync(new URL("../breakdown.example.json", import.meta.url), "utf8"));

test("times shift into the stretch; items outside are dropped and items across an edge clipped", () => {
  const out = excerptSpec(example(), { from: 6.1, pull: 20, to: 22 });
  assert.deepEqual(out.shots[0], [0, 2.267, "Logo over a car"]);
  assert.equal(out.shots.at(-1)[1], 15.9);
  assert.ok(out.shots.every(([a, b]) => a >= 0 && b <= 15.9 && a < b));
  assert.equal(out.pullBack, 13.9);
  assert.equal(out.cover, 1.3);
  assert.deepEqual(out.acts.map((a) => a.start), [0, 4.433, 8.6, 15.833]);
  assert.ok(out.transitions.every((t) => t > 0 && t < 15.9));
  parseSpec(out);
});

test("the bar grid keeps its phase", () => {
  const raw = example(), out = excerptSpec(raw, { from: 7, pull: 20, to: 22 }), bar = 240 / raw.bpm;
  const phase = (x) => ((x % bar) + bar) % bar;
  assert.ok(Math.abs(phase(out.barAnchor + 7) - phase(raw.barAnchor)) < 0.002);
});

test("refuses a cover outside the stretch and a stretch out of order", () => {
  assert.throws(() => excerptSpec(example(), { from: 10, pull: 20, to: 22 }));
  assert.throws(() => excerptSpec(example(), { from: 5, pull: 4, to: 22 }));
});
