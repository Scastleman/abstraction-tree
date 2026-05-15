import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildGoalWorkspacePlan,
  buildScopeContract,
  ensureWorkspace,
  formatPromptRouteResult,
  formatScopeContractMarkdown,
  readChangeRecords,
  readConfig,
  readConcepts,
  readEvaluationReports,
  readFileSummaries,
  readInvariants,
  readTreeNodes,
  routePrompt,
  writeJson,
  type Concept,
  type FileSummary,
  type GoalChecksRecord,
  type GoalCompletionScore,
  type GoalMode,
  type GoalRouteRecord,
  type GoalStatus,
  type GoalWorkspacePlan,
  type PromptRouteResult,
  type ScopeContract,
  type TreeNode
} from "@abstraction-tree/core";
import { readPromptRouteMemory } from "./routeCommand.js";

export interface GoalCommandOptions {
  projectRoot: string;
  file?: string;
  planOnly?: boolean;
  reviewRequired?: boolean;
  fullAuto?: boolean;
  run?: boolean;
  createPr?: boolean;
  autoRoute?: boolean;
  forceGoal?: boolean;
  createdAt?: Date;
}

export interface GoalCommandIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export interface GoalCommandResult {
  mode: GoalMode;
  plan: GoalWorkspacePlan;
}

interface AtreeCommandRecommendations {
  evaluate: string;
  scopeCheck: (scopePath: string) => string;
}

export async function runGoalCommand(
  options: GoalCommandOptions,
  io: GoalCommandIo = defaultIo
): Promise<number> {
  const mode = resolveGoalMode(options);
  if (!mode) {
    io.stderr("Choose only one goal execution mode: --plan-only, --review-required, --full-auto, or --run. --create-pr can be combined with one execution mode.");
    return 1;
  }

  if (!options.file) {
    io.stderr("Missing goal file. Use `atree goal --file goal.md --review-required`.");
    return 1;
  }

  const projectRoot = path.resolve(options.projectRoot);
  const goalFilePath = path.resolve(projectRoot, options.file);
  if (!existsSync(goalFilePath)) {
    io.stderr(`Goal file not found: ${normalizePath(path.relative(projectRoot, goalFilePath))}`);
    return 1;
  }

  const goalText = await readFile(goalFilePath, "utf8");
  if (!goalText.trim()) {
    io.stderr("Goal file is empty. Add the user goal before planning missions.");
    return 1;
  }
  const goalFile = relativeOrAbsolute(projectRoot, goalFilePath);

  let route: PromptRouteResult | undefined;
  let routeOverridden = false;
  if (options.autoRoute) {
    const memory = await readPromptRouteMemory(projectRoot);
    route = routePrompt({
      prompt: goalText,
      promptFile: goalFile,
      ...memory
    });
    routeOverridden = Boolean(options.forceGoal && route.decision !== "goal-driven");
    if (route.decision !== "goal-driven" && !options.forceGoal) {
      io.stdout(formatPromptRouteResult(route, { explain: true }));
      io.stdout("Goal planning stopped. Pass --force-goal to create a goal workspace anyway.\n");
      return route.decision === "manual-review" ? 2 : 0;
    }
    io.stdout(routeOverridden
      ? `Prompt router decision: ${route.decision} (${route.confidence.toFixed(2)}). --force-goal override recorded; continuing with goal planning.\n\n`
      : `Prompt router decision: goal-driven (${route.confidence.toFixed(2)}). Continuing with goal planning.\n\n`);
  }

  await ensureWorkspace(projectRoot);
  const [config, nodes, files, concepts, invariants, changes, evaluations] = await Promise.all([
    readConfig(projectRoot),
    readTreeNodes(projectRoot),
    readFileSummaries(projectRoot),
    readConcepts(projectRoot),
    readInvariants(projectRoot),
    readChangeRecords(projectRoot),
    readEvaluationReports(projectRoot)
  ]);
  const plan = buildGoalWorkspacePlan({
    goalText,
    goalFile,
    mode,
    nodes,
    files,
    concepts,
    invariants,
    changes,
    evaluations,
    createdAt: options.createdAt,
    projectRoot,
    missionPlanning: config.missionPlanning
  });
  plan.metadata.project_root = ".";
  const atreeCommands = buildAtreeCommandRecommendations(projectRoot);
  const scopeContract = buildGoalScopeContract({
    plan,
    goalText,
    nodes,
    files,
    concepts,
    createdAt: options.createdAt,
    atreeCommands
  });
  const createPr = Boolean(options.createPr || mode === "create-pr");
  const executionRefused = mode === "full-auto" || mode === "run";
  const routeRecord = route ? buildGoalRouteRecord(plan, route, routeOverridden) : undefined;
  const checks = executionRefused ? buildExecutionRefusalChecks(plan, mode, plannedCheckCommands(plan), atreeCommands) : undefined;
  const status: GoalStatus = executionRefused ? "execution-refused" : "planned";

  plan.metadata.status = status;
  plan.scopeContract = scopeContract;
  plan.scopeContractMarkdown = formatScopeContractMarkdown(scopeContract);
  plan.reviewCommands = reviewCommandsFor(plan, scopeContract, atreeCommands);
  plan.coherenceReviewMarkdown = formatGoalCoherenceReview({
    goalText,
    plan,
    routeRecord,
    scopeContract,
    checks,
    status,
    executionRefused
  });
  plan.finalReportMarkdown = formatGoalFinalReport({
    plan,
    mode,
    routeRecord,
    scopeContract,
    checks,
    status,
    createPr,
    executionRefused
  });
  plan.goalScore = buildGoalScore({
    goalId: plan.id,
    status,
    scopeContract,
    checks,
    coherenceReviewWritten: true,
    createPr
  });
  if (routeRecord) {
    plan.routeJson = routeRecord;
    plan.routeMarkdown = formatGoalRouteMarkdown(routeRecord);
  }
  if (checks) {
    plan.checksJson = checks;
    plan.checksMarkdown = formatGoalChecksMarkdown(checks);
  }
  if (createPr) {
    plan.prBodyMarkdown = formatGoalPrBody({
      goalText,
      plan,
      routeRecord,
      scopeContract,
      checks,
      score: plan.goalScore,
      executionRefused
    });
  }

  await writeGoalWorkspace(projectRoot, plan, goalText);
  io.stdout(formatGoalCommandResult(plan, mode, createPr));

  if (executionRefused) {
    io.stderr(`${mode === "run" ? "Run" : "Full-auto"} goal execution is intentionally disabled in this safe first implementation. Review the generated missions, then run the printed mission runner commands.`);
    return 2;
  }

  return 0;
}

