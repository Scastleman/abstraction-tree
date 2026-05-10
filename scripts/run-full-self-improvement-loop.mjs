#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createAssessmentPack } from "./create-assessment-pack.mjs";

const execFileAsync = promisify(execFile);

const fullLoopRoot = ".abstraction-tree/automation/full-loop-runs";
const durableRunRoot = ".abstraction-tree/runs";
const defaultCodexBin = process.platform === "win32" ? "codex.cmd" : "codex";

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function runCli(argv = [], io = {}) {
  const cwd = path.resolve(io.cwd ?? process.cwd());
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const options = parseArgs(argv);
  const runCommand = io.command ?? command;
  const createdAt = io.now ?? new Date();
  const timestamp = timestampForPath(createdAt);
  const runDir = path.join(cwd, fullLoopRoot, timestamp);
  const generatedMissionsDir = path.join(runDir, "missions");
  const missionsDir = options.skipCodexAssessment
    ? path.resolve(cwd, options.missions)
    : generatedMissionsDir;

  if (options.assessmentPackOnly) {
    await mkdir(runDir, { recursive: true });
    const pack = await createAssessmentPack({
      cwd,
      outputRoot: relative(cwd, path.join(runDir, "assessment-pack")),
      createdAt,
      runCommand
    });
    await writeJson(path.join(runDir, "assessment-pack.json"), {
      packDir: relative(cwd, pack.packDir),
      files: pack.files.map(filePath => relative(cwd, filePath))
    });
    stdout.write(`Assessment pack created: ${relative(cwd, pack.packDir)}\n`);
    stdout.write(`Assessment prompt: ${relative(cwd, path.join(pack.packDir, "assessment-prompt.md"))}\n`);
    return {
      runDir,
      assessmentPackDir: pack.packDir,
      assessmentPackOnly: true,
      dryRun: false,
      strategySource: "assessment-pack-only"
    };
  }

  await mkdir(options.skipCodexAssessment ? runDir : missionsDir, { recursive: true });

  const status = await runCommand("git", ["status", "--short"], { cwd });
  if (status.stdout.trim() && !options.allowDirty) {
    throw new Error("Working tree is dirty. Commit/stash first or pass --allow-dirty for an attended run.");
  }

  const context = await collectAssessmentContext(cwd, runCommand);
  await writeJson(path.join(runDir, "assessment-inputs.json"), context);

  const strategySource = options.skipCodexAssessment ? "external" : "codex-assessment";
  await writeJson(path.join(runDir, "strategy-source.json"), {
    strategySource,
    codexAssessmentSkipped: options.skipCodexAssessment,
    missionsDir: relative(cwd, missionsDir)
  });

  let selectedMissions;
  if (options.skipCodexAssessment) {
    selectedMissions = await discoverExternalMissions({
      cwd,
      missionsDir,
      maxMissions: options.maxMissions
    });
    await writeJson(path.join(runDir, "external-missions.json"), {
      sourceDir: relative(cwd, missionsDir),
      missionFiles: selectedMissions.map(filePath => relative(cwd, filePath))
    });
    stdout.write(`Using externally-authored missions from ${relative(cwd, missionsDir)}; Codex assessment skipped.\n`);
    if (options.dryRun) {
      stdout.write(`Full self-improvement loop dry run created ${relative(cwd, runDir)}\n`);
      stdout.write(`External mission folder: ${relative(cwd, missionsDir)}\n`);
      return { runDir, missionsDir, dryRun: true, strategySource };
    }
  } else {
    const assessmentPrompt = buildAssessmentPrompt({
      repoRoot: cwd,
      runDir,
      missionsDir,
      maxMissions: options.maxMissions,
      allowMultipleAutomationMaintenance: options.allowMultipleAutomationMaintenance,
      context
    });
    await writeFile(path.join(runDir, "assessment-prompt.md"), assessmentPrompt, "utf8");

    if (options.dryRun) {
      stdout.write(`Full self-improvement loop dry run created ${relative(cwd, runDir)}\n`);
      stdout.write(`Assessment prompt: ${relative(cwd, path.join(runDir, "assessment-prompt.md"))}\n`);
      return { runDir, missionsDir, dryRun: true, strategySource };
    }

    stdout.write(`Writing assessment and mission folder in ${relative(cwd, runDir)}\n`);
    await runCodexPrompt({
      cwd,
      codexBin: options.codexBin,
      sandbox: "workspace-write",
      reasoningEffort: options.reasoningEffort,
      prompt: assessmentPrompt,
      stdoutPath: path.join(runDir, "assessment-codex.jsonl"),
      stderrPath: path.join(runDir, "assessment-codex.stderr.log"),
      spawnProcess: io.spawnProcess ?? spawn
    });

    selectedMissions = await validateAssessmentOutput({
      cwd,
      runDir,
      missionsDir,
      maxMissions: options.maxMissions,
      allowMultipleAutomationMaintenance: options.allowMultipleAutomationMaintenance
    });
  }
  const selectedIds = selectedMissions.map(filePath => path.basename(filePath, ".md"));
  await writeJson(path.join(runDir, "selected-missions.json"), selectedIds);

  stdout.write(`Planning ${selectedMissions.length} mission(s).\n`);
  const missionPlanArgs = [
    "scripts/run-missions.mjs",
    "--plan",
    "--missions",
    relative(cwd, missionsDir),
    "--ignore-runtime",
    "--only",
    selectedIds.join(","),
    "--sandbox",
    options.sandbox
  ];
  if (options.allowDangerFullAccess) missionPlanArgs.push("--allow-danger-full-access");
  const plan = await runCommand("node", missionPlanArgs, { cwd, allowFailure: true });
  await writeFile(path.join(runDir, "mission-plan.stdout.txt"), plan.stdout, "utf8");
  await writeFile(path.join(runDir, "mission-plan.stderr.txt"), plan.stderr, "utf8");
  if (plan.exitCode !== 0) {
    throw new Error(`Mission planning failed. See ${relative(cwd, path.join(runDir, "mission-plan.stderr.txt"))}.`);
  }

  if (!options.skipMissions) {
    const runnerArgs = missionRunnerArgs({
      missionsDir: relative(cwd, missionsDir),
      selectedIds,
      concurrency: options.concurrency,
      sandbox: options.sandbox,
      codexBin: options.codexBin,
      worktrees: options.worktrees || (options.concurrency > 1 && options.sandbox === "workspace-write"),
      allowDangerFullAccess: options.allowDangerFullAccess
    });
    await writeJson(path.join(runDir, "mission-runner-command.json"), runnerArgs);
    stdout.write(`Running mission runner with concurrency ${options.concurrency}.\n`);
    const run = await runCommand("node", runnerArgs, { cwd, allowFailure: true, timeoutMs: options.missionTimeoutMs });
    await writeFile(path.join(runDir, "mission-runner.stdout.txt"), run.stdout, "utf8");
    await writeFile(path.join(runDir, "mission-runner.stderr.txt"), run.stderr, "utf8");
    await writeJson(path.join(runDir, "mission-runner-result.json"), {
      exitCode: run.exitCode
    });
    if (run.exitCode !== 0) {
      stderr.write(`Mission runner failed; continuing to coherence review for diagnosis.\n`);
    }
  }

  const afterContext = await collectPostRunContext(cwd, runCommand);
  await writeJson(path.join(runDir, "post-run-inputs.json"), afterContext);

  const coherencePrompt = buildCoherencePrompt({
    repoRoot: cwd,
    runDir,
    missionsDir,
    strategySource,
    context: afterContext
  });
  await writeFile(path.join(runDir, "coherence-prompt.md"), coherencePrompt, "utf8");
  const coherenceReviewStatus = options.externalCoherenceReview
    ? "pending-external-review"
    : "codex-review-written";
  if (options.externalCoherenceReview) {
    await writeJson(path.join(runDir, "coherence-inputs.json"), {
      status: coherenceReviewStatus,
      runDir: relative(cwd, runDir),
      missionsDir: relative(cwd, missionsDir),
      strategySource,
      selectedMissionIds: selectedIds,
      postRunContext: afterContext
    });
    stdout.write(`External coherence review pending. Prompt: ${relative(cwd, path.join(runDir, "coherence-prompt.md"))}\n`);
  } else {
    const coherence = await runCodexPrompt({
      cwd,
      codexBin: options.codexBin,
      sandbox: "read-only",
      reasoningEffort: options.reasoningEffort,
      prompt: coherencePrompt,
      stdoutPath: path.join(runDir, "coherence-codex.jsonl"),
      stderrPath: path.join(runDir, "coherence-codex.stderr.log"),
      spawnProcess: io.spawnProcess ?? spawn
    });
    await writeFile(path.join(runDir, "coherence-assessment.md"), coherence.finalText, "utf8");
  }

  const changeReview = await runCommand("node", [
    "packages/cli/dist/index.js",
    "changes",
    "review",
    "--project",
    ".",
    "--summary"
  ], { cwd, allowFailure: true });
  await writeFile(path.join(runDir, "change-log-review.json"), changeReview.stdout || changeReview.stderr, "utf8");

  const didMissionRunnerFail = await missionRunnerFailed(runDir);
  const decision = buildDecision({
    options,
    selectedIds,
    missionRunnerFailed: didMissionRunnerFail,
    changeReviewExitCode: changeReview.exitCode
  });
  await writeFile(path.join(runDir, "decision.md"), decision, "utf8");

  const durableReportPath = path.join(cwd, durableRunRoot, `${timestampForReport(createdAt)}-full-loop-run.md`);
  await writeTextFile(
    durableReportPath,
    buildDurableRunReport({
      runDir: relative(cwd, runDir),
      missionsDir: relative(cwd, missionsDir),
      strategySource,
      selectedIds,
      missionRunnerFailed: didMissionRunnerFail,
      changeReviewExitCode: changeReview.exitCode,
      coherenceReviewStatus,
      decision
    })
  );

  stdout.write(`Full self-improvement loop finished. Artifacts: ${relative(cwd, runDir)}\n`);
  stdout.write(`Durable run report: ${relative(cwd, durableReportPath)}\n`);
  return { runDir, missionsDir, dryRun: false, strategySource, coherenceReviewStatus };
}

