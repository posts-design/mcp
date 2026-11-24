import assert from "node:assert/strict";
import { test } from "node:test";
import { readArgs } from "../lib/cli.mjs";
import { FADE, NO_KICK, accentTimes, arc, downbeats, duckGain, pickEnding, pickLanding, pieces, speechWindows, windowGain } from "../lib/layer.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
/** Evaluates a volume expression the way ffmpeg does, at film second t. */
const gainAt = (expr, t) => new Function("t", "clip", "min", `return ${expr}`)(t, (x, lo, hi) => Math.min(hi, Math.max(lo, x)), Math.min);

test("the arc on bar lines: hats from the second bar, kick and bass to two bars before the logo, back on it", () => {
  const a = arc({ length: 26, land: 8, logo: 24, bar: 2 });
  assert.deepEqual(a.hats, [[2, 8]]);
  assert.equal(a.breath, 20);
  assert.deepEqual(a.beat, [[8, 20], [24, 28]]);
  assert.deepEqual(a.opening, [0, 8]);
});

test("a logo off the bar lines keeps the breath on them and near two bars", () => {
  for (const logo of [22.7, 23.3, 23.9]) {
    const a = arc({ length: 30, land: 8, logo, bar: 2 });
    close(((a.breath - 8) / 2) % 1, 0);
    assert.ok(logo - a.breath >= 1.5 * 2 - 1e-6 && logo - a.breath <= 2.5 * 2 + 1e-6, `breath ${a.breath} before ${logo}`);
  }
  // the landing off the film's start: hats wait for a bar line about a bar in
  close(arc({ length: 30, land: 5.3, logo: 15.3, bar: 2 }).hats[0][0], 3.3);
  close(arc({ length: 30, land: 7.8, logo: 17.8, bar: 2 }).hats[0][0], 1.8);
  // a landing within the first bar and a half has no hats stage
  assert.deepEqual(arc({ length: 30, land: 1, logo: 9, bar: 2 }).hats, []);
});

test("marks out of order, outside the film or under two bars apart are refused", () => {
  assert.throws(() => arc({ length: 26, land: 8, logo: 8, bar: 2 }));
  assert.throws(() => arc({ length: 26, land: 8, logo: 27, bar: 2 }));
  assert.throws(() => arc({ length: 26, land: 0, logo: 10, bar: 2 }));
  assert.throws(() => arc({ length: 26, land: 8, logo: 10.9, bar: 2 }), /two bars/);
  assert.equal(arc({ length: 26, land: 8, logo: 11.2, bar: 2 }).breath, 10);
});

test("a window is silent outside, whole inside, and fades in before its start and out after its end", () => {
  const e = windowGain([[8, 20]]);
  for (const [t, g] of [[7.9, 0], [8 - FADE.in / 2, 0.5], [8, 1], [20, 1], [20 + FADE.out / 2, 0.5], [20 + FADE.out, 0]]) close(gainAt(e, t), g);
  const two = windowGain([[2, 4], [6, 8]]);
  [0, 1, 0, 1, 0].forEach((g, k) => close(gainAt(two, 1 + 2 * k), g));
  assert.equal(windowGain(null), "1");
  assert.equal(gainAt(windowGain([]), 3), 0);
});

test("bar lines run through the anchor, inside the track", () => {
  const d = downbeats(6.18, 2, 10.5);
  assert.deepEqual(d, [0.18, 2.18, 4.18, 6.18, 8.18, 10.18]);
  assert.deepEqual(downbeats(0, 2, 6), [0, 2, 4]);
});

// a track of twelve 2 s bars: a quiet intro, a drop on bar 4, a dropout on bar 9, a loud last bar
const beats = downbeats(0, 2, 24);
const barDb = [-40, -40, -38, -36, -10, -10, -10, -10, -10, -30, -12, -8];