export async function writeGoalWorkspace(projectRoot: string, plan: GoalWorkspacePlan, originalGoalText: string): Promise<void> {
  const workspacePath = path.join(projectRoot, plan.workspaceRelativePath);
  const missionDirPath = path.join(projectRoot, plan.missionDirRelativePath);
  await mkdir(missionDirPath, { recursive: true });
  await writeFile(path.join(projectRoot, plan.goalRelativePath), originalGoalText, "utf8");
  await writeJson(path.join(projectRoot, plan.goalJsonRelativePath), plan.metadata);
  if (plan.routeJson) {
    await writeJson(path.join(workspacePath, "route.json"), plan.routeJson);
  }
  if (plan.routeMarkdown) {
    await writeFile(path.join(workspacePath, "route.md"), plan.routeMarkdown, "utf8");
  }
  await writeFile(path.join(workspacePath, "goal-assessment.md"), plan.assessmentMarkdown, "utf8");
  await writeJson(path.join(workspacePath, "affected-tree.json"), plan.affectedTree);
  await writeJson(path.join(workspacePath, "mission-plan.json"), plan.missionPlan);
  if (plan.scopeContract) {
    await writeJson(path.join(workspacePath, "scope-contract.json"), plan.scopeContract);
  }
  if (plan.scopeContractMarkdown) {
    await writeFile(path.join(workspacePath, "scope-contract.md"), plan.scopeContractMarkdown, "utf8");
  }
  if (plan.checksJson) {
    await writeJson(path.join(workspacePath, "checks.json"), plan.checksJson);
  }
  if (plan.checksMarkdown) {
    await writeFile(path.join(workspacePath, "checks.md"), plan.checksMarkdown, "utf8");
  }
  if (plan.goalScore) {
    await writeJson(path.join(workspacePath, "goal-score.json"), plan.goalScore);
  }
  for (const mission of plan.missions) {
    await writeFile(path.join(projectRoot, mission.relativePath), mission.content, "utf8");
  }
  await writeFile(path.join(workspacePath, "coherence-review.md"), plan.coherenceReviewMarkdown, "utf8");
  await writeFile(path.join(workspacePath, "final-report.md"), plan.finalReportMarkdown, "utf8");
  if (plan.prBodyMarkdown) {
    await writeFile(path.join(workspacePath, "pr-body.md"), plan.prBodyMarkdown, "utf8");
  }
}

