import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildAssessmentPrompt,
  buildCoherencePrompt,
  buildDurableRunReport,
  parseArgs,
  runCli,
  validateAssessmentOutput
} from "./run-full-self-improvement-loop.mjs";

test("full-loop args parse safe defaults", () => {
  const parsed = parseArgs([]);

  assert.equal(parsed.sandbox, "workspace-write");
  assert.equal(parsed.allowDangerFullAccess, false);
  assert.equal(parsed.allowMultipleAutomationMaintenance, false);
});

test("full-loop args parse safe defaults and explicit controls", () => {
  const parsed = parseArgs([
    "--max-missions",
    "2",
    "--concurrency",
    "3",
    "--allow-dirty",
    "--skip-missions",
    "--allow-multiple-automation-maintenance",
    "--reasoning-effort",
    "medium"
  ]);

  assert.equal(parsed.maxMissions, 2);
  assert.equal(parsed.concurrency, 3);
  assert.equal(parsed.sandbox, "workspace-write");
  assert.equal(parsed.allowDirty, true);
  assert.equal(parsed.skipMissions, true);
  assert.equal(parsed.allowMultipleAutomationMaintenance, true);
  assert.equal(parsed.reasoningEffort, "medium");
});

test("full-loop rejects danger-full-access without explicit allow flag", () => {
  assert.throws(
    () => parseArgs(["--sandbox", "danger-full-access"]),
    /--sandbox danger-full-access requires --allow-danger-full-access\./
  );
});

test("full-loop accepts danger-full-access with explicit allow flag", () => {
  const parsed = parseArgs([
    "--sandbox",
    "danger-full-access",
    "--allow-danger-full-access"
  ]);

  assert.equal(parsed.sandbox, "danger-full-access");
  assert.equal(parsed.allowDangerFullAccess, true);
});

test("assessment prompt states full project goal and mission output contract", () => {
  const prompt = buildAssessmentPrompt({
    repoRoot: "C:/repo",
    runDir: "C:/repo/.abstraction-tree/automation/full-loop-runs/run",
    missionsDir: "C:/repo/.abstraction-tree/automation/full-loop-runs/run/missions",
    maxMissions: 3,
    context: { gitStatus: "clean" }
  });

  assert.match(prompt, /Integrate an abstraction tree into any project/);
  assert.match(prompt, /developers understand the scope of their prompts/);
  assert.match(prompt, /up to 3 mission Markdown files/);
  assert.match(prompt, /category: product-value \| safety \| quality \| developer-experience \| automation-maintenance/);
  assert.match(prompt, /Create at most one automation-maintenance mission/);
  assert.match(prompt, /Prefer product-value, safety, quality, and developer-experience missions/);
  assert.match(prompt, /Abstraction Tree Position/);
});

test("coherence prompt asks whether to stop or repeat", () => {
  const prompt = buildCoherencePrompt({
    repoRoot: "C:/repo",
    runDir: "C:/repo/.abstraction-tree/automation/full-loop-runs/run",
    missionsDir: "C:/repo/.abstraction-tree/automation/full-loop-runs/run/missions",
    context: { diffSummary: "none" }
  });

  assert.match(prompt, /coherence/i);
  assert.match(prompt, /stop or repeat/i);
  assert.match(prompt, /agents avoid unnecessary overreach/);
});

test("durable run report records runtime artifact policy", () => {
  const report = buildDurableRunReport({
    runDir: ".abstraction-tree/automation/full-loop-runs/run",
    selectedIds: ["mission-one", "mission-two"],
    missionRunnerFailed: false,
    changeReviewExitCode: 0,
    decision: "# Decision\n\nStop."
  });

  assert.match(report, /Full Self-Improvement Loop Report/);
  assert.match(report, /- mission-one/);
  assert.match(report, /ignored local runtime state/);
  assert.match(report, /\.abstraction-tree\/runs/);
});

test("valid assessment output passes validation", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", validMissionMarkdown());

  const missions = await validateAssessmentOutput({
    cwd: root,
    runDir,
    missionsDir,
    maxMissions: 1
  });

  assert.deepEqual(missions.map(filePath => relativePath(root, filePath)), ["run/missions/mission-one.md"]);
});

test("assessment output validation fails when a mission is missing frontmatter", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", "# Mission\n");

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /run\/missions\/mission-one\.md.*missing frontmatter/
  );
});

test("assessment output validation fails when a mission is missing required frontmatter fields", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", validMissionMarkdown().replace(/^risk: low\n/mu, ""));

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /run\/missions\/mission-one\.md.*risk/
  );
});

test("assessment output validation fails when a mission is missing category", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", validMissionMarkdown().replace(/^category: quality\n/mu, ""));

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /run\/missions\/mission-one\.md.*category/
  );
});

test("assessment output validation fails when a mission has invalid category", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(
    root,
    "run/missions/mission-one.md",
    validMissionMarkdown().replace("category: quality", "category: process-maintenance")
  );

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /run\/missions\/mission-one\.md.*category must be one of/
  );
});

test("assessment output validation rejects multiple automation-maintenance missions by default", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", validMissionMarkdown({
    id: "mission-one",
    title: "Mission One",
    category: "automation-maintenance"
  }));
  await writeFileAt(root, "run/missions/mission-two.md", validMissionMarkdown({
    id: "mission-two",
    title: "Mission Two",
    category: "automation-maintenance"
  }));

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 2 }),
    /Assessment created 2 automation-maintenance mission files, but at most one is allowed by default/
  );
});

