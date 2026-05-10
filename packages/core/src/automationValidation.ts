import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ValidationIssue } from "./schema.js";
import { readJson } from "./workspace.js";

const execFileAsync = promisify(execFile);

export interface AutomationValidationOptions {
  runGit?: (args: string[], cwd: string) => Promise<GitResult>;
}

export interface GitResult {
  stdout: string;
}

type GitRunner = NonNullable<AutomationValidationOptions["runGit"]>;

const AUTOMATION_DIR = ".abstraction-tree/automation";
const LOOP_STATE_PATH = `${AUTOMATION_DIR}/loop-state.json`;
const LOOP_CONFIG_PATH = `${AUTOMATION_DIR}/loop-config.json`;
const LOOP_RUNTIME_EXAMPLE_PATH = `${AUTOMATION_DIR}/loop-runtime.example.json`;
const LOOP_RUNTIME_PATH = `${AUTOMATION_DIR}/loop-runtime.json`;
const MISSION_RUNTIME_EXAMPLE_PATH = `${AUTOMATION_DIR}/mission-runtime.example.json`;
const MISSION_RUNTIME_PATH = `${AUTOMATION_DIR}/mission-runtime.json`;
const MISSION_LOGS_PATH = `${AUTOMATION_DIR}/mission-logs/`;
const FULL_LOOP_LIVE_PID_PATH = `${AUTOMATION_DIR}/full-loop-live.pid`;
const FULL_LOOP_RUNS_PATH = `${AUTOMATION_DIR}/full-loop-runs/`;
const ASSESSMENT_PACKS_PATH = ".abstraction-tree/assessment-packs/";
const MISSION_RUNS_PATH = ".abstraction-tree/mission-runs/";
const WORKTREES_PATH = ".abstraction-tree/worktrees/";

const localRuntimePaths = [
  { path: LOOP_RUNTIME_PATH, label: "Automation loop-runtime.json" },
  { path: MISSION_RUNTIME_PATH, label: "Automation mission-runtime.json" },
  { path: MISSION_LOGS_PATH, label: "Automation mission-logs/" },
  { path: FULL_LOOP_LIVE_PID_PATH, label: "Automation full-loop-live.pid" },
  { path: FULL_LOOP_RUNS_PATH, label: "Automation full-loop-runs/" },
  { path: ASSESSMENT_PACKS_PATH, label: "Assessment packs/" },
  { path: MISSION_RUNS_PATH, label: "Automation mission-runs/" },
  { path: WORKTREES_PATH, label: "Automation worktrees/" }
];

const volatileConfigFields = [
  "loops_today",
  "failed_loops_today",
  "stagnation_count",
  "consecutive_test_failures",
  "last_result",
  "last_run_date",
  "stop_requested"
];

const nonNegativeIntegerFields = [
  "max_loops_today",
  "max_stagnation",
  "max_failed_loops",
  "max_diff_lines"
];

const positiveIntegerFields = [
  "max_minutes_today"
];

const booleanFields = [
  "commit_each_successful_loop",
  "revert_failed_experiments",
  "stop_if_tests_fail_twice",
  "stop_if_diff_too_large"
];

const runtimeNonNegativeIntegerFields = [
  "loops_today",
  "failed_loops_today",
  "stagnation_count",
  "consecutive_test_failures"
];

const runtimeStringFields = [
  "last_result",
  "last_run_date"
];

const runtimeBooleanFields = [
  "stop_requested"
];

const missionRuntimeArrayFields = [
  "completed",
  "failed"
];

const missionRuntimeStringFields = [
  "current"
];

const missionRuntimeBooleanFields = [
  "stop_requested"
];

