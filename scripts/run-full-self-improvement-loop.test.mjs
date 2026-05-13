import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import {
  buildAssessmentPrompt,
  buildCoherencePrompt,
  buildDurableRunReport,
  parseArgs,
  runCli,
  validateAssessmentOutput
} from "./run-full-self-improvement-loop.mjs";
import { requiredPackFiles } from "./create-assessment-pack.mjs";

const fixedDate = new Date("2026-05-10T12:00:00.000Z");

test("full-loop args parse safe defaults", () => {
  const parsed = parseArgs([]);

  assert.equal(parsed.sandbox, "workspace-write");
  assert.equal(parsed.allowDangerFullAccess, false);
  assert.equal(parsed.allowMultipleAutomationMaintenance, false);
  assert.equal(parsed.assessmentPackOnly, false);
  assert.equal(parsed.externalCoherenceReview, false);
  assert.equal(parsed.skipCodexAssessment, false);
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
    "--external-coherence-review",
    "--skip-codex-assessment",
    "--missions",
    ".abstraction-tree/missions/review",
    "--reasoning-effort",
    "medium"
  ]);

  assert.equal(parsed.maxMissions, 2);
  assert.equal(parsed.concurrency, 3);
  assert.equal(parsed.sandbox, "workspace-write");
  assert.equal(parsed.allowDirty, true);
  assert.equal(parsed.skipMissions, true);
  assert.equal(parsed.externalCoherenceReview, true);
  assert.equal(parsed.skipCodexAssessment, true);
  assert.equal(parsed.missions, ".abstraction-tree/missions/review");
  assert.equal(parsed.allowMultipleAutomationMaintenance, true);
  assert.equal(parsed.reasoningEffort, "medium");
});

test("full-loop args parse assessment-pack-only flag", () => {
  const parsed = parseArgs(["--assessment-pack-only", "--allow-dirty"]);

  assert.equal(parsed.assessmentPackOnly, true);
  assert.equal(parsed.allowDirty, true);
});

test("full-loop args parse external coherence review flag", () => {
  const parsed = parseArgs([
    "--external-coherence-review",
    "--skip-codex-assessment",
    "--missions",
    ".abstraction-tree/missions/review"
  ]);

  assert.equal(parsed.externalCoherenceReview, true);
});

test("full-loop rejects assessment-pack-only with mission-source flags", () => {
  assert.throws(
    () => parseArgs([
      "--assessment-pack-only",
      "--skip-codex-assessment",
      "--missions",
      ".abstraction-tree/missions/review"
    ]),
    /--assessment-pack-only cannot be combined with --skip-codex-assessment\./
  );
  assert.throws(
    () => parseArgs([
      "--assessment-pack-only",
      "--missions",
      ".abstraction-tree/missions/review"
    ]),
    /--missions is not supported with --assessment-pack-only\./
  );
});

test("full-loop rejects external coherence review before post-run context exists", () => {
  assert.throws(
    () => parseArgs([
      "--external-coherence-review",
      "--assessment-pack-only"
    ]),
    /--external-coherence-review cannot be combined with --assessment-pack-only\./
  );
  assert.throws(
    () => parseArgs([
      "--external-coherence-review",
      "--dry-run"
    ]),
    /--external-coherence-review cannot be combined with --dry-run\./
  );
});

test("full-loop rejects skip-codex-assessment without missions folder", () => {
  assert.throws(
    () => parseArgs(["--skip-codex-assessment"]),
    /--skip-codex-assessment requires --missions <folder>\./
  );
});

test("full-loop rejects missions folder without skip-codex-assessment", () => {
  assert.throws(
    () => parseArgs(["--missions", ".abstraction-tree/missions/review"]),
    /--missions is only supported with --skip-codex-assessment\./
  );
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

  assert.match(report, /Assisted Improvement Loop Report/);
  assert.match(report, /- mission-one/);
  assert.match(report, /ignored local runtime state/);
  assert.match(report, /\.abstraction-tree\/runs/);
});

test("durable run report labels external strategy source", () => {
  const report = buildDurableRunReport({
    runDir: ".abstraction-tree/automation/full-loop-runs/run",
    missionsDir: ".abstraction-tree/missions/review",
    strategySource: "external",
    selectedIds: ["mission-one"],
    missionRunnerFailed: false,
    changeReviewExitCode: 0,
    decision: "# Decision\n\nStop."
  });

  assert.match(report, /external ChatGPT\/human-authored mission folder/);
  assert.match(report, /Codex assessment skipped/);
  assert.match(report, /\.abstraction-tree\/missions\/review/);
});

test("durable run report marks external coherence review pending", () => {
  const report = buildDurableRunReport({
    runDir: ".abstraction-tree/automation/full-loop-runs/run",
    missionsDir: ".abstraction-tree/missions/review",
    selectedIds: ["mission-one"],
    missionRunnerFailed: false,
    changeReviewExitCode: 0,
    coherenceReviewStatus: "pending-external-review",
    decision: "# Decision\n\nStop."
  });

  assert.match(report, /Coherence review: pending external ChatGPT\/human review/);
  assert.match(report, /external-coherence-review-pending/);
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

  assert.match(stdout.text, /Experimental assisted improvement loop dry run/);
  const promptPath = stdout.text.match(/Assessment prompt: (.+)/)?.[1]?.trim();
  assert.ok(promptPath);
  const prompt = await readFile(path.join(root, ...promptPath.split("/")), "utf8");
  assert.match(prompt, /Abstraction Tree Assisted Improvement Loop/);
});