function resolveGoalMode(options: GoalCommandOptions): GoalMode | undefined {
  const selected: GoalMode[] = [];
  if (options.planOnly) selected.push("plan-only");
  if (options.reviewRequired) selected.push("review-required");
  if (options.fullAuto) selected.push("full-auto");
  if (options.run) selected.push("run");
  if (selected.length > 1) return undefined;
  if (!selected.length && options.createPr) return "create-pr";
  return selected[0] ?? "review-required";
}

function formatGoalCommandResult(plan: GoalWorkspacePlan, mode: GoalMode, createPr: boolean): string {
  const lines = [
    `Wrote goal workspace: ${plan.workspaceRelativePath}`,
    `Wrote mission folder: ${plan.missionDirRelativePath}`,
    `Wrote scope contract: ${plan.workspaceRelativePath}/scope-contract.json`,
    `Mode: ${mode}`,
    ""
  ];
  if (plan.routeJson) {
    lines.push(`Routing decision: ${plan.routeJson.route.decision}${plan.routeJson.overridden ? " (overridden)" : ""}`);
    lines.push("");
  }
  if (mode === "plan-only") {
    lines.push("Plan-only mode did not run Codex.");
  } else if (mode === "review-required") {
    lines.push("Review the generated missions, then run:");
    lines.push(...plan.reviewCommands.map(command => `  ${command}`));
  } else if (mode === "full-auto" || mode === "run") {
    lines.push(`${mode === "run" ? "Run" : "Full-auto"} mode planned the goal but did not execute missions.`);
    lines.push("Run manually after review:");
    lines.push(...plan.reviewCommands.map(command => `  ${command}`));
  } else if (mode === "create-pr") {
    lines.push("Create-pr mode prepared planning artifacts without mission execution.");
    lines.push("Review the generated missions, then run:");
    lines.push(...plan.reviewCommands.map(command => `  ${command}`));
  }
  if (createPr) lines.push(`Wrote draft PR body: ${plan.workspaceRelativePath}/pr-body.md`);
  if (plan.goalScore) lines.push(`Wrote goal score: ${plan.workspaceRelativePath}/goal-score.json`);
  lines.push("No push, PR creation, or merge was performed.");
  lines.push("");
  return lines.join("\n");
}

function buildGoalRouteRecord(plan: GoalWorkspacePlan, route: PromptRouteResult, overridden: boolean): GoalRouteRecord {
  return {
    goal_id: plan.id,
    created_at: plan.createdAt,
    route,
    overridden,
    override_reason: overridden ? "--force-goal was passed, so goal planning continued despite the router recommendation." : undefined
  };
}