export function parseArgs(argv) {
  const options = {
    maxMissions: 4,
    concurrency: 1,
    sandbox: "workspace-write",
    codexBin: defaultCodexBin,
    reasoningEffort: "xhigh",
    allowDirty: false,
    allowDangerFullAccess: false,
    allowMultipleAutomationMaintenance: false,
    assessmentPackOnly: false,
    externalCoherenceReview: false,
    skipCodexAssessment: false,
    missions: "",
    dryRun: false,
    skipMissions: false,
    worktrees: false,
    missionTimeoutMs: 60 * 60 * 1000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--max-missions":
        options.maxMissions = positiveInteger(valueAt(argv, ++index, arg), arg);
        break;
      case "--concurrency":
        options.concurrency = positiveInteger(valueAt(argv, ++index, arg), arg);
        break;
      case "--sandbox":
        options.sandbox = valueAt(argv, ++index, arg);
        break;
      case "--codex-bin":
        options.codexBin = valueAt(argv, ++index, arg);
        break;
      case "--reasoning-effort":
        options.reasoningEffort = valueAt(argv, ++index, arg);
        break;
      case "--mission-timeout-ms":
        options.missionTimeoutMs = positiveInteger(valueAt(argv, ++index, arg), arg);
        break;
      case "--allow-dirty":
        options.allowDirty = true;
        break;
      case "--allow-danger-full-access":
        options.allowDangerFullAccess = true;
        break;
      case "--allow-multiple-automation-maintenance":
        options.allowMultipleAutomationMaintenance = true;
        break;
      case "--assessment-pack-only":
        options.assessmentPackOnly = true;
        break;
      case "--external-coherence-review":
        options.externalCoherenceReview = true;
        break;
      case "--skip-codex-assessment":
        options.skipCodexAssessment = true;
        break;
      case "--missions":
        options.missions = valueAt(argv, ++index, arg);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--skip-missions":
        options.skipMissions = true;
        break;
      case "--worktrees":
        options.worktrees = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.sandbox === "danger-full-access" && !options.allowDangerFullAccess) {
    throw new Error("--sandbox danger-full-access requires --allow-danger-full-access.");
  }
  if (options.assessmentPackOnly && options.skipCodexAssessment) {
    throw new Error("--assessment-pack-only cannot be combined with --skip-codex-assessment.");
  }
  if (options.assessmentPackOnly && options.missions) {
    throw new Error("--missions is not supported with --assessment-pack-only.");
  }
  if (options.assessmentPackOnly && options.externalCoherenceReview) {
    throw new Error("--external-coherence-review cannot be combined with --assessment-pack-only.");
  }
  if (options.dryRun && options.externalCoherenceReview) {
    throw new Error("--external-coherence-review cannot be combined with --dry-run.");
  }
  if (options.skipCodexAssessment && !options.missions) {
    throw new Error("--skip-codex-assessment requires --missions <folder>.");
  }
  if (options.missions && !options.skipCodexAssessment) {
    throw new Error("--missions is only supported with --skip-codex-assessment.");
  }

  return options;
}

