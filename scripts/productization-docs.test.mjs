import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publishTagForVersion } from "./release-dry-run.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("README routes new users to productization docs and stable demo commands", async () => {
  const readme = await readProjectFile("README.md");

  assert.match(readme, /docs\/GETTING_STARTED\.md/);
  assert.match(readme, /docs\/STABLE_VS_EXPERIMENTAL\.md/);
  assert.match(readme, /docs\/VISUAL_DEMO\.md/);
  assert.match(readme, /atree -- export --project examples\/small-web-app --format mermaid/);
});

test("stable vs experimental doc labels core, beta, and experimental surfaces", async () => {
  const doc = await readProjectFile("docs/STABLE_VS_EXPERIMENTAL.md");

  assert.match(doc, /`init`, `scan`, `doctor`, `validate`, `migrate`\s*\| Stable MVP/);
  assert.match(doc, /`route`\s*\| Beta/);
  assert.match(doc, /`missions:run`\s*\| Experimental/);
  assert.match(doc, /`goal --run`, `goal --full-auto`\s*\| Not stable/);
});

test("getting started stays on the provider-free beginner path", async () => {
  const doc = await readProjectFile("docs/GETTING_STARTED.md");

  assert.match(doc, /No API key is required/);
  assert.match(doc, /Scan the Included Example/);
  assert.doesNotMatch(doc, /danger-full-access/);
});

test("packaging docs and release dry run agree on package smoke preflight", async () => {
  const packaging = await readProjectFile("docs/PACKAGING.md");
  const releaseDryRun = await readProjectFile("scripts/release-dry-run.mjs");

  assert.match(packaging, /`release:dry-run` verifies synchronized package versions/);
  assert.match(packaging, /runs the package smoke test/);
  assert.match(releaseDryRun, /pack-smoke-test\.mjs/);
  assert.match(releaseDryRun, /--tag/);
});

test("release dry run uses explicit npm tags for prerelease versions", () => {
  assert.equal(publishTagForVersion("0.2.0-beta.1"), "beta");
  assert.equal(publishTagForVersion("1.0.0-rc.1"), "next");
  assert.equal(publishTagForVersion("1.0.0"), undefined);
});

async function readProjectFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}