function buildGoalScopeContract(input: {
  plan: GoalWorkspacePlan;
  goalText: string;
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  createdAt?: Date;
  atreeCommands: AtreeCommandRecommendations;
}): ScopeContract {
  const base = buildScopeContract({
    prompt: input.goalText,
    nodes: input.nodes,
    files: input.files,
    concepts: input.concepts,
    createdAt: input.createdAt
  });
  const affectedFiles = input.plan.affectedTree.affected_files.map(file => file.path);
  const missionFiles = input.plan.missions.flatMap(mission => mission.mission.affectedFiles);
  const affectedNodeIds = input.plan.affectedTree.affected_nodes.map(node => node.node_id);
  const allowedFiles = sortedUnique([
    ...base.allowedFiles,
    ...affectedFiles,
    ...missionFiles
  ].map(normalizeGoalPath));
  const requiredChecks = sortedUnique([
    ...base.requiredChecks,
    ...plannedCheckCommands(input.plan),
    input.atreeCommands.scopeCheck(`${input.plan.workspaceRelativePath}/scope-contract.json`),
    input.atreeCommands.evaluate,
    "git diff --check"
  ]);
  return {
    ...base,
    id: `${input.plan.id}-scope`,
    affectedNodeIds: sortedUnique([...base.affectedNodeIds, ...affectedNodeIds]),
    allowedFiles,
    allowedAreas: sortedUnique([...base.allowedAreas, ...allowedFiles.flatMap(classifyGoalArea)]),
    forbiddenAreas: base.forbiddenAreas.filter(area => !allowedFiles.flatMap(classifyGoalArea).includes(area)),
    maxFilesChanged: Math.max(base.maxFilesChanged, Math.min(30, allowedFiles.length + 4)),
    requiredChecks,
    rationale: [
      ...base.rationale,
      "Goal scope includes files selected by affected-tree mapping and generated mission frontmatter.",
      `Mission plan contributed ${input.plan.missions.length} mission(s) to the scope contract.`
    ]
  };
}

function reviewCommandsFor(plan: GoalWorkspacePlan, scopeContract: ScopeContract, atreeCommands: AtreeCommandRecommendations): string[] {
  return [
    `npm run missions:plan -- --missions ${plan.missionDirRelativePath} --ignore-runtime`,
    `npm run missions:run -- --missions ${plan.missionDirRelativePath} --ignore-runtime`,
    atreeCommands.scopeCheck(`${plan.workspaceRelativePath}/scope-contract.json`),
    ...plannedCheckCommands(plan),
    atreeCommands.evaluate,
    "git diff --check"
  ].filter((command, index, commands) => commands.indexOf(command) === index && scopeContract.id);
}

function buildExecutionRefusalChecks(
  plan: GoalWorkspacePlan,
  mode: GoalMode,
  plannedCommands: string[],
  atreeCommands: AtreeCommandRecommendations
): GoalChecksRecord {
  return {
    goal_id: plan.id,
    status: "not-run",
    commands: [
      "npm run missions:run",
      ...plannedCommands,
      atreeCommands.scopeCheck(`${plan.workspaceRelativePath}/scope-contract.json`),
      atreeCommands.evaluate,
      "git diff --check"
    ].map(command => ({
      command,
      status: "not-run",
      summary: `${mode} refused automatic execution before this command was run.`
    })),
    notes: [
      "Automatic mission execution is intentionally disabled in this safe implementation.",
      "Use review-required mode and run the printed mission runner commands after inspecting the mission folder."
    ]
  };
}

function plannedCheckCommands(plan: GoalWorkspacePlan): string[] {
  return sortedUnique(plan.missionPlan.missions.flatMap(mission => mission.success_checks));
}

function buildAtreeCommandRecommendations(projectRoot: string): AtreeCommandRecommendations {
  const scripts = readRootPackageScripts(projectRoot);
  const hasGenericAtreeScript = scripts.has("atree");

  return {
    evaluate: scripts.has("atree:evaluate")
      ? "npm run atree:evaluate"
      : hasGenericAtreeScript
        ? "npm run atree -- evaluate --project ."
        : "npx atree evaluate --project .",
    scopeCheck: scopePath => hasGenericAtreeScript
      ? `npm run atree -- scope check --project . --scope ${scopePath}`
      : `npx atree scope check --project . --scope ${scopePath}`
  };
}

function readRootPackageScripts(projectRoot: string): Set<string> {
  const manifestPath = path.join(projectRoot, "package.json");
  if (!existsSync(manifestPath)) return new Set();

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { scripts?: unknown };
    if (!manifest.scripts || typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts)) return new Set();
    return new Set(Object.entries(manifest.scripts)
      .filter(([, command]) => typeof command === "string" && command.trim())
      .map(([name]) => name));
  } catch {
    return new Set();
  }
}

