import assert from "node:assert/strict";
import { test } from "node:test";
import { bestRotation, deal, rowsApart } from "../lib/end-scene.mjs";

test("every post is dealt twice, the second pass rotated", () => {
  const cards = deal(5, 2);
  assert.equal(cards.length, 10);
  for (let i = 0; i < 5; i++) assert.equal(cards.filter((c) => c.i === i).length, 2);
  assert.deepEqual(cards.slice(5).map((c) => c.i), [2, 3, 4, 0, 1]);
});

test("the chosen rotation keeps a post's copies in different rows and apart on screen", () => {
  const ratios = [16 / 9, 1, 16 / 9, 9 / 16, 16 / 9, 4 / 5, 16 / 9, 1, 16 / 9, 16 / 9, 1, 16 / 9];
  const { rotation, apart } = bestRotation(ratios, { width: 1080, top: 400, height: 184 }, 4);
  assert.ok(rowsApart(ratios.length, rotation));
  assert.ok(apart > 0);
});