test("assessment-pack-only creates pack and exits before Codex or missions", async t => {
  const root = await tempWorkspace(t);
  await writeBaseAssessmentMemory(root);

  const commands = [];
  const spawnCalls = [];
  const stdout = captureStream();
  const result = await runCli(["--assessment-pack-only"], {
    cwd: root,
    now: fixedDate,
    stdout,
    stderr: captureStream(),
    command: fakeCommand(commands),
    spawnProcess: fakeCodexSpawn(spawnCalls)
  });

  const expectedPackDir = ".abstraction-tree/automation/full-loop-runs/2026-05-10T12-00-00-000Z/assessment-pack/2026-05-10T12-00-00-000Z";
  assert.equal(relativePath(root, result.runDir), ".abstraction-tree/automation/full-loop-runs/2026-05-10T12-00-00-000Z");
  assert.equal(relativePath(root, result.assessmentPackDir), expectedPackDir);
  assert.equal(result.assessmentPackOnly, true);
  assert.equal(result.strategySource, "assessment-pack-only");

  assert.match(stdout.text, new RegExp(`Assessment pack created: ${escapeRegExp(expectedPackDir)}`));
  assert.match(stdout.text, new RegExp(`Assessment prompt: ${escapeRegExp(`${expectedPackDir}/assessment-prompt.md`)}`));

  for (const file of requiredPackFiles) {
    assert.equal((await stat(path.join(result.assessmentPackDir, file))).isFile(), true, file);
  }

  const artifact = JSON.parse(await readFile(path.join(result.runDir, "assessment-pack.json"), "utf8"));
  assert.equal(artifact.packDir, expectedPackDir);
  assert.deepEqual(commands.map(command => `${command.file} ${command.args.join(" ")}`), [
    "git status --short --branch",
    "git log --oneline -1",
    "node scripts/diff-summary.mjs",
    "node packages/cli/dist/index.js changes review --project . --summary"
  ]);
  assert.equal(spawnCalls.length, 0);
  assert.equal(commands.some(command => command.file === "node" && command.args[0] === "scripts/run-missions.mjs"), false);
  await assert.rejects(() => readFile(path.join(result.runDir, "selected-missions.json"), "utf8"), /ENOENT/);
  await assert.rejects(() => readFile(path.join(result.runDir, "mission-plan.stdout.txt"), "utf8"), /ENOENT/);
  await assert.rejects(() => readFile(path.join(result.runDir, "coherence-prompt.md"), "utf8"), /ENOENT/);
});

test("external mission dry run discovers provided folder without assessment prompt", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "package.json", "{}\n");
  await writeFileAt(root, "external-missions/mission-one.md", validMissionMarkdown());

  const stdout = captureStream();
  const result = await runCli([
    "--dry-run",
    "--allow-dirty",
    "--skip-codex-assessment",
    "--missions",
    "external-missions"
  ], {
    cwd: root,
    stdout,
    stderr: captureStream(),
    command: fakeCommand()
  });

  assert.equal(relativePath(root, result.missionsDir), "external-missions");
  assert.equal(result.strategySource, "external");
  assert.match(stdout.text, /Codex assessment skipped/);
  assert.match(stdout.text, /External mission folder: external-missions/);
  await assert.rejects(
    () => readFile(path.join(result.runDir, "assessment-prompt.md"), "utf8"),
    /ENOENT/
  );
  const externalMissions = JSON.parse(await readFile(path.join(result.runDir, "external-missions.json"), "utf8"));
  assert.deepEqual(externalMissions.missionFiles, ["external-missions/mission-one.md"]);
});

test("external mission run skips assessment spawn and passes folder to mission runner", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "package.json", "{}\n");
  await writeFileAt(root, "external-missions/mission-one.md", validMissionMarkdown());

  const commands = [];
  const spawnCalls = [];
  const result = await runCli([
    "--allow-dirty",
    "--skip-codex-assessment",
    "--missions",
    "external-missions"
  ], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream(),
    command: fakeCommand(commands),
    spawnProcess: fakeCodexSpawn(spawnCalls)
  });

  assert.equal(result.strategySource, "external");
  assert.equal(spawnCalls.length, 1);
  assert.match(spawnCalls[0].prompt, /Coherence Review/);
  assert.doesNotMatch(spawnCalls[0].prompt, /Assessment and Mission Authoring/);

  const missionPlanCommand = commands.find(command =>
    command.file === "node" &&
    command.args[0] === "scripts/run-missions.mjs" &&
    command.args.includes("--plan")
  );
  assert.ok(missionPlanCommand);
  const planMissionsFlagIndex = missionPlanCommand.args.indexOf("--missions");
  assert.equal(missionPlanCommand.args[planMissionsFlagIndex + 1], "external-missions");

  const missionRunnerCommand = commands.find(command =>
    command.file === "node" &&
    command.args[0] === "scripts/run-missions.mjs" &&
    !command.args.includes("--plan")
  );
  assert.ok(missionRunnerCommand);
  const missionsFlagIndex = missionRunnerCommand.args.indexOf("--missions");
  assert.equal(missionRunnerCommand.args[missionsFlagIndex + 1], "external-missions");

  const runnerCommandArtifact = JSON.parse(
    await readFile(path.join(result.runDir, "mission-runner-command.json"), "utf8")
  );
  assert.equal(runnerCommandArtifact[runnerCommandArtifact.indexOf("--missions") + 1], "external-missions");
});

