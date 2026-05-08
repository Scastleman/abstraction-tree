import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { collectTestFiles, filesMatching } from "./run-tests.mjs";

function relativePaths(root, filePaths) {
  return filePaths.map(filePath => path.relative(root, filePath).replaceAll("\\", "/"));
}

test("filesMatching recursively returns sorted matching files", async t => {
  const root = path.join(process.cwd(), ".tmp-run-tests-files-matching");
  await rm(root, { recursive: true, force: true });
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, "nested"), { recursive: true });
  await writeFile(path.join(root, "alpha.test.mjs"), "export {};\n", "utf8");
  await writeFile(path.join(root, "nested", "beta.test.mjs"), "export {};\n", "utf8");
  await writeFile(path.join(root, "nested", "helper.mjs"), "export {};\n", "utf8");

  const matches = await filesMatching(root, filePath => filePath.endsWith(".test.mjs"));

  assert.deepEqual(relativePaths(root, matches), ["alpha.test.mjs", "nested/beta.test.mjs"]);
});

test("collectTestFiles discovers nested package and script tests", async t => {
  const root = path.join(process.cwd(), ".tmp-run-tests-collect");
  await rm(root, { recursive: true, force: true });
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(path.join(root, "packages", "core", "dist", "nested"), { recursive: true });
  await mkdir(path.join(root, "packages", "cli", "dist"), { recursive: true });
  await mkdir(path.join(root, "scripts", "nested"), { recursive: true });
  await writeFile(path.join(root, "packages", "core", "dist", "core.test.js"), "export {};\n", "utf8");
  await writeFile(path.join(root, "packages", "core", "dist", "nested", "core-nested.test.js"), "export {};\n", "utf8");
  await writeFile(path.join(root, "packages", "cli", "dist", "cli.test.js"), "export {};\n", "utf8");
  await writeFile(path.join(root, "scripts", "runner.test.mjs"), "export {};\n", "utf8");
  await writeFile(path.join(root, "scripts", "nested", "runner-nested.test.mjs"), "export {};\n", "utf8");
  await writeFile(path.join(root, "scripts", "nested", "helper.mjs"), "export {};\n", "utf8");

  const matches = await collectTestFiles(root);

  assert.deepEqual(relativePaths(root, matches), [
    "packages/core/dist/core.test.js",
    "packages/core/dist/nested/core-nested.test.js",
    "packages/cli/dist/cli.test.js",
    "scripts/nested/runner-nested.test.mjs",
    "scripts/runner.test.mjs"
  ]);
});