test("the landing is the drop: the biggest rise in low end where the groove holds", () => {
  assert.equal(pickLanding({ beats, barDb, land: 8, logo: 14, breath: 10, bar: 2, duration: 24 }), 8);
  // a landing that needs more lead-in than the drop has moves to a later bar where the groove still holds
  assert.equal(pickLanding({ beats, barDb, land: 10, logo: 18, breath: 14, bar: 2, duration: 24 }), 10);
  // a bigger rise whose groove drops out before the breath loses to one that holds
  const spike = [-40, -40, -10, -10, -10, -10, -40, 0, -40, -40, -10, -10];
  assert.equal(pickLanding({ beats, barDb: spike, land: 2, logo: 10, breath: 6, bar: 2, duration: 24 }), 4);
  assert.throws(() => pickLanding({ beats, barDb, land: 8, logo: 30, breath: 26, bar: 2, duration: 24 }), /too short/);
});

test("the ending is the latest bar line that leaves the rest of the film inside the track's sound", () => {
  assert.equal(pickEnding({ beats, soundEnd: 23.5, rest: 2, after: 8 }), 20);
  assert.equal(pickEnding({ beats, soundEnd: 23.5, rest: 6, after: 8 }), 16);
  // nothing after the landing fits: the latest that fits at all
  assert.equal(pickEnding({ beats, soundEnd: 12, rest: 6, after: 8 }), 6);
  assert.throws(() => pickEnding({ beats, soundEnd: 3, rest: 6, after: 0 }), /too short/);
});

test("the track plays straight through when it reaches the ending by itself, else cuts to it on the logo", () => {
  const a = arc({ length: 26, land: 8, logo: 24, bar: 2 });
  assert.deepEqual(pieces({ start: 8.058, ending: 32.058, arc: a }), [{ from: 8.058, at: 0, length: null, filter: null }]);
  assert.deepEqual(pieces({ start: 8.058, ending: 30.058, arc: a }),
    [{ from: 8.058, at: 0, length: 24, filter: null }, { from: 30.058, at: 24, length: null, filter: null }]);
  const one = pieces({ start: 4, ending: 40, arc: a, oneTrack: true });
  assert.deepEqual(one.map((p) => [p.from, p.at, p.length, p.filter]),
    [[4, 0, 8, NO_KICK], [12, 8, 12, null], [24, 20, 4, NO_KICK], [40, 24, null, null]]);
});

test("accents: the open, the landing just ahead of its downbeat, a riser ending on the logo, the sting on it", () => {
  const a = arc({ length: 26, land: 8, logo: 24, bar: 2 });
  const t = accentTimes(a, 2);
  assert.deepEqual([t.open, t.riser, t.sting], [0, 22, 24]);
  close(t.hit, 7.95);
  assert.equal(accentTimes(a, 30).riser, 0);
});

test("speech windows: words joined across short pauses, padded, blips dropped; the music dips only inside them", () => {
  // 0.1 s hops: words at 1.0–2.0 and 2.3–3.0 (a short pause), a 0.1 s click at 5.0, a quiet breath at 4.0
  const db = Array.from({ length: 70 }, (_, i) => (i >= 10 && i < 20) || (i >= 23 && i < 30) ? -12 : i === 50 ? -10 : i === 40 ? -60 : -80);
  const w = speechWindows(db, 0.1);
  assert.equal(w.length, 1);
  close(w[0][0], 0.85);
  close(w[0][1], 3.15);
  const e = duckGain(w, 12);
  close(gainAt(e, 0.5), 1);
  close(gainAt(e, 2), 10 ** (-12 / 20), 1e-3);
  close(gainAt(e, 4), 1);
  assert.equal(duckGain([], 12), "1");
  // silence, a voice wholly after the film, and room noise 35 dB under the words
  assert.deepEqual(speechWindows(Array(50).fill(-120), 0.1), []);
  assert.deepEqual(speechWindows(db, 0.1, { length: 0.5 }), []);
  close(speechWindows(db, 0.1, { length: 2 })[0][1], 2);
  assert.equal(speechWindows(db.map((v) => Math.max(v, -47)), 0.1).length, 1);
});

test("a negative number after an option is its value", () => {
  const { values, positionals } = readArgs(["film.mp4", "--lufs", "-14", "--land", "8", "--no-accents", "track.mp3"], ["lufs", "land"], ["no-accents"]);
  assert.deepEqual({ ...values }, { lufs: "-14", land: "8", "no-accents": true });
  assert.deepEqual(positionals, ["film.mp4", "track.mp3"]);
});
