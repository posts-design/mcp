import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { scnetWeights } from "../lib/scnet.mjs";

const hex = (b) => createHash("sha256").update(b).digest("hex");

test("the model is used only when its hash matches: a download that differs is refused and removed", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "scnet-")), file = path.join(dir, "model.ckpt"), served = Buffer.from("weights v2");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const server = createServer((_, res) => res.end(served));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/model.ckpt`;

  // a file already there with the right hash is used as it is, with nothing fetched
  writeFileSync(file, "weights v1");
  assert.equal(await scnetWeights(file, { url: "http://127.0.0.1:1/never", sha256: hex("weights v1"), bytes: 10 }), file);

  // a download that is not the expected file is refused, and nothing is left to load later
  rmSync(file);
  await assert.rejects(scnetWeights(file, { url, sha256: hex("weights v1"), bytes: 10 }), /not the expected file/);
  assert.ok(!existsSync(file) && !existsSync(`${file}.part`));

  // the expected one is kept
  assert.equal(await scnetWeights(file, { url, sha256: hex(served), bytes: 10 }), file);
  assert.equal(readFileSync(file, "utf8"), "weights v2");
});
