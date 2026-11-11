import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// package.json "files" is the kit as published: nothing it needs may be missing from that list.
const KIT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = JSON.parse(readFileSync(path.join(KIT, "package.json"), "utf8")).files;

test("every listed file exists, and every test file is listed", () => {
  for (const f of files) assert.ok(existsSync(path.join(KIT, f)), f);
  for (const f of readdirSync(path.join(KIT, "test"))) assert.ok(files.includes(`test/${f}`), f);
});

test("everything a listed script imports or runs is listed too", () => {
  for (const f of files.filter((f) => f.endsWith(".mjs"))) {
    const src = readFileSync(path.join(KIT, f), "utf8");
    for (const [, rel] of src.matchAll(/(?:from |import\()\s*"(\.{1,2}\/[^"]+)"/g)) assert.ok(files.includes(path.posix.join(path.posix.dirname(f), rel)), `${f} imports ${rel}`);
    for (const [, py] of src.matchAll(/"(py\/[\w.-]+\.py)"/g)) assert.ok(files.includes(py), `${f} runs ${py}`);
  }
});
