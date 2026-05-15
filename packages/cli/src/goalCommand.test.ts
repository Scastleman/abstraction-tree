import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
  await assert.doesNotReject(() => readFile(path.join(goalDir, "scope-contract.json"), "utf8"));
  await assert.doesNotReject(() => readFile(path.join(goalDir, "scope-contract.md"), "utf8"));
  await assert.doesNotReject(() => readFile(path.join(goalDir, "goal-score.json"), "utf8"));
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
  assert.match(capture.stdout[0] ?? "", /npx atree scope check --project \. --scope \.abstraction-tree\/goals\/2026-05-13-1010-goal\/scope-contract\.json/);
});

test("goal command prefers repo-local atree scripts for review commands", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeProjectFile(root, "package.json", JSON.stringify({
    scripts: {
      atree: "node packages/cli/dist/index.js",
      "atree:evaluate": "node packages/cli/dist/index.js evaluate --project ."
    }
  }));
  await writeGoal(root, "goal.md", "Add goal-driven planning.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "goal.md",
    reviewRequired: true,
    createdAt: new Date(2026, 4, 13, 10, 12)
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout[0] ?? "", /npm run atree -- scope check --project \. --scope \.abstraction-tree\/goals\/2026-05-13-1012-goal\/scope-contract\.json/);
  assert.match(capture.stdout[0] ?? "", /npm run atree:evaluate/);
  assert.doesNotMatch(capture.stdout[0] ?? "", /npx atree scope check/);
});

test("goal command reads mission planning overrides from config", async t => {
  const root = await workspace(t);
  await writeJson(atreePath(root, "tree.json"), fixtureNodes());
  await writeJson(atreePath(root, "files.json"), [
    ...fixtureFiles(),
    file("handbook/goal-planning.md", "Custom handbook docs.", false),
    file("quality/goal-planning.spec.ts", "Custom quality tests.", true)
  ]);
  await writeJson(atreePath(root, "concepts.json"), fixtureConcepts());
  await writeJson(atreePath(root, "invariants.json"), fixtureInvariants());
  const config = JSON.parse(await readFile(atreePath(root, "config.json"), "utf8"));
  await writeJson(atreePath(root, "config.json"), {
    ...config,
    missionPlanning: {
      docsPatterns: ["handbook/**/*.md"],
      testPatterns: ["quality/**/*.spec.ts"],
      testCommands: ["custom:test"],
      docsCommands: ["custom:docs"]
    }
  });
  await writeGoal(root, "goal.md", "Update goal planning docs and tests.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "goal.md",
    planOnly: true,
    createdAt: new Date(2026, 4, 13, 10, 11)
  }, capture.io);

  const missionPlan = JSON.parse(await readFile(path.join(root, ".abstraction-tree", "goals", "2026-05-13-1011-goal", "mission-plan.json"), "utf8"));
  const missionFiles = (missionPlan.missions as Array<{ success_checks: string[] }>).flatMap(mission => mission.success_checks);
  const missionMarkdown = await readFile(path.join(root, ".abstraction-tree", "goals", "2026-05-13-1011-goal", "missions", "02-tests-and-validation.md"), "utf8");
  assert.equal(exitCode, 0);
  assert.ok(missionFiles.includes("custom:test"));
  assert.ok(missionFiles.includes("custom:docs"));
  assert.match(missionMarkdown, /quality\/goal-planning\.spec\.ts/);
});

test("goal command auto-route writes route and scope artifacts for goal-driven prompts", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "prompts/billing.md", "Add subscription billing with checkout, webhooks, user plans, tests, and docs.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompts/billing.md",
    reviewRequired: true,
    autoRoute: true,
    createdAt: new Date(2026, 4, 13, 10, 12)
  }, capture.io);

  const goalDir = path.join(root, ".abstraction-tree", "goals", "2026-05-13-1012-billing");
  const route = JSON.parse(await readFile(path.join(goalDir, "route.json"), "utf8"));
  const scope = JSON.parse(await readFile(path.join(goalDir, "scope-contract.json"), "utf8"));
  const finalReport = await readFile(path.join(goalDir, "final-report.md"), "utf8");
  assert.equal(exitCode, 0);
  assert.equal(route.route.decision, "goal-driven");
  assert.equal(route.overridden, false);
  assert.match(await readFile(path.join(goalDir, "route.md"), "utf8"), /# Goal Route/);
  assert.match(scope.id, /2026-05-13-1012-billing-scope/);
  assert.match(finalReport, /## Routing Decision/);
  assert.match(finalReport, /## Scope Result/);
});

test("goal command auto-route stops direct prompts before creating a goal workspace", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "prompt.md", "Fix the typo in README.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompt.md",
    reviewRequired: true,
    autoRoute: true,
    createdAt: new Date(2026, 4, 13, 10, 13)
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout.join("\n"), /Routing decision: direct/);
  assert.deepEqual(await goalWorkspaceNames(root), []);
});

test("goal command auto-route stops assessment-pack prompts", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "prompt.md", "Assess the whole repo and make a roadmap of improvements.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompt.md",
    reviewRequired: true,
    autoRoute: true
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout.join("\n"), /Routing decision: assessment-pack/);
  assert.deepEqual(await goalWorkspaceNames(root), []);
});

test("goal command auto-route stops manual-review prompts with manual-review exit", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "prompt.md", "Delete the whole repo and bypass failing tests.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompt.md",
    reviewRequired: true,
    autoRoute: true
  }, capture.io);

  assert.equal(exitCode, 2);
  assert.match(capture.stdout.join("\n"), /Routing decision: manual-review/);
  assert.deepEqual(await goalWorkspaceNames(root), []);
});

test("goal command force-goal records route override", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "prompt.md", "Fix the typo in README.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompt.md",
    reviewRequired: true,
    autoRoute: true,
    forceGoal: true,
    createdAt: new Date(2026, 4, 13, 10, 14)
  }, capture.io);

  const route = JSON.parse(await readFile(path.join(root, ".abstraction-tree", "goals", "2026-05-13-1014-prompt", "route.json"), "utf8"));
  assert.equal(exitCode, 0);
  assert.equal(route.route.decision, "direct");
  assert.equal(route.overridden, true);
  assert.match(capture.stdout.join("\n"), /--force-goal override recorded/);
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

test("goal command run refuses clearly and writes checks, score, and PR body when requested", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writeGoal(root, "goal.md", "Run a complex goal through missions and prepare a PR body.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "goal.md",
    run: true,
    createPr: true,
    createdAt: new Date(2026, 4, 13, 10, 16)
  }, capture.io);

  const goalDir = path.join(root, ".abstraction-tree", "goals", "2026-05-13-1016-goal");
  const checks = JSON.parse(await readFile(path.join(goalDir, "checks.json"), "utf8"));
  const score = JSON.parse(await readFile(path.join(goalDir, "goal-score.json"), "utf8"));
  const prBody = await readFile(path.join(goalDir, "pr-body.md"), "utf8");
  assert.equal(exitCode, 2);
  assert.equal(checks.status, "not-run");
  assert.equal(score.status, "execution-refused");
  assert.match(prBody, /## Scope Check/);
  assert.match(capture.stderr[0] ?? "", /Run goal execution is intentionally disabled/);
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
  await writeProjectFile(root, goalPath, goalText);
}

async function writeProjectFile(root: string, filePath: string, content: string): Promise<void> {
  const absolutePath = path.join(root, filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function goalWorkspaceNames(root: string): Promise<string[]> {
  const goalsDir = path.join(root, ".abstraction-tree", "goals");
  if (!existsSync(goalsDir)) return [];
  return (await readdir(goalsDir)).sort();
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