export function buildAssessmentPrompt(input) {
  return `# Full Abstraction Tree Self-Improvement Loop: Assessment and Mission Authoring

You are preparing a fresh mission folder for this repository.

Top project goal:

Integrate an abstraction tree into any project so developers understand the scope of their prompts, agents avoid overreaching changes when unnecessary, and the project introduces a full self-improvement system.

## Required Output Files

Write these files and only these files:

- ${relative(input.repoRoot, path.join(input.runDir, "assessment.md"))}
- ${relative(input.repoRoot, path.join(input.missionsDir, "README.md"))}
- up to ${input.maxMissions} mission Markdown files in ${relative(input.repoRoot, input.missionsDir)}

Do not edit source files, package files, docs outside the required output paths, git state, or existing mission/runtime files.

## Assessment Requirements

In assessment.md:

1. Assess the current project against the top project goal.
2. Identify what could be improved.
3. Identify what could be optimized.
4. Identify what is unnecessary, redundant, or overbuilt.
5. Create concrete points of change.
6. Rank each point by its position in the abstraction tree:
   - project
   - architecture
   - module
   - file
   - function
   - schema
   - cli
   - docs
   - tests
7. Pick a small mission set that future Codex runs can execute safely.

## Mission File Requirements

Each mission file must be a standalone Codex prompt and must include frontmatter:

---
id: mission-slug
title: Human title
priority: P0/P1/P2/P3
risk: low/medium/high
category: product-value | safety | quality | developer-experience | automation-maintenance
affectedFiles:
  - path/from/repo/root
affectedNodes:
  - abstraction.node.id
dependsOn: []
parallelGroup: short-group-name
parallelGroupSafe: true/false
---

The category must identify the mission's primary value:

- product-value: improves capabilities or outcomes for project users/adopters.
- safety: reduces overreach, security, sandbox, data-loss, or operational risk.
- quality: improves correctness, validation, test coverage, drift detection, or reliability.
- developer-experience: improves docs, diagnostics, ergonomics, or maintainer workflow.
- automation-maintenance: maintains loop, runner, prompt, runtime, or process automation machinery without a clearer product, safety, quality, or developer-experience outcome.

Prefer product-value, safety, quality, and developer-experience missions. Use automation-maintenance only when it is the best fit for the primary value of the work. ${input.allowMultipleAutomationMaintenance ? "This run explicitly allows multiple automation-maintenance missions, but they should still be justified by concrete repository value." : "Create at most one automation-maintenance mission in this full loop."}

Then include:

# Mission

## Goal

## Abstraction Tree Position

## Why This Matters

## Scope

## Out of Scope

## Required Checks

## Success Criteria

Make missions small, testable, and independently useful. Prefer missions that directly improve product value, safety, quality, or developer experience. Mission quality, assessment quality, context-pack quality, validation, drift detection, and anti-overreach behavior are useful when framed through those value categories; do not let process-only automation maintenance dominate the mission set.

## Current Repository Context

\`\`\`json
${JSON.stringify(input.context, null, 2)}
\`\`\`
`;
}

