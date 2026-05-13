import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  atreePath,
  ensureWorkspace,
  writeJson,
  type Concept,
  type FileSummary,
  type Invariant,
  type TreeNode
} from "@abstraction-tree/core";
import { runGoalCommand } from "./goalCommand.js";

test("goal command plan-only writes a complete workspace and preserves the original goal", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  const goalText = "Implement billing safely.\n\nDo not overreach beyond the billing scope.";
  await writeGoal(root, "prompts/billing.md", goalText);
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompts/billing.md",
    planOnly: true,
    createdAt: new Date(2026, 4, 13, 10, 5)
  }, capture.io);

  const goalDir = path.join(root, ".abstraction-tree", "goals", "2026-05-13-1005-billing");
  assert.equal(exitCode, 0);
  assert.deepEqual(capture.stderr, []);
  assert.match(capture.stdout[0] ?? "", /Plan-only mode did not run Codex/);
  assert.equal(await readFile(path.join(goalDir, "goal.md"), "utf8"), goalText);
  assert.match(await readFile(path.join(goalDir, "goal-assessment.md"), "utf8"), /## Completion Criteria/);
  await assert.doesNotReject(() => readFile(path.join(goalDir, "affected-tree.json"), "utf8"));
  await assert.doesNotReject(() => readFile(path.join(goalDir, "mission-plan.json"), "utf8"));
  await assert.doesNotReject(() => readFile(path.join(goalDir, "coherence-review.md"), "utf8"));
  await assert.doesNotReject(() => readFile(path.join(goalDir, "final-report.md"), "utf8"));
  const missions = await readdir(path.join(goalDir, "missions"));
  assert.ok(missions.some(name => name.endsWith(".md")));
});

test("goal command review-required prints mission runner commands", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "goal.md", "Add goal-driven planning.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "goal.md",
    reviewRequired: true,
    createdAt: new Date(2026, 4, 13, 10, 10)
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout[0] ?? "", /npm run missions:plan -- --missions \.abstraction-tree\/goals\/2026-05-13-1010-goal\/missions/);
  assert.match(capture.stdout[0] ?? "", /npm run missions:run -- --missions \.abstraction-tree\/goals\/2026-05-13-1010-goal\/missions/);
});

test("goal command full-auto plans but refuses unsafe execution", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "goal.md", "Run a complex goal automatically.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "goal.md",
    fullAuto: true,
    createdAt: new Date(2026, 4, 13, 10, 15)
  }, capture.io);

  assert.equal(exitCode, 2);
  assert.match(capture.stdout[0] ?? "", /Full-auto mode planned the goal but did not execute missions/);
  assert.match(capture.stderr[0] ?? "", /Full-auto goal execution is intentionally disabled/);
  await assert.doesNotReject(() => readFile(path.join(root, ".abstraction-tree", "goals", "2026-05-13-1015-goal", "final-report.md"), "utf8"));
});

test("goal command create-pr writes draft PR body without pushing", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "goal.md", "Prepare a PR body for a complex goal.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "goal.md",
    createPr: true,
    createdAt: new Date(2026, 4, 13, 10, 20)
  }, capture.io);

  const prBody = await readFile(path.join(root, ".abstraction-tree", "goals", "2026-05-13-1020-goal", "pr-body.md"), "utf8");
  assert.equal(exitCode, 0);
  assert.match(capture.stdout[0] ?? "", /Wrote draft PR body/);
  assert.match(prBody, /# Goal-Driven Abstraction Tree PR/);
  assert.match(prBody, /No push, PR creation, or merge was performed|pending mission execution/i);
});

test("goal command missing file fails clearly", async t => {
  const root = await workspace(t);
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "missing.md",
    planOnly: true
  }, capture.io);

  assert.equal(exitCode, 1);
  assert.match(capture.stderr[0] ?? "", /Goal file not found: missing\.md/);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-goal-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await ensureWorkspace(root, { installMode: "core", projectName: "Goal Command Project" });
  return root;
}

async function writeGoal(root: string, goalPath: string, goalText: string): Promise<void> {
  const absolutePath = path.join(root, goalPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, goalText, "utf8");
}

async function writeFixtureMemory(root: string): Promise<void> {
  await writeJson(atreePath(root, "tree.json"), fixtureNodes());
  await writeJson(atreePath(root, "files.json"), fixtureFiles());
  await writeJson(atreePath(root, "concepts.json"), fixtureConcepts());
  await writeJson(atreePath(root, "invariants.json"), fixtureInvariants());
}

function fixtureNodes(): TreeNode[] {
  return [
    node("project.intent", "Project intent", "project", "Project purpose and safe agent scope.", ["README.md"]),
    node("architecture.cli.surface", "CLI surface", "architecture", "Command surface for atree workflows.", [
      "packages/cli/src/index.ts",
      "packages/cli/src/goalCommand.ts"
    ]),
    node("architecture.core.engine", "Core engine", "architecture", "Core deterministic planning utilities.", [
      "packages/core/src/goal.ts"
    ])
  ];
}

function fixtureFiles(): FileSummary[] {
  return [
    file("README.md", "Project docs.", false),
    file("packages/cli/src/index.ts", "CLI command registry.", false, ["goal"]),
    file("packages/cli/src/goalCommand.ts", "Goal command implementation.", false, ["runGoalCommand"]),
    file("packages/core/src/goal.ts", "Goal planner.", false, ["buildGoalWorkspacePlan"]),
    file("packages/cli/src/goalCommand.test.ts", "Goal command tests.", true)
  ];
}

function fixtureConcepts(): Concept[] {
  return [{
    id: "mission-planning",
    title: "Mission planning",
    summary: "Mission folders keep large goals bounded.",
    relatedNodeIds: ["architecture.cli.surface"],
    relatedFiles: ["packages/core/src/goal.ts"],
    tags: ["goal", "mission"],
    evidence: []
  }];
}

function fixtureInvariants(): Invariant[] {
  return [{
    id: "invariant.goal-review-required",
    title: "Review before execution",
    description: "Complex goals should be reviewed before automatic mission execution.",
    nodeIds: ["architecture.cli.surface"],
    filePaths: ["packages/cli/src/index.ts"],
    severity: "high"
  }];
}

function node(id: string, title: string, level: string, summary: string, ownedFiles: string[]): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: level,
    level,
    summary,
    children: [],
    sourceFiles: ownedFiles,
    ownedFiles,
    responsibilities: [summary],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: {
      allowedToChange: ownedFiles,
      mustNotChange: []
    },
    confidence: 0.8
  };
}

function file(filePath: string, summary: string, isTest: boolean, symbols: string[] = []): FileSummary {
  return {
    path: filePath,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    language: filePath.endsWith(".md") ? "Markdown" : "TypeScript",
    sizeBytes: 10,
    lines: 1,
    imports: [],
    exports: symbols,
    symbols,
    isTest,
    summary,
    ownedByNodeIds: []
  };
}

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text)
    }
  };
}
