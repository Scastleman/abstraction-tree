import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { readJson } from "./workspace.js";

test("readJson accepts JSON files with a leading BOM", async t => {
  const root = await workspace(t);
  const filePath = path.join(root, "state.json");
  await writeFile(filePath, "\ufeff{\"ok\":true}", "utf8");

  assert.deepEqual(await readJson(filePath, { ok: false }), { ok: true });
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-workspace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
