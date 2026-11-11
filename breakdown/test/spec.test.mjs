import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PLACEHOLDER } from "../lib/draft.mjs";
import { MAX_LANES } from "../lib/layout.mjs";
import { HOLD } from "../lib/timing.mjs";
import { parseSpec, warnings } from "../lib/spec.mjs";

const example = () => JSON.parse(readFileSync(new URL("../breakdown.example.json", import.meta.url), "utf8"));
const problems = (raw) => { try { parseSpec(raw); return []; } catch (e) { return e.message.split("\n").slice(1).map((l) => l.trim()); } };

test("the example spec parses into objects, with each clip naming the stem it draws", () => {
  const s = parseSpec(example());
  assert.equal(s.shots.length, 19);
  assert.deepEqual(Object.keys(s.shots[0]), ["start", "end", "name"]);
  assert.equal(s.lanes[0].clips[0].stem, s.lanes[0].stem);
  assert.equal(s.end.posts.length, 7);
  assert.ok(s.end.posts.every((p) => typeof p.file === "string" && typeof p.from === "number"));
});

test("defaults: bars ruler, 4:5, no gain, black-keyed mark, no transitions, no end scene", () => {
  const raw = example();
  for (const k of ["ruler", "aspect", "gainDb", "markKey", "transitions", "end", "avatar", "hold"]) delete raw[k];
  const s = parseSpec(raw);
  assert.deepEqual([s.ruler, s.aspect, s.gainDb, s.markKey, s.transitions, s.end, s.avatar, s.hold], ["bars", "4:5", 0, "black", [], null, null, HOLD]);
});

test("a clip may draw another stem than its lane's", () => {
  const raw = example();
  raw.lanes[2].clips[0] = [6.18, 6.9, "Coin rush", "other"];
  assert.equal(parseSpec(raw).lanes[2].clips[0].stem, "other");
});

test("every problem is reported in one error, one per line", () => {
  const raw = example();
  raw.pullback = 3;                     // a typo of pullBack
  raw.shots[2] = [4.533, 2, "Backwards"]; // ends before it starts
  raw.lanes[0].clips[1] = [1, 2];       // no label
  delete raw.cover;
  const found = problems(raw);
  assert.equal(found.length, 4);
  for (const field of ["pullback", "shots[2]", "lanes[0].clips[1]", "cover"]) assert.ok(found.some((p) => p.includes(field)), field);
});

test("a bar ruler needs a tempo; a seconds ruler does not", () => {
  const raw = example();
  delete raw.bpm;
  assert.equal(problems(raw).length, 1);
  raw.ruler = "seconds";
  assert.equal(parseSpec(raw).bpm, null);
});

test("lanes, shots and acts are bounded and ordered", () => {
  const raw = example();
  raw.lanes = Array.from({ length: MAX_LANES + 1 }, (_, i) => ({ ...raw.lanes[0], name: `L${i}` }));
  assert.equal(problems(raw).length, 1);
  const r2 = example();
  r2.shots.reverse();
  assert.ok(problems(r2).length > 0);
  const r3 = example();
  r3.acts = [{ start: 5, title: "B" }, { start: 1, title: "A" }];
  assert.equal(problems(r3).length, 1);
});

test("the end scene needs one or two lines and at least three posts, as files, links or [file, from]", () => {
  const raw = example();
  raw.end = { line: ["One", "Two", "Three"], posts: ["a.mp4", "b.mp4"] };
  assert.equal(problems(raw).length, 2);
  raw.end = { line: ["Every post,"], posts: ["a.mp4", ["b.mp4", 4], "https://example.com/c.mp4"] };
  assert.deepEqual(parseSpec(raw).end.posts.map((p) => p.from), [undefined, 4, undefined]);
});

test("not an object at all", () => {
  for (const v of [null, [], "spec", 3]) assert.throws(() => parseSpec(v));
});

test("times past the film's end, a late cover and placeholder names are warned about, not refused", () => {
  const s = parseSpec(example());
  assert.deepEqual(warnings(s, 30), []);
  assert.ok(warnings(s, 20).length > 3);
  assert.equal(warnings({ ...s, cover: 25 }, 30).length, 1);
  assert.equal(warnings({ ...s, acts: [{ start: 0, title: PLACEHOLDER.act }] }, 30).length, 1);
});