export function buildCoherencePrompt(input) {
  const strategyLabel = input.strategySource === "external"
    ? "Externally-authored mission folder; Codex assessment was skipped."
    : "Codex-generated assessment and mission folder.";
  return `# Full Abstraction Tree Self-Improvement Loop: Coherence Review

Review the just-completed full-loop work for coherence.

Return Markdown only. Do not edit files.

Assess:

1. Whether the generated assessment, mission folder, mission execution results, and working-tree changes point in the same direction.
2. Whether any mission overreached its stated abstraction tree position.
3. Whether the changes still serve the top project goal:
   - developers understand prompt scope
   - agents avoid unnecessary overreach
   - the project supports a full self-improvement system
4. What is redundant, unnecessary, or risky.
5. Whether to stop or repeat, and exactly one recommended next loop.

Run directory: ${relative(input.repoRoot, input.runDir)}
Mission directory: ${relative(input.repoRoot, input.missionsDir)}
Strategy source: ${strategyLabel}

## Post-Run Context

\`\`\`json
${JSON.stringify(input.context, null, 2)}
\`\`\`
`;
}

export function buildDurableRunReport(input) {
  const result = input.coherenceReviewStatus === "pending-external-review"
    ? input.missionRunnerFailed
      ? "partial; external-coherence-review-pending"
      : "external-coherence-review-pending"
    : input.missionRunnerFailed
      ? "partial"
      : "success";
  const selected = input.selectedIds.length ? input.selectedIds.map(id => `- ${id}`).join("\n") : "- none";
  const changeReview = input.changeReviewExitCode === 0 ? "passed" : `exited ${input.changeReviewExitCode}`;
  const coherenceReview = input.coherenceReviewStatus === "pending-external-review"
    ? "pending external ChatGPT/human review"
    : "written to the local run artifact folder";
  const strategySource = input.strategySource === "external"
    ? "external ChatGPT/human-authored mission folder; Codex assessment skipped"
    : "Codex-generated assessment and mission folder";
  const missionsDir = input.missionsDir ?? `${input.runDir}/missions`;
  const taskChosen = input.strategySource === "external"
    ? "Run one bounded full self-improvement loop using an externally-authored mission folder: plan and execute selected missions, review coherence, review change records, then stop for human review."
    : "Run one bounded full self-improvement loop: assess the project, write a mission folder, execute selected missions, review coherence, review change records, then stop for human review.";
  return `# Full Self-Improvement Loop Report

## Task Chosen

${taskChosen}

## Why This Task

The project goal is to integrate an abstraction tree into any project so developers understand prompt scope, agents avoid unnecessary overreach, and the repository can improve itself through bounded loops.

## Strategy Source

${strategySource}

Mission folder: \`${missionsDir}\`

## Missions Selected

${selected}

## Result

${result}

## Artifact Policy

Detailed per-run artifacts live at \`${input.runDir}\` as ignored local runtime state. This concise report in \`${durableRunRoot}/\` is the durable abstraction memory for the loop.

## Checks And Reviews

- Mission runner: ${input.missionRunnerFailed ? "needs review" : "completed without a runner failure"}
- Change-record review: ${changeReview}
- Coherence review: ${coherenceReview}

## Decision

${input.decision.trim()}

## Reusable Lesson

Keep generated prompts, Codex JSONL logs, stderr logs, mission workspaces, and full-loop run folders local. Commit concise run reports, semantic change records, lessons, and refreshed abstraction memory when the loop creates product-relevant changes.
`;
}