export async function validateAutomation(projectRoot: string, options: AutomationValidationOptions = {}): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const runGit = options.runGit ?? defaultGitRunner;

  if (existsSync(projectFile(projectRoot, LOOP_STATE_PATH))) {
    issues.push({
      severity: "warning",
      filePath: LOOP_STATE_PATH,
      message: "Legacy automation loop-state.json exists; use loop-config.json plus ignored loop-runtime.json instead."
    });
  }

  const configPath = projectFile(projectRoot, LOOP_CONFIG_PATH);
  if (!existsSync(configPath)) {
    issues.push({
      severity: "warning",
      filePath: LOOP_CONFIG_PATH,
      message: "Automation loop config is missing."
    });
  } else {
    const config = await readJsonRecord(configPath, LOOP_CONFIG_PATH, "Automation loop config");
    issues.push(...config.issues);
    if (config.value) issues.push(...validateAutomationConfig(config.value));
  }

  const runtimeExamplePath = projectFile(projectRoot, LOOP_RUNTIME_EXAMPLE_PATH);
  if (!existsSync(runtimeExamplePath)) {
    issues.push({
      severity: "warning",
      filePath: LOOP_RUNTIME_EXAMPLE_PATH,
      message: "Automation loop runtime example is missing."
    });
  } else {
    const runtime = await readJsonRecord(runtimeExamplePath, LOOP_RUNTIME_EXAMPLE_PATH, "Automation loop runtime example");
    issues.push(...runtime.issues);
    if (runtime.value) issues.push(...validateAutomationRuntime(runtime.value, LOOP_RUNTIME_EXAMPLE_PATH));
  }

  const missionRuntimeExamplePath = projectFile(projectRoot, MISSION_RUNTIME_EXAMPLE_PATH);
  if (!existsSync(missionRuntimeExamplePath)) {
    issues.push({
      severity: "warning",
      filePath: MISSION_RUNTIME_EXAMPLE_PATH,
      message: "Automation mission runtime example is missing."
    });
  } else {
    const missionRuntime = await readJsonRecord(missionRuntimeExamplePath, MISSION_RUNTIME_EXAMPLE_PATH, "Automation mission runtime example");
    issues.push(...missionRuntime.issues);
    if (missionRuntime.value) issues.push(...validateMissionRuntime(missionRuntime.value, MISSION_RUNTIME_EXAMPLE_PATH));
  }

  for (const runtimePath of localRuntimePaths) {
    if (await isGitTracked(projectRoot, runtimePath.path, runGit)) {
      issues.push({
        severity: "warning",
        filePath: runtimePath.path,
        message: `${runtimePath.label} is tracked; it must remain local runtime state.`
      });
    }

    if (!(await isIgnoredByRootGitignore(projectRoot, runtimePath.path, runGit))) {
      issues.push({
        severity: "warning",
        filePath: runtimePath.path,
        message: `${runtimePath.label} is not ignored by the root .gitignore.`
      });
    }
  }

  return issues;
}

export function validateAutomationConfig(config: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of volatileConfigFields) {
    if (Object.prototype.hasOwnProperty.call(config, field)) {
      issues.push({
        severity: "warning",
        filePath: LOOP_CONFIG_PATH,
        message: `Automation loop config contains volatile runtime field ${field}.`
      });
    }
  }

  for (const field of nonNegativeIntegerFields) {
    if (!isIntegerAtLeast(config[field], 0)) {
      issues.push({
        severity: "warning",
        filePath: LOOP_CONFIG_PATH,
        message: `Automation loop config field ${field} must be a non-negative integer.`
      });
    }
  }

  for (const field of positiveIntegerFields) {
    if (!isIntegerAtLeast(config[field], 1)) {
      issues.push({
        severity: "warning",
        filePath: LOOP_CONFIG_PATH,
        message: `Automation loop config field ${field} must be a positive integer.`
      });
    }
  }

  for (const field of booleanFields) {
    if (typeof config[field] !== "boolean") {
      issues.push({
        severity: "warning",
        filePath: LOOP_CONFIG_PATH,
        message: `Automation loop config flag ${field} must be boolean.`
      });
    }
  }

  return issues;
}