function commandRunsAtreeAction(command: string, action: "evaluate" | "validate"): boolean {
  const normalized = command.toLowerCase();
  return normalized.includes(action) && (
    normalized.includes("atree") ||
    normalized.includes("packages/cli/dist/index.js") ||
    normalized.includes("packages\\cli\\dist\\index.js")
  );
}

function buildGoalScore(input: {
  goalId: string;
  status: GoalStatus;
  scopeContract: ScopeContract;
  checks?: GoalChecksRecord;
  coherenceReviewWritten: boolean;
  createPr: boolean;
}): GoalCompletionScore {
  const checksPassed = input.checks?.status === "passed" ? 20 : 0;
  const validationPassed = input.checks?.commands.some(command =>
    commandRunsAtreeAction(command.command, "validate") && command.status === "passed"
  )
    ? 20
    : 0;
  const evaluationAvailable = input.checks?.commands.some(command =>
    commandRunsAtreeAction(command.command, "evaluate") && command.status === "passed"
  )
    ? 10
    : 0;
  const breakdown = {
    missions_completed: input.status === "success" ? 20 : 0,
    checks_passed: checksPassed,
    scope_respected: input.status === "success" || input.status === "partial" ? 15 : 0,
    validation_passed: validationPassed,
    evaluation_available: evaluationAvailable,
    docs_or_memory_updated: input.createPr ? 0 : 0,
    coherence_review_written: input.coherenceReviewWritten ? 5 : 0
  };
  const score = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const penalties = [
    input.status === "execution-refused" ? "Mission execution was refused, so completion cannot be credited." : "",
    input.scopeContract.requiresClarification ? "Scope contract requested clarification." : "",
    input.checks?.status === "not-run" ? "Post-run checks were not executed." : ""
  ].filter(Boolean);
  const evidence = [
    `Scope contract written: ${input.scopeContract.id}.`,
    input.coherenceReviewWritten ? "Coherence review written." : "",
    input.createPr ? "PR body written." : "",
    input.checks ? `Checks status: ${input.checks.status}.` : "Checks not requested."
  ].filter(Boolean);
  return {
    goal_id: input.goalId,
    status: input.status,
    score,
    breakdown,
    penalties,
    evidence
  };
}

function formatGoalRouteMarkdown(record: GoalRouteRecord): string {
  return [
    "# Goal Route",
    "",
    `Goal: ${record.goal_id}`,
    `Decision: ${record.route.decision}`,
    `Confidence: ${record.route.confidence.toFixed(2)}`,
    `Risk: ${record.route.estimatedRisk}`,
    `Complexity: ${record.route.estimatedComplexity}`,
    `Overridden: ${record.overridden ? "yes" : "no"}`,
    "",
    "## Reasons",
    ...listOrNone(record.route.reasons),
    "",
    "## Estimated Affected Layers",
    ...listOrNone(record.route.estimatedAffectedLayers),
    "",
    "## Estimated Files",
    ...listOrNone(record.route.estimatedFiles),
    "",
    "## Recommended Command",
    record.route.recommendedCommand,
    ""
  ].join("\n");
}

function formatGoalChecksMarkdown(checks: GoalChecksRecord): string {
  return [
    "# Goal Checks",
    "",
    `Status: ${checks.status}`,
    "",
    "## Commands",
    ...checks.commands.map(command => `- [${command.status}] ${command.command}: ${command.summary}`),
    "",
    "## Notes",
    ...listOrNone(checks.notes),
    ""
  ].join("\n");
}