export async function validateAssessmentOutput(input) {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const runDir = path.resolve(input.runDir);
  const missionsDir = path.resolve(input.missionsDir);
  const assessmentPath = path.join(runDir, "assessment.md");
  const missionsReadmePath = path.join(missionsDir, "README.md");

  await assertFileExists(assessmentPath, `Assessment did not create ${relative(cwd, assessmentPath)}.`);
  await assertFileExists(missionsReadmePath, `Assessment did not create ${relative(cwd, missionsReadmePath)}.`);

  const missions = await missionFiles(missionsDir);
  if (!missions.length) {
    throw new Error(`Assessment did not create mission files in ${relative(cwd, missionsDir)}.`);
  }

  const outsideMissionsDir = missions.filter(filePath => !isInsideDirectory(missionsDir, filePath));
  if (outsideMissionsDir.length) {
    throw new Error(
      `Assessment mission files must stay under ${relative(cwd, missionsDir)}: ${outsideMissionsDir.map(filePath => relative(cwd, filePath)).join(", ")}.`
    );
  }

  const allowedMarkdownPaths = new Set([
    assessmentPath,
    path.join(runDir, "assessment-prompt.md"),
    missionsReadmePath
  ].map(pathKey));
  const misplacedMarkdown = (await markdownFiles(runDir))
    .filter(filePath => !allowedMarkdownPaths.has(pathKey(filePath)) && !isInsideDirectory(missionsDir, filePath));
  if (misplacedMarkdown.length) {
    throw new Error(
      `Assessment wrote Markdown mission output outside configured missions directory ${relative(cwd, missionsDir)}: ${misplacedMarkdown.map(filePath => relative(cwd, filePath)).join(", ")}.`
    );
  }

  if (missions.length > input.maxMissions) {
    throw new Error(
      `Assessment created ${missions.length} mission files, but the configured maximum is ${input.maxMissions}.`
    );
  }

  const validatedMissions = [];
  for (const missionPath of missions) {
    const markdown = await readFile(missionPath, "utf8");
    validatedMissions.push({
      path: missionPath,
      frontmatter: validateGeneratedMissionContract(markdown, relative(cwd, missionPath))
    });
  }

  const automationMaintenanceMissions = validatedMissions
    .filter(mission => mission.frontmatter.category === "automation-maintenance");
  if (automationMaintenanceMissions.length > 1 && !input.allowMultipleAutomationMaintenance) {
    throw new Error(
      `Assessment created ${automationMaintenanceMissions.length} automation-maintenance mission files, but at most one is allowed by default. Pass --allow-multiple-automation-maintenance to override: ${automationMaintenanceMissions.map(mission => relative(cwd, mission.path)).join(", ")}.`
    );
  }

  return missions;
}

