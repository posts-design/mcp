import assert from "node:assert/strict";
import { test } from "node:test";
import { LIGHT, falloff, introRamp } from "../lib/light.mjs";

const rect = { x: 258, y: 40, w: 563, h: 563 };

test("the film opens without the light, which eases in to full", () => {
  assert.equal(introRamp(0), 0);
  assert.equal(introRamp(LIGHT.introFrom), 0);
  assert.ok(introRamp((LIGHT.introFrom + LIGHT.introTo) / 2) > 0.4);
  assert.equal(introRamp(LIGHT.introTo), 1);
});

test("the light is strongest beside the picture, fades with distance and is gone before the timeline", () => {
  const beside = falloff(rect.x - 2, rect.y + 200, rect).f, further = falloff(rect.x - 150, rect.y + 200, rect).f;
  assert.ok(beside > 0.9 && further < beside / 2);
  for (const x of [0, rect.x - 40, rect.x + rect.w / 2, 1079]) assert.equal(falloff(x, rect.y + rect.h + LIGHT.floor, rect).f, 0);
  // it tapers over the picture's lower part rather than ending on a line at its bottom edge
  assert.ok(falloff(rect.x - 2, rect.y + rect.h - 10, rect).f < falloff(rect.x - 2, rect.y + rect.h - LIGHT.taper - 10, rect).f / 2);
});
