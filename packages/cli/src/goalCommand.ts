import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildGoalWorkspacePlan,
  ensureWorkspace,
  formatPromptRouteResult,
  readChangeRecords,
  readConcepts,
  readEvaluationReports,
  readFileSummaries,
  readInvariants,
  readTreeNodes,
  routePrompt,
  writeJson,
  type GoalMode,
  type GoalWorkspacePlan
} from "@abstraction-tree/core";
import { readPromptRouteMemory } from "./routeCommand.js";

export interface GoalCommandOptions {
  projectRoot: string;
  file?: string;
  planOnly?: boolean;
  reviewRequired?: boolean;
  fullAuto?: boolean;
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

export async function runGoalCommand(
  options: GoalCommandOptions,
  io: GoalCommandIo = defaultIo
): Promise<number> {
  const mode = resolveGoalMode(options);
  if (!mode) {
    io.stderr("Choose only one goal mode: --plan-only, --review-required, --full-auto, or --create-pr.");
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

  if (options.autoRoute && !options.forceGoal) {
    const memory = await readPromptRouteMemory(projectRoot);
    const route = routePrompt({
      prompt: goalText,
      promptFile: goalFile,
      ...memory
    });
    if (route.decision !== "goal-driven") {
      io.stdout(formatPromptRouteResult(route, { explain: true }));
      io.stdout("Goal planning stopped. Pass --force-goal to create a goal workspace anyway.\n");
      return route.decision === "manual-review" ? 2 : 0;
    }
    io.stdout(`Prompt router decision: goal-driven (${route.confidence.toFixed(2)}). Continuing with goal planning.\n\n`);
  }

  await ensureWorkspace(projectRoot);
  const [nodes, files, concepts, invariants, changes, evaluations] = await Promise.all([
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
    projectRoot: "."
  });

  await writeGoalWorkspace(projectRoot, plan, goalText);
  io.stdout(formatGoalCommandResult(plan, mode));

  if (mode === "full-auto") {
    io.stderr("Full-auto goal execution is intentionally disabled in this safe first implementation. Review the generated missions, then run the printed mission runner commands.");
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
  await writeFile(path.join(workspacePath, "goal-assessment.md"), plan.assessmentMarkdown, "utf8");
  await writeJson(path.join(workspacePath, "affected-tree.json"), plan.affectedTree);
  await writeJson(path.join(workspacePath, "mission-plan.json"), plan.missionPlan);
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
  if (options.createPr) selected.push("create-pr");
  if (selected.length > 1) return undefined;
  return selected[0] ?? "review-required";
}

function formatGoalCommandResult(plan: GoalWorkspacePlan, mode: GoalMode): string {
  const lines = [
    `Wrote goal workspace: ${plan.workspaceRelativePath}`,
    `Wrote mission folder: ${plan.missionDirRelativePath}`,
    `Mode: ${mode}`,
    ""
  ];
  if (mode === "plan-only") {
    lines.push("Plan-only mode did not run Codex.");
  } else if (mode === "review-required") {
    lines.push("Review the generated missions, then run:");
    lines.push(...plan.reviewCommands.map(command => `  ${command}`));
  } else if (mode === "full-auto") {
    lines.push("Full-auto mode planned the goal but did not execute missions.");
    lines.push("Run manually after review:");
    lines.push(...plan.reviewCommands.map(command => `  ${command}`));
  } else if (mode === "create-pr") {
    lines.push(`Wrote draft PR body: ${plan.workspaceRelativePath}/pr-body.md`);
    lines.push("No push, PR creation, or merge was performed.");
  }
  lines.push("");
  return lines.join("\n");
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