async function discoverExternalMissions(input) {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const missionsDir = path.resolve(input.missionsDir);
  const missionsDirStat = await stat(missionsDir).catch(error => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (!missionsDirStat?.isDirectory()) {
    throw new Error(`--missions must point to an existing folder: ${relative(cwd, missionsDir)}.`);
  }

  const missions = await missionFiles(missionsDir);
  if (!missions.length) {
    throw new Error(`External mission folder has no mission Markdown files: ${relative(cwd, missionsDir)}.`);
  }
  if (missions.length > input.maxMissions) {
    throw new Error(
      `External mission folder contains ${missions.length} mission files, but the configured maximum is ${input.maxMissions}.`
    );
  }

  return missions;
}

const validMissionCategories = new Set([
  "product-value",
  "safety",
  "quality",
  "developer-experience",
  "automation-maintenance"
]);
const requiredMissionStringFields = ["id", "title", "priority", "risk", "category", "parallelGroup"];
const requiredMissionArrayFields = ["affectedFiles", "affectedNodes", "dependsOn"];
const requiredMissionBodyHeadings = [
  "# Mission",
  "## Goal",
  "## Abstraction Tree Position",
  "## Why This Matters",
  "## Scope",
  "## Out of Scope",
  "## Required Checks",
  "## Success Criteria"
];

function validateGeneratedMissionContract(markdown, missionLabel) {
  const parsed = parseGeneratedMissionMarkdown(markdown);
  if (!parsed.hasFrontmatter) {
    throw new Error(`${missionLabel} is missing frontmatter delimited by ---.`);
  }

  for (const field of requiredMissionStringFields) {
    if (!Object.hasOwn(parsed.frontmatter, field)) {
      throw new Error(`${missionLabel} is missing required frontmatter field ${field}.`);
    }
    if (typeof parsed.frontmatter[field] !== "string" || !parsed.frontmatter[field].trim()) {
      throw new Error(`${missionLabel} frontmatter field ${field} must be a non-empty string.`);
    }
  }

  for (const field of requiredMissionArrayFields) {
    if (!Object.hasOwn(parsed.frontmatter, field)) {
      throw new Error(`${missionLabel} is missing required frontmatter field ${field}.`);
    }
    if (!Array.isArray(parsed.frontmatter[field])) {
      throw new Error(`${missionLabel} frontmatter field ${field} must be an array.`);
    }
  }

  if (!Object.hasOwn(parsed.frontmatter, "parallelGroupSafe")) {
    throw new Error(`${missionLabel} is missing required frontmatter field parallelGroupSafe.`);
  }
  if (typeof parsed.frontmatter.parallelGroupSafe !== "boolean") {
    throw new Error(`${missionLabel} frontmatter field parallelGroupSafe must be boolean true or false.`);
  }

  if (!validMissionCategories.has(parsed.frontmatter.category)) {
    throw new Error(
      `${missionLabel} frontmatter field category must be one of: ${[...validMissionCategories].join(", ")}.`
    );
  }

  const headings = new Set(parsed.body.split(/\r?\n/u).map(line => line.trim()));
  for (const heading of requiredMissionBodyHeadings) {
    if (!headings.has(heading)) {
      throw new Error(`${missionLabel} is missing required body heading ${heading}.`);
    }
  }

  return parsed.frontmatter;
}

function parseGeneratedMissionMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") {
    return { hasFrontmatter: false, frontmatter: {}, body: markdown };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) {
    return { hasFrontmatter: false, frontmatter: {}, body: markdown };
  }

  return {
    hasFrontmatter: true,
    frontmatter: parseGeneratedMissionFrontmatter(lines.slice(1, endIndex).join("\n")),
    body: lines.slice(endIndex + 1).join("\n").replace(/^\s*\n/u, "")
  };
}

function parseGeneratedMissionFrontmatter(text) {
  const result = {};
  let currentArrayKey;

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+$/u, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const arrayItem = line.match(/^\s*-\s*(.*)$/u);
    if (arrayItem && currentArrayKey) {
      result[currentArrayKey].push(unquoteFrontmatterValue(arrayItem[1].trim()));
      continue;
    }

    currentArrayKey = undefined;
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!field) continue;

    const key = field[1];
    const value = field[2].trim();
    if (value === "[]") {
      result[key] = [];
      continue;
    }
    if (!value) {
      result[key] = [];
      currentArrayKey = key;
      continue;
    }
    if (value === "true") {
      result[key] = true;
      continue;
    }
    if (value === "false") {
      result[key] = false;
      continue;
    }
    result[key] = unquoteFrontmatterValue(value);
  }

  return result;
}

function unquoteFrontmatterValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function missionRunnerArgs(input) {
  const args = [
    "scripts/run-missions.mjs",
    "--missions",
    input.missionsDir,
    "--ignore-runtime",
    "--only",
    input.selectedIds.join(","),
    "--sandbox",
    input.sandbox,
    "--concurrency",
    String(input.concurrency),
    "--codex-bin",
    input.codexBin
  ];
  if (input.worktrees) args.push("--worktrees");
  if (input.allowDangerFullAccess) args.push("--allow-danger-full-access");
  return args;
}

async function collectAssessmentContext(cwd, runCommand = command) {
  const [
    status,
    diffSummary,
    latestEvaluation,
    changeReview,
    latestRuns,
    latestLessons,
    missionRuntime
  ] = await Promise.all([
    runCommand("git", ["status", "--short", "--branch"], { cwd, allowFailure: true }),
    diffSummaryCommand(cwd, runCommand),
    readLatestFile(cwd, ".abstraction-tree/evaluations", ".json"),
    runCommand("node", ["packages/cli/dist/index.js", "changes", "review", "--project", ".", "--summary"], { cwd, allowFailure: true }),
    readLatestFiles(cwd, ".abstraction-tree/runs", ".md", 3),
    readLatestFiles(cwd, ".abstraction-tree/lessons", ".md", 5),
    readText(path.join(cwd, ".abstraction-tree/automation/mission-runtime.json"))
  ]);

  return {
    gitStatus: status.stdout,
    diffSummary: diffSummary.stdout || diffSummary.stderr,
    latestEvaluation,
    changeReview: changeReview.stdout || changeReview.stderr,
    latestRuns,
    latestLessons,
    missionRuntime
  };
}

async function collectPostRunContext(cwd, runCommand = command) {
  const [
    status,
    diffSummary,
    latestEvaluation,
    latestMissionRuns
  ] = await Promise.all([
    runCommand("git", ["status", "--short", "--branch"], { cwd, allowFailure: true }),
    diffSummaryCommand(cwd, runCommand),
    readLatestFile(cwd, ".abstraction-tree/evaluations", ".json"),
    latestDirectories(cwd, ".abstraction-tree/mission-runs", 3)
  ]);

  return {
    gitStatus: status.stdout,
    diffSummary: diffSummary.stdout || diffSummary.stderr,
    latestEvaluation,
    latestMissionRuns
  };
}

async function diffSummaryCommand(cwd, runCommand = command) {
  const nodeResult = await runCommand("node", ["scripts/diff-summary.mjs"], { cwd, allowFailure: true });
  if (nodeResult.exitCode === 0) return nodeResult;
  if (process.platform !== "win32") return nodeResult;
  return runCommand("powershell", [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "scripts/summarize-diff.ps1"
  ], { cwd, allowFailure: true });
}

