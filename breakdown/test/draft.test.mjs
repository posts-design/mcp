import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIBLE_DB, PLACEHOLDER, draftSpec, joinClips, phrases, placeholders, uncovered } from "../lib/draft.mjs";
import { parseSpec } from "../lib/spec.mjs";

const analysis = {
  duration: 20, fps: 30,
  cuts: [{ t: 3, kind: "hard" }, { t: 3.02, kind: "hard" }, { t: 9.5, kind: "soft" }],
  tempo: { bpm: 112, barAnchor: 0.54 },
  stems: {
    bass: { audible: true, clips: [{ start: 1, end: 4, peakDb: -12 }] },
    drums: { audible: true, clips: [{ start: 0.5, end: 18, peakDb: -8 }, { start: 18.2, end: 18.4, peakDb: AUDIBLE_DB - 5 }] },
    piano: { audible: false, clips: [{ start: 2, end: 3, peakDb: -40 }] },
    vocals: { audible: true, clips: [{ start: 5, end: 6.5, peakDb: -10 }, { start: 12, end: 13, peakDb: -14 }] },
  },
};
const words = [{ start: 5.1, end: 5.5, text: "Party" }, { start: 5.6, end: 6.2, text: "hard" }];

test("a draft is a valid spec the renderer accepts", () => {
  const raw = draftSpec(analysis, words, { source: "film.mp4", stems: "stems" });
  const s = parseSpec(raw);
  assert.equal(s.ruler, "bars");
  assert.equal(s.bpm, 112);
  assert.ok(s.cover < s.pullBack && s.pullBack < analysis.duration);
});

test("shots follow the cuts, dropping slivers under 50 ms", () => {
  const { shots } = draftSpec(analysis, [], { source: "film.mp4", stems: "stems" });
  assert.deepEqual(shots.map(([a, b]) => [a, b]), [[0, 3], [3.02, 9.5], [9.5, 20]]);
});

test("lanes: audible stems only, vocals first, quiet clips dropped", () => {
  const { lanes } = draftSpec(analysis, words, { source: "film.mp4", stems: "stems" });
  assert.deepEqual(lanes.map((l) => l.stem), ["vocals", "drums", "bass"]);
  assert.equal(lanes[1].clips.length, 1);
  // 3 shots, the act, the drums and bass clips, and the vocal stretch where nothing was heard
  assert.equal(placeholders(parseSpec(draftSpec(analysis, words, { source: "f", stems: "s" }))), 3 + 1 + 1 + 1 + 1);
});

test("vocal clips follow the heard phrases, with the unheard rest left to name by ear", () => {
  const { lanes } = draftSpec(analysis, words, { source: "film.mp4", stems: "stems" });
  assert.deepEqual(lanes[0].clips.map(([a, b, label]) => [a, b, label === PLACEHOLDER.words]), [[5.1, 6.2, false], [12, 13, true]]);
  assert.deepEqual(phrases([{ start: 0, end: 0.4, text: "a" }, { start: 0.5, end: 0.9, text: "b" }, { start: 2, end: 2.3, text: "c" }]).map((p) => p.text), ["a b", "c"]);
  assert.deepEqual(uncovered([{ start: 0, end: 10 }], [{ start: 2, end: 3 }, { start: 3.2, end: 9.8 }]), [{ start: 0, end: 2 }]);
});

test("without a tempo the ruler counts seconds", () => {
  const raw = draftSpec({ ...analysis, tempo: null }, [], { source: "film.mp4", stems: "stems" });
  assert.equal(parseSpec(raw).ruler, "seconds");
});

test("clips closer than a beat are joined into one to name", () => {
  const notes = [0, 1, 2, 3].map((k) => ({ start: k * 0.5, end: k * 0.5 + 0.3, peakDb: -10 - k }));
  assert.deepEqual(joinClips(notes, 0.536), [{ start: 0, end: 1.8, peakDb: -10 }]);
  assert.equal(joinClips(notes, 0.1).length, 4);
});
