import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseMissionMarkdown,
  parseSimpleFrontmatter,
  requiredMissionBodyHeadings,
  validateMissionFolder,
  validateMissionMarkdown
} from "./mission-schema.mjs";

test("frontmatter parser supports mission scalar, boolean, and array fields", () => {
  const parsed = parseSimpleFrontmatter(`
id: mission-001
title: "Bind serve to localhost"
priority: P0
affectedFiles:
  - package.json
dependsOn: []
parallelGroupSafe: false
`);

  assert.equal(parsed.id, "mission-001");
  assert.equal(parsed.title, "Bind serve to localhost");
  assert.equal(parsed.priority, "P0");
  assert.deepEqual(parsed.affectedFiles, ["package.json"]);
  assert.deepEqual(parsed.dependsOn, []);
  assert.equal(parsed.parallelGroupSafe, false);
});

test("markdown parser reports whether frontmatter was delimited", () => {
  const parsed = parseMissionMarkdown(`\uFEFF${validMissionMarkdown()}`);

  assert.equal(parsed.hasFrontmatter, true);
  assert.equal(parsed.frontmatter.id, "mission-one");
  assert.match(parsed.body, /^# Mission/mu);

  const missing = parseMissionMarkdown("# Mission\n");
  assert.equal(missing.hasFrontmatter, false);
  assert.deepEqual(missing.frontmatter, {});
});

test("mission markdown validation requires schema values and body headings", () => {
  assert.equal(validateMissionMarkdown(validMissionMarkdown(), "mission-one.md").frontmatter.id, "mission-one");

  assert.throws(
    () => validateMissionMarkdown(validMissionMarkdown().replace("priority: P1", "priority: P9"), "mission-one.md"),
    /mission-one\.md frontmatter field priority must be one of: P0, P1, P2, P3\./
  );
  assert.throws(
    () => validateMissionMarkdown(validMissionMarkdown().replace("risk: medium", "risk: severe"), "mission-one.md"),
    /mission-one\.md frontmatter field risk must be one of: low, medium, high\./
  );
  assert.throws(
    () => validateMissionMarkdown(validMissionMarkdown().replace("category: quality", "category: process"), "mission-one.md"),
    /mission-one\.md frontmatter field category must be one of:/
  );
  assert.throws(
    () => validateMissionMarkdown(validMissionMarkdown().replace("\n## Scope\n\nUpdate validation.\n", "\n"), "mission-one.md"),
    /mission-one\.md is missing required body heading ## Scope\./
  );
});

test("mission folder validation rejects duplicate ids", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "missions/mission-one.md", validMissionMarkdown());
  await writeFileAt(root, "missions/nested/mission-duplicate.md", validMissionMarkdown({
    title: "Duplicate"
  }));

  await assert.rejects(
    () => validateMissionFolder({ root, folder: "missions" }),
    /Mission id mission-one is duplicated in missions\/mission-one\.md and missions\/nested\/mission-duplicate\.md\./
  );
});

test("required body heading list is the canonical contract", () => {
  assert.deepEqual(requiredMissionBodyHeadings, [
    "# Mission",
    "## Goal",
    "## Abstraction Tree Position",
    "## Why This Matters",
    "## Scope",
    "## Out of Scope",
    "## Required Checks",
    "## Success Criteria"
  ]);
});

async function tempWorkspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), "atree-mission-schema-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFileAt(root, relativePath, text) {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
  return filePath;
}

function validMissionMarkdown(input = {}) {
  const {
    id = "mission-one",
    title = "Mission One",
    category = "quality"
  } = input;

  return `---
id: ${id}
title: ${title}
priority: P1
risk: medium
category: ${category}
affectedFiles:
  - README.md
affectedNodes:
  - file.readme.md
dependsOn: []
parallelGroup: docs
parallelGroupSafe: true
---

# Mission

## Goal

Validate a bounded mission.

## Abstraction Tree Position

Scripts and tests.

## Why This Matters

Consistent contracts avoid drift.

## Scope

Update validation.

## Out of Scope

No runner behavior redesign.

## Required Checks

- node scripts/mission-schema.test.mjs

## Success Criteria

Invalid missions are rejected.
`;
}
