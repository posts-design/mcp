import assert from "node:assert/strict";
import { test } from "node:test";
import { blocksOf } from "../lib/encode.mjs";
import { envelopeRms, postCacheFile } from "../lib/media.mjs";
import { parseArgs } from "../render.mjs";

test("render processes share the frames: every frame in exactly one block, whatever the number of processes", () => {
  for (const count of [1, 14, 15, 16, 950]) for (let of = 1; of <= 8; of++) {
    const seen = new Array(count).fill(0);
    for (let w = 0; w < of; w++) for (const [a, b] of blocksOf(w, of, count)) for (let i = a; i < b; i++) seen[i]++;
    assert.ok(seen.every((n) => n === 1), `${count} frames on ${of}`);
  }
});

test("command-line arguments: spec, output, stills and jobs, with bad values refused", () => {
  assert.deepEqual(parseArgs(["work/breakdown.json", "--stills", "4,12.5", "--jobs", "2"]), { specFile: "work/breakdown.json", out: undefined, stills: [4, 12.5], jobs: 2, cacheDir: undefined });
  assert.equal(parseArgs(["a.json", "b.mp4", "--cache", "/c"]).out, "b.mp4");
  for (const bad of [["a.json", "--jobs", "2.5"], ["a.json", "--jobs", "0"], ["a.json", "--stills", "4,x"], ["a.json", "--still", "4"]]) assert.throws(() => parseArgs(bad), bad.join(" "));
});

test("loudness between two times, and nothing past the stem's end", () => {
  const e = new Float32Array([0, 1, 1, 0]);
  assert.equal(envelopeRms(e, 0.01, 0.02), 1);
  assert.equal(envelopeRms(e, 5, 6), 0);
});

test("a linked post is cached under a name from its link, keeping its extension", () => {
  const a = postCacheFile("https://example.com/a/clip.mov?x=1", "/c"), b = postCacheFile("https://example.com/b/clip.mov", "/c");
  assert.match(a, /^\/c\/posts\/[0-9a-f]{16}\.mov$/);
  assert.notEqual(a, b);
  assert.match(postCacheFile("https://example.com/v", "/c"), /\.mp4$/);
});