function formatGoalCoherenceReview(input: {
  goalText: string;
  plan: GoalWorkspacePlan;
  routeRecord?: GoalRouteRecord;
  scopeContract: ScopeContract;
  checks?: GoalChecksRecord;
  status: GoalStatus;
  executionRefused: boolean;
}): string {
  const missionIds = input.plan.missionPlan.missions.map(mission => `${mission.id}: ${mission.title}`);
  const scopeStatus = input.executionRefused ? "not run because execution was refused" : "pending execution";
  const validationStatus = input.checks ? input.checks.status : "pending execution";
  return [
    "# Goal Coherence Review",
    "",
    "## Original Goal",
    summarizeGoal(input.goalText),
    "",
    "## Mission Plan Alignment",
    ...listOrNone(missionIds),
    "",
    "## Missions Completed",
    input.status === "success" ? "All planned missions completed." : "None recorded by this goal command.",
    "",
    "## Missions Failed",
    input.status === "failed" ? "One or more missions failed. Inspect mission runner artifacts." : "None recorded by this goal command.",
    "",
    "## Scope Check Result",
    `Scope contract ${input.scopeContract.id} was written; post-run scope check is ${scopeStatus}.`,
    "",
    "## Validation / Evaluation Result",
    `Checks are ${validationStatus}.`,
    "",
    "## Docs / Tests / Tree Memory Alignment",
    input.executionRefused
      ? "Not evaluated after execution because automatic mission execution was refused."
      : "Pending mission execution and follow-up checks.",
    "",
    "## Expected vs Actual Affected Areas",
    `Expected layers: ${input.plan.selectedLayers.join(", ") || "project"}. Actual changed areas are pending execution.`,
    "",
    "## Overreach Risks",
    ...listOrNone([
      input.scopeContract.requiresClarification ? "The scope contract contains ambiguities that should be resolved before execution." : "",
      input.executionRefused ? "No implementation diff was produced by this command, so overreach must be checked after manual mission execution." : "",
      input.routeRecord?.overridden ? "The route recommendation was overridden by --force-goal." : ""
    ].filter(Boolean)),
    "",
    "## What Remains Incomplete",
    input.executionRefused
      ? "Mission execution, post-run checks, scope check, evaluation comparison, and final PR-ready coherence are incomplete."
      : "Mission execution and post-run coherence review are incomplete.",
    "",
    "## Final Verdict",
    input.status,
    ""
  ].join("\n");
}

function formatGoalFinalReport(input: {
  plan: GoalWorkspacePlan;
  mode: GoalMode;
  routeRecord?: GoalRouteRecord;
  scopeContract: ScopeContract;
  checks?: GoalChecksRecord;
  status: GoalStatus;
  createPr: boolean;
  executionRefused: boolean;
}): string {
  return [
    "# Goal Final Report",
    "",
    "## Status",
    input.status,
    "",
    "## Routing Decision",
    routeSummary(input.routeRecord),
    "",
    "## Goal Workspace",
    input.plan.workspaceRelativePath,
    "",
    "## Mission Folder",
    input.plan.missionDirRelativePath,
    "",
    "## Recommended Next Commands",
    ...input.plan.reviewCommands.map(command => `- ${command}`),
    "",
    "## Missions Run",
    input.executionRefused ? "None. Automatic execution was refused." : "None. Planning/review mode only.",
    "",
    "## Checks Run",
    input.checks ? input.checks.commands.map(command => `- [${command.status}] ${command.command}`).join("\n") : "None yet.",
    "",
    "## Scope Result",
    `Scope contract written: ${input.scopeContract.id}. Post-run scope check pending.`,
    "",
    "## Evaluation Summary",
    input.checks?.commands.some(command => commandRunsAtreeAction(command.command, "evaluate") && command.status === "passed")
      ? "Evaluation completed."
      : "Evaluation pending execution.",
    "",
    "## Coherence Summary",
    input.executionRefused
      ? "Coherence review records that execution was refused and post-run evidence is incomplete."
      : "Coherence review is planning-only until missions run.",
    "",
    "## Goal Score",
    `${input.plan.workspaceRelativePath}/goal-score.json`,
    "",
    "## PR Body",
    input.createPr ? `${input.plan.workspaceRelativePath}/pr-body.md` : "Not requested.",
    "",
    "## Remaining Risks",
    ...listOrNone([
      input.executionRefused ? `${input.mode} did not execute missions; manual review is still required.` : "",
      input.scopeContract.requiresClarification ? "Scope contract has ambiguities." : "",
      "Deterministic planning can miss semantic coupling; inspect mission affected files before execution."
    ].filter(Boolean)),
    "",
    "## Follow-Up Missions",
    "Use the mission folder with the printed mission runner commands, then rerun scope check, evaluation, and coherence review.",
    ""
  ].join("\n");
}