export function validateAutomationRuntime(runtime: Record<string, unknown>, filePath: string = LOOP_RUNTIME_EXAMPLE_PATH): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of runtimeNonNegativeIntegerFields) {
    if (!isIntegerAtLeast(runtime[field], 0)) {
      issues.push({
        severity: "warning",
        filePath,
        message: `Automation loop runtime field ${field} must be a non-negative integer.`
      });
    }
  }

  for (const field of runtimeStringFields) {
    if (typeof runtime[field] !== "string") {
      issues.push({
        severity: "warning",
        filePath,
        message: `Automation loop runtime field ${field} must be a string.`
      });
    }
  }

  for (const field of runtimeBooleanFields) {
    if (typeof runtime[field] !== "boolean") {
      issues.push({
        severity: "warning",
        filePath,
        message: `Automation loop runtime flag ${field} must be boolean.`
      });
    }
  }

  return issues;
}

export function validateMissionRuntime(runtime: Record<string, unknown>, filePath: string = MISSION_RUNTIME_EXAMPLE_PATH): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of missionRuntimeArrayFields) {
    const value = runtime[field];
    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
      issues.push({
        severity: "warning",
        filePath,
        message: `Automation mission runtime field ${field} must be an array of strings.`
      });
    }
  }

  for (const field of missionRuntimeStringFields) {
    if (typeof runtime[field] !== "string") {
      issues.push({
        severity: "warning",
        filePath,
        message: `Automation mission runtime field ${field} must be a string.`
      });
    }
  }

  for (const field of missionRuntimeBooleanFields) {
    if (typeof runtime[field] !== "boolean") {
      issues.push({
        severity: "warning",
        filePath,
        message: `Automation mission runtime flag ${field} must be boolean.`
      });
    }
  }

  return issues;
}

async function readJsonRecord(
  filePath: string,
  relativePath: string,
  label: string
): Promise<{ value?: Record<string, unknown>; issues: ValidationIssue[] }> {
  try {
    const parsed = await readJson<unknown>(filePath, undefined);
    if (objectRecord(parsed)) return { value: parsed, issues: [] };
    return {
      issues: [{
        severity: "warning",
        filePath: relativePath,
        message: `${label} must be a JSON object.`
      }]
    };
  } catch {
    return {
      issues: [{
        severity: "warning",
        filePath: relativePath,
        message: `${label} is not valid JSON.`
      }]
    };
  }
}

async function defaultGitRunner(args: string[], cwd: string): Promise<GitResult> {
  const result = await execFileAsync("git", args, {
    cwd,
    windowsHide: true
  });
  return { stdout: String(result.stdout) };
}

async function isGitTracked(projectRoot: string, relativePath: string, runGit: GitRunner): Promise<boolean> {
  try {
    const args = isDirectoryPath(relativePath)
      ? ["ls-files", "--", relativePath]
      : ["ls-files", "--error-unmatch", "--", relativePath];
    const result = await runGit(args, projectRoot);
    return isDirectoryPath(relativePath) ? result.stdout.trim().length > 0 : true;
  } catch {
    return false;
  }
}

async function isIgnoredByRootGitignore(projectRoot: string, relativePath: string, runGit: GitRunner): Promise<boolean> {
  try {
    await runGit(["check-ignore", "--quiet", "--no-index", "--", relativePath], projectRoot);
    return true;
  } catch {
    // Fall back to the root .gitignore below for non-git test fixtures.
  }

  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!existsSync(gitignorePath)) return false;

  try {
    return rootGitignoreContainsPath(await readFile(gitignorePath, "utf8"), relativePath);
  } catch {
    return false;
  }
}

function projectFile(projectRoot: string, relativePath: string): string {
  return path.join(projectRoot, ...relativePath.split("/"));
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerAtLeast(value: unknown, minimum: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum;
}

function isDirectoryPath(relativePath: string): boolean {
  return relativePath.endsWith("/");
}

function rootGitignoreContainsPath(gitignoreText: string, relativePath: string): boolean {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const pathWithoutTrailingSlash = normalizedPath.replace(/\/+$/, "");
  const basename = path.posix.basename(pathWithoutTrailingSlash);
  return gitignoreText.split(/\r?\n/).some(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) return false;
    const normalizedPattern = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    const patternWithoutTrailingSlash = normalizedPattern.replace(/\/+$/, "");
    return patternWithoutTrailingSlash === pathWithoutTrailingSlash || (!normalizedPattern.includes("/") && patternWithoutTrailingSlash === basename);
  });
}
