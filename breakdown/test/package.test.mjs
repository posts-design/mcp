import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// package.json "files" is the kit as published: nothing it needs may be missing from that list. "unlisted" holds
// commands kept out of the public kit until their skill is listed (absent from a published copy); they may use
// published files, never the reverse.
const KIT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { files, unlisted = [] } = JSON.parse(readFileSync(path.join(KIT, "package.json"), "utf8"));
const kit = [...files, ...unlisted.filter((f) => existsSync(path.join(KIT, f)))];

test("every listed file exists, and every test file is listed", () => {
  for (const f of kit) assert.ok(existsSync(path.join(KIT, f)), f);
  for (const f of readdirSync(path.join(KIT, "test"))) assert.ok(kit.includes(`test/${f}`), f);
});

test("everything a script imports or runs is in the kit, and a published script needs nothing unlisted", () => {
  for (const f of kit.filter((f) => f.endsWith(".mjs"))) {
    const within = files.includes(f) ? files : kit, src = readFileSync(path.join(KIT, f), "utf8");
    for (const [, rel] of src.matchAll(/(?:from |import\()\s*"(\.{1,2}\/[^"]+)"/g)) assert.ok(within.includes(path.posix.join(path.posix.dirname(f), rel)), `${f} imports ${rel}`);
    for (const [, py] of src.matchAll(/"(py\/[\w.-]+\.py)"/g)) assert.ok(within.includes(py), `${f} runs ${py}`);
  }
});