function formatGoalPrBody(input: {
  goalText: string;
  plan: GoalWorkspacePlan;
  routeRecord?: GoalRouteRecord;
  scopeContract: ScopeContract;
  checks?: GoalChecksRecord;
  score: GoalCompletionScore;
  executionRefused: boolean;
}): string {
  return [
    "# Goal-Driven Abstraction Tree PR",
    "",
    "## Original Goal",
    summarizeGoal(input.goalText),
    "",
    "## Routing Decision",
    routeSummary(input.routeRecord),
    "",
    "## Mission Plan",
    ...input.plan.missionPlan.missions.map(mission => `- ${mission.id}: ${mission.title}`),
    "",
    "## Missions Run",
    input.executionRefused ? "None. Automatic execution was refused." : "None. This PR body is planning-only.",
    "",
    "## Key Changes",
    "- Goal workspace, mission plan, scope contract, coherence review, final report, and goal score were generated.",
    "",
    "## Validation / Evaluation",
    input.checks ? `Checks status: ${input.checks.status}.` : "Pending mission execution.",
    "",
    "## Scope Check",
    `Scope contract written: ${input.scopeContract.id}. Post-run scope check pending.`,
    "",
    "## Coherence Review",
    `${input.plan.workspaceRelativePath}/coherence-review.md`,
    "",
    "## Goal Score",
    `${input.score.score}/100 (${input.score.status})`,
    "",
    "## Risks",
    ...listOrNone(input.score.penalties),
    "",
    "## Manual Review Required",
    "- Inspect generated missions before running Codex.",
    "- Do not treat this planning-only PR body as evidence that implementation is complete.",
    "",
    "## Follow-Up",
    "- Run the mission folder, scope check, evaluation, and update this PR body with actual implementation results.",
    ""
  ].join("\n");
}

function routeSummary(record: GoalRouteRecord | undefined): string {
  if (!record) return "Not requested.";
  return `${record.route.decision} (${record.route.confidence.toFixed(2)})${record.overridden ? " overridden by --force-goal" : ""}.`;
}

function summarizeGoal(goalText: string): string {
  const summary = goalText.trim().replace(/\s+/gu, " ");
  if (summary.length <= 500) return summary || "No goal supplied.";
  return `${summary.slice(0, 497).trim()}...`;
}

function classifyGoalArea(filePath: string): string[] {
  const normalized = normalizeGoalPath(filePath);
  const tokens = tokenizeGoalPath(normalized);
  const areas = new Set<string>();
  if (tokens.some(token => ["app", "frontend", "ui", "component", "components"].includes(token))) areas.add("app");
  if (tokens.some(token => ["src", "source", "lib", "core", "service", "services", "api"].includes(token))) areas.add("source");
  if (tokens.some(token => ["cli", "command", "commands", "bin"].includes(token))) areas.add("source");
  if (normalized.startsWith("scripts/")) areas.add("scripts");
  if (normalized.startsWith(".abstraction-tree/")) areas.add("memory");
  if (normalized.startsWith(".github/")) areas.add("ci");
  if (normalized.startsWith("docs/") || normalized.endsWith(".md")) areas.add("docs");
  if (normalized.includes(".test.") || normalized.includes("/tests/")) areas.add("tests");
  if (normalized.endsWith("package.json") || normalized.endsWith("package-lock.json")) areas.add("package");
  if (normalized.startsWith(".abstraction-tree/automation/")) areas.add("automation");
  return [...areas];
}

function tokenizeGoalPath(filePath: string): string[] {
  return normalizeGoalPath(filePath)
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function normalizeGoalPath(filePath: string): string {
  return path.posix.normalize(filePath.replaceAll("\\", "/")).replace(/^\.\//u, "");
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function listOrNone(values: string[]): string[] {
  return values.length ? values.map(value => `- ${value}`) : ["- None."];
}

function relativeOrAbsolute(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return normalizePath(relative);
  return normalizePath(filePath);
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

const defaultIo: GoalCommandIo = {
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(`${text}\n`)
};
