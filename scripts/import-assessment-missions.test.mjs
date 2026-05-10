import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  importAssessmentMissions,
  parseArgs,
  runCli
} from "./import-assessment-missions.mjs";

test("args require a source folder and import name", () => {
  assert.throws(() => parseArgs(["--name", "review"]), /--from requires/);
  assert.throws(() => parseArgs(["--from", "missions"]), /--name requires/);
  assert.throws(
    () => parseArgs(["--from", "missions", "--name", "../bad"]),
    /--name must be a slug/
  );
});

test("valid assessment missions are imported under the named manual mission folder", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/README.md", "# Review Missions\n");
  await writeFileAt(root, "chatgpt-missions/mission-one.md", validMissionMarkdown());
  await writeFileAt(root, "chatgpt-missions/nested/mission-two.md", validMissionMarkdown({
    id: "mission-two",
    title: "Mission Two"
  }));

  const result = await importAssessmentMissions({
    cwd: root,
    from: "chatgpt-missions",
    name: "review-2026-05-10"
  });

  assert.equal(result.missionCount, 2);
  assert.equal(result.fileCount, 3);
  assert.equal(
    await readFile(path.join(root, ".abstraction-tree/missions/review-2026-05-10/README.md"), "utf8"),
    "# Review Missions\n"
  );
  assert.equal(
    (await stat(path.join(root, ".abstraction-tree/missions/review-2026-05-10/nested/mission-two.md"))).isFile(),
    true
  );
});

test("README is allowed but is not treated as a mission", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/README.md", "# No Frontmatter Needed\n");

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "readme-only" }),
    /no mission Markdown files/
  );
});

test("dry run validates without creating the destination folder", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/mission-one.md", validMissionMarkdown());

  const stdout = captureStream();
  const result = await runCli([
    "--from",
    "chatgpt-missions",
    "--name",
    "dry-run-review",
    "--dry-run"
  ], {
    cwd: root,
    stdout
  });

  assert.equal(result.dryRun, true);
  assert.match(stdout.text, /Dry run validated 1 mission/);
  await assert.rejects(
    () => stat(path.join(root, ".abstraction-tree/missions/dry-run-review")),
    /ENOENT/
  );
});

test("non-Markdown files fail before copy", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/mission-one.md", validMissionMarkdown());
  await writeFileAt(root, "chatgpt-missions/notes.txt", "notes\n");

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "review" }),
    /non-Markdown file\(s\): notes\.txt/
  );
});

test("missing or invalid frontmatter fails with actionable messages", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/missing.md", "# Mission\n");

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "review" }),
    /missing\.md is missing frontmatter/
  );

  await rm(path.join(root, "chatgpt-missions"), { recursive: true, force: true });
  await writeFileAt(root, "chatgpt-missions/mission-one.md", validMissionMarkdown().replace("category: quality", "category: process"));

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "review" }),
    /category must be one of/
  );
});

test("affected files, affected nodes, and dependsOn must be arrays", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(
    root,
    "chatgpt-missions/mission-one.md",
    validMissionMarkdown().replace("dependsOn: []", "dependsOn: mission-zero")
  );

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "review" }),
    /dependsOn must be an array/
  );
});

test("mission body must include required schema headings", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(
    root,
    "chatgpt-missions/mission-one.md",
    validMissionMarkdown().replace("\n## Scope\n\nImport validation only.\n", "\n")
  );

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "review" }),
    /mission-one\.md is missing required body heading ## Scope\./
  );
});

test("duplicate mission ids fail validation", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/mission-one.md", validMissionMarkdown());
  await writeFileAt(root, "chatgpt-missions/mission-duplicate.md", validMissionMarkdown({
    title: "Duplicate Title"
  }));

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "review" }),
    /Mission id mission-one is duplicated/
  );
});

test("existing destinations require explicit overwrite", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/mission-one.md", validMissionMarkdown());
  await writeFileAt(root, ".abstraction-tree/missions/review/old.md", "old\n");

  await assert.rejects(
    () => importAssessmentMissions({ cwd: root, from: "chatgpt-missions", name: "review" }),
    /Destination already exists/
  );

  await importAssessmentMissions({
    cwd: root,
    from: "chatgpt-missions",
    name: "review",
    overwrite: true
  });

  await assert.rejects(
    () => stat(path.join(root, ".abstraction-tree/missions/review/old.md")),
    /ENOENT/
  );
  assert.equal(
    (await stat(path.join(root, ".abstraction-tree/missions/review/mission-one.md"))).isFile(),
    true
  );
});

test("runtime artifact destinations are rejected", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "chatgpt-missions/mission-one.md", validMissionMarkdown());

  await assert.rejects(
    () => importAssessmentMissions({
      cwd: root,
      from: "chatgpt-missions",
      name: "review",
      to: ".abstraction-tree/mission-runs"
    }),
    /runtime artifact folder/
  );
});

test("source and destination folders must not overlap", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, ".abstraction-tree/missions/review/mission-one.md", validMissionMarkdown());

  await assert.rejects(
    () => importAssessmentMissions({
      cwd: root,
      from: ".abstraction-tree/missions/review",
      name: "review",
      overwrite: true
    }),
    /--from and destination must not overlap/
  );
});

async function tempWorkspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), "atree-import-missions-"));
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

Import a bounded assessment mission.

## Abstraction Tree Position

Scripts and docs.

## Why This Matters

Consistent validation keeps imported missions executable.

## Scope

Import validation only.

## Out of Scope

No mission runner execution changes.

## Required Checks

- node scripts/import-assessment-missions.test.mjs

## Success Criteria

Invalid imported missions are rejected.
`;
}

function captureStream() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    }
  };
}
