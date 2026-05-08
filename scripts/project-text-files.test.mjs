import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  listFallbackProjectFiles,
  normalizePath,
  shouldIgnoreFallbackPath,
  supportsTextProcessing
} from "./project-text-files.mjs";

test("supportsTextProcessing recognizes shared script text extensions", () => {
  assert.equal(supportsTextProcessing("src/app.ts"), true);
  assert.equal(supportsTextProcessing("scripts/run.ps1"), true);
  assert.equal(supportsTextProcessing("docs/notes.markdown"), true);
  assert.equal(supportsTextProcessing("assets/logo.png"), false);
});

test("fallback project file listing skips transient and generated directories", async t => {
  const root = path.join(process.cwd(), ".tmp-project-text-files-test");
  await rm(root, { recursive: true, force: true });
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, ".abstraction-tree", "automation", "mission-logs"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "dep"), { recursive: true });
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");
  await writeFile(path.join(root, ".abstraction-tree", "automation", "mission-runtime.json"), "{}\n", "utf8");
  await writeFile(path.join(root, ".abstraction-tree", "automation", "mission-logs", "run.log"), "log\n", "utf8");
  await writeFile(path.join(root, "node_modules", "dep", "index.js"), "module.exports = 1;\n", "utf8");

  assert.deepEqual(await listFallbackProjectFiles(root), ["src/index.ts"]);
});

test("fallback ignores normalize Windows-style runtime paths", () => {
  assert.equal(normalizePath("src\\index.ts"), "src/index.ts");
  assert.equal(shouldIgnoreFallbackPath(".abstraction-tree\\automation\\loop-runtime.json"), true);
});
