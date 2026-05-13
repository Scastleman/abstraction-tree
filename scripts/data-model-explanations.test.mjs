import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("data model docs describe node explanations", async () => {
  const dataModel = await readFile(path.join(repoRoot, "docs", "DATA_MODEL.md"), "utf8");
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");

  assert.match(dataModel, /`summary` is the short fallback text/);
  assert.match(dataModel, /`explanation` is the richer human-readable project-comprehension field/);
  assert.match(dataModel, /`separationLogic` describes the partition rule/);
  assert.match(readme, /Tree nodes keep a short `summary`, a richer `explanation`, and, when the node has children, `separationLogic`/);
});