test("assessment output validation allows multiple automation-maintenance missions with override", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", validMissionMarkdown({
    id: "mission-one",
    title: "Mission One",
    category: "automation-maintenance"
  }));
  await writeFileAt(root, "run/missions/mission-two.md", validMissionMarkdown({
    id: "mission-two",
    title: "Mission Two",
    category: "automation-maintenance"
  }));

  const missions = await validateAssessmentOutput({
    cwd: root,
    runDir,
    missionsDir,
    maxMissions: 2,
    allowMultipleAutomationMaintenance: true
  });

  assert.deepEqual(missions.map(filePath => relativePath(root, filePath)), [
    "run/missions/mission-one.md",
    "run/missions/mission-two.md"
  ]);
});

test("assessment output validation fails when parallelGroupSafe is not boolean", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(
    root,
    "run/missions/mission-one.md",
    validMissionMarkdown().replace("parallelGroupSafe: true", "parallelGroupSafe: maybe")
  );

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /run\/missions\/mission-one\.md.*parallelGroupSafe.*boolean/
  );
});

test("assessment output validation fails when required body sections are missing", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", validMissionMarkdown().replace("\n## Scope\n\nUpdate validation only.\n", "\n"));

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /run\/missions\/mission-one\.md.*## Scope/
  );
});

test("assessment output validation fails without assessment.md", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", "# Mission One\n");

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /Assessment did not create run\/assessment\.md/
  );
});

test("assessment output validation fails without missions README", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/mission-one.md", "# Mission One\n");

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /Assessment did not create run\/missions\/README\.md/
  );
});

test("assessment output validation fails when too many missions are written", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", "# Mission One\n");
  await writeFileAt(root, "run/missions/mission-two.md", "# Mission Two\n");

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /Assessment created 2 mission files, but the configured maximum is 1/
  );
});

test("assessment output validation fails for mission Markdown outside missions directory", async t => {
  const root = await tempWorkspace(t);
  const { runDir, missionsDir } = assessmentPaths(root);
  await writeFileAt(root, "run/assessment.md", "# Assessment\n");
  await writeFileAt(root, "run/missions/README.md", "# Missions\n");
  await writeFileAt(root, "run/missions/mission-one.md", "# Mission One\n");
  await writeFileAt(root, "run/mission-outside.md", "# Mission Outside\n");

  await assert.rejects(
    () => validateAssessmentOutput({ cwd: root, runDir, missionsDir, maxMissions: 1 }),
    /outside configured missions directory .*run\/mission-outside\.md/
  );
});

test("dry run writes assessment prompt without invoking Codex", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "package.json", "{}\n");
  await writeFileAt(root, ".abstraction-tree/automation/mission-runtime.json", "{}\n");
  await writeFileAt(root, ".abstraction-tree/evaluations/2026-05-08-evaluation.json", "{}\n");

  const stdout = captureStream();
  await runCli(["--dry-run", "--allow-dirty"], {
    cwd: root,
    stdout,
    stderr: captureStream(),
    command: fakeCommand()
  });

  assert.match(stdout.text, /Full self-improvement loop dry run/);
  const promptPath = stdout.text.match(/Assessment prompt: (.+)/)?.[1]?.trim();
  assert.ok(promptPath);
  const prompt = await readFile(path.join(root, ...promptPath.split("/")), "utf8");
  assert.match(prompt, /Full Abstraction Tree Self-Improvement Loop/);
});

test("dry run still rejects danger-full-access without explicit allow flag", async t => {
  const root = await tempWorkspace(t);
  let commandCalled = false;

  await assert.rejects(
    () => runCli(["--dry-run", "--allow-dirty", "--sandbox", "danger-full-access"], {
      cwd: root,
      stdout: captureStream(),
      stderr: captureStream(),
      command() {
        commandCalled = true;
        throw new Error("should not run commands");
      }
    }),
    /--sandbox danger-full-access requires --allow-danger-full-access\./
  );
  assert.equal(commandCalled, false);
});

async function tempWorkspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), "atree-full-loop-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFileAt(root, relativePath, text) {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
  return filePath;
}

function assessmentPaths(root) {
  return {
    runDir: path.join(root, "run"),
    missionsDir: path.join(root, "run", "missions")
  };
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
priority: P0
risk: low
category: ${category}
affectedFiles:
  - scripts/run-full-self-improvement-loop.mjs
affectedNodes:
  - file.scripts.run.full.self.improvement.loop.mjs
dependsOn: []
parallelGroup: full-loop
parallelGroupSafe: true
---

# Mission

## Goal

Validate generated missions before planning.

## Abstraction Tree Position

Architecture and tests.

## Why This Matters

Bare missions weaken scope controls.

## Scope

Update validation only.

## Out of Scope

No planning semantic changes.

## Required Checks

- node --test scripts/run-full-self-improvement-loop.test.mjs

## Success Criteria

Invalid generated missions are rejected.
`;
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function fakeCommand() {
  return async () => ({
    exitCode: 0,
    stdout: "",
    stderr: ""
  });
}

function captureStream() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    }
  };
}