async function runCodexPrompt(input) {
  const args = ["exec", "--json", "--sandbox", input.sandbox];
  if (input.reasoningEffort) args.push("-c", `model_reasoning_effort=${input.reasoningEffort}`);
  args.push("-");
  const child = spawnCodexChild(input.spawnProcess, input.codexBin, args, {
    cwd: input.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  const stdoutFile = createWriteStream(input.stdoutPath);
  const stderrFile = createWriteStream(input.stderrPath);

  child.stdout.on("data", chunk => {
    stdoutChunks.push(chunk);
    stdoutFile.write(chunk);
  });
  child.stderr.on("data", chunk => {
    stderrChunks.push(chunk);
    stderrFile.write(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
    child.stdin.end(input.prompt);
  });

  await Promise.all([closeStream(stdoutFile), closeStream(stderrFile)]);
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  if (exitCode !== 0) {
    throw new Error(`Codex exited with ${exitCode}: ${stderr.trim().split(/\r?\n/).slice(-10).join("\n")}`);
  }
  return {
    stdout,
    stderr,
    finalText: finalAgentMessage(stdout) || stdout.trim()
  };
}

function spawnCodexChild(spawnProcess, codexBin, args, options) {
  if (process.platform === "win32" && /\.(cmd|bat)$/iu.test(codexBin)) {
    const commandLine = ["call", quoteCmd(codexBin), ...args.map(quoteCmd)].join(" ");
    return spawnProcess(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
      ...options,
      windowsVerbatimArguments: true
    });
  }
  return spawnProcess(codexBin, args, options);
}

function finalAgentMessage(stdout) {
  let last;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const text = extractAgentText(parsed);
      if (text) last = text;
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  return last;
}

function extractAgentText(value) {
  if (!value || typeof value !== "object") return undefined;
  if (value.role === "assistant" && typeof value.content === "string") return value.content;
  if (typeof value.type === "string" && value.type.includes("agent")) {
    for (const key of ["message", "text", "content", "delta"]) {
      if (typeof value[key] === "string" && value[key].trim()) return value[key];
    }
  }
  if (Array.isArray(value.content)) {
    const text = value.content.map(extractContentText).filter(Boolean).join("\n").trim();
    if (text) return text;
  }
  for (const key of ["item", "message", "response"]) {
    const nested = extractAgentText(value[key]);
    if (nested) return nested;
  }
  return undefined;
}

function extractContentText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  return value.text ?? value.content;
}

async function missionFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await missionFiles(absolutePath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md") && entry.name.toLowerCase() !== "readme.md") {
      files.push(absolutePath);
    }
  }
  return files.sort(comparePaths);
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(absolutePath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(absolutePath);
    }
  }
  return files.sort(comparePaths);
}

async function assertFileExists(filePath, errorMessage) {
  const fileStat = await stat(filePath).catch(error => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (!fileStat?.isFile()) throw new Error(errorMessage);
}

async function missionRunnerFailed(runDir) {
  try {
    const parsed = JSON.parse(await readFile(path.join(runDir, "mission-runner-result.json"), "utf8"));
    return parsed.exitCode !== 0;
  } catch {
    return false;
  }
}

function buildDecision(input) {
  const repeat = !input.missionRunnerFailed && input.changeReviewExitCode === 0 && input.options.maxMissions > input.selectedIds.length;
  return `# Full Loop Decision

## Result

${input.missionRunnerFailed ? "Stop: mission execution needs review." : "Stop: one attended full-loop cycle completed."}

## Missions Selected

${input.selectedIds.map(id => `- ${id}`).join("\n")}

## Repeat Recommendation

${repeat ? "A repeat is allowed by the configured mission budget, but this runner stops by default after one cycle." : "Do not auto-repeat from this invocation. Review the assessment, mission results, coherence review, and change-log review first."}
`;
}

async function command(file, args, options) {
  try {
    const result = await execFileAsync(file, args, {
      cwd: options.cwd,
      windowsHide: true,
      timeout: options.timeoutMs,
      maxBuffer: 50 * 1024 * 1024
    });
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const exitCode = typeof error.code === "number" ? error.code : 1;
    const result = {
      exitCode,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message
    };
    if (options.allowFailure) return result;
    throw new Error(`${file} ${args.join(" ")} failed: ${result.stderr}`);
  }
}

async function readLatestFile(cwd, relativeDirectory, extension) {
  const files = await latestFiles(cwd, relativeDirectory, extension, 1);
  if (!files.length) return "";
  return files[0].content;
}

async function readLatestFiles(cwd, relativeDirectory, extension, count) {
  return latestFiles(cwd, relativeDirectory, extension, count);
}

async function latestFiles(cwd, relativeDirectory, extension, count) {
  const directory = path.join(cwd, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
    const filePath = path.join(directory, entry.name);
    files.push({
      path: relative(cwd, filePath),
      content: await readText(filePath)
    });
  }
  return files.sort((left, right) => right.path.localeCompare(left.path)).slice(0, count);
}

async function latestDirectories(cwd, relativeDirectory, count) {
  const directory = path.join(cwd, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => relative(cwd, path.join(directory, entry.name)))
    .sort()
    .slice(-count)
    .reverse();
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

function closeStream(stream) {
  return new Promise(resolve => stream.end(resolve));
}

function timestampForPath(date) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function timestampForReport(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function positiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer.`);
  return parsed;
}

function valueAt(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function relative(cwd, filePath) {
  return path.relative(cwd, filePath).replaceAll(path.sep, "/");
}

function comparePaths(left, right) {
  return left.localeCompare(right);
}

function isInsideDirectory(directory, filePath) {
  const relativePath = path.relative(path.resolve(directory), path.resolve(filePath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function pathKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function quoteCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