test("external coherence review writes evidence pack without Codex coherence spawn", async t => {
  const root = await tempWorkspace(t);
  await writeFileAt(root, "package.json", "{}\n");
  await writeFileAt(root, "external-missions/mission-one.md", validMissionMarkdown());

  const commands = [];
  const spawnCalls = [];
  const stdout = captureStream();
  const result = await runCli([
    "--allow-dirty",
    "--skip-codex-assessment",
    "--missions",
    "external-missions",
    "--external-coherence-review"
  ], {
    cwd: root,
    now: fixedDate,
    stdout,
    stderr: captureStream(),
    command: fakeCommand(commands),
    spawnProcess: fakeCodexSpawn(spawnCalls)
  });

  assert.equal(result.coherenceReviewStatus, "pending-external-review");
  assert.equal(spawnCalls.length, 0);
  assert.match(stdout.text, /External coherence review pending/);

  const prompt = await readFile(path.join(result.runDir, "coherence-prompt.md"), "utf8");
  assert.match(prompt, /Coherence Review/);
  assert.match(prompt, /Strategy source: Externally-authored mission folder/);

  const inputs = JSON.parse(await readFile(path.join(result.runDir, "coherence-inputs.json"), "utf8"));
  assert.equal(inputs.status, "pending-external-review");
  assert.equal(inputs.missionsDir, "external-missions");
  assert.deepEqual(inputs.selectedMissionIds, ["mission-one"]);
  assert.ok(inputs.postRunContext);

  await assert.rejects(() => readFile(path.join(result.runDir, "coherence-codex.jsonl"), "utf8"), /ENOENT/);
  await assert.rejects(() => readFile(path.join(result.runDir, "coherence-assessment.md"), "utf8"), /ENOENT/);

  const runReports = await readdir(path.join(root, ".abstraction-tree/runs"));
  assert.equal(runReports.length, 1);
  const report = await readFile(path.join(root, ".abstraction-tree/runs", runReports[0]), "utf8");
  assert.match(report, /Coherence review: pending external ChatGPT\/human review/);
  assert.match(report, /external-coherence-review-pending/);

  assert.equal(commands.some(command => command.file === "node" && command.args[0] === "scripts/run-missions.mjs"), true);
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

async function writeJsonAt(root, relativePath, value) {
  return writeFileAt(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeBaseAssessmentMemory(root) {
  await writeJsonAt(root, "package.json", {
    name: "fixture",
    version: "0.0.0"
  });
  await writeJsonAt(root, ".abstraction-tree/config.json", {
    version: "0.1.0",
    projectName: "fixture",
    sourceRoot: ".",
    treeBuilder: "deterministic",
    installMode: "core"
  });
  await writeJsonAt(root, ".abstraction-tree/tree.json", [
    {
      id: "project.intent",
      title: "Fixture",
      summary: "Top-level fixture project."
    },
    {
      id: "module.scripts",
      title: "Scripts",
      summary: "Automation scripts."
    }
  ]);
  await writeJsonAt(root, ".abstraction-tree/files.json", [
    {
      path: "scripts/example.mjs",
      language: "JavaScript",
      ownedByNodeIds: ["module.scripts"]
    }
  ]);
  await writeJsonAt(root, ".abstraction-tree/concepts.json", [
    {
      id: "mission",
      title: "Mission",
      summary: "Mission workflow.",
      relatedFiles: ["scripts/example.mjs"],
      relatedNodeIds: ["module.scripts"]
    }
  ]);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function fakeCommand(commands = []) {
  return async (file, args) => {
    commands.push({ file, args });
    return {
      exitCode: 0,
      stdout: "",
      stderr: ""
    };
  };
}

function fakeCodexSpawn(calls = []) {
  return (file, args, options) => {
    const child = new EventEmitter();
    const call = { file, args, options, prompt: "" };
    calls.push(call);
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        call.prompt += chunk.toString();
        callback();
      },
      final(callback) {
        queueMicrotask(() => {
          child.stdout.write(`${JSON.stringify({ role: "assistant", content: "Coherence ok." })}\n`);
          child.stdout.end();
          child.stderr.end();
          child.emit("close", 0);
        });
        callback();
      }
    });
    return child;
  };
}

function captureStream() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    }
  };
}
