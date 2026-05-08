import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ValidationIssue } from "./schema.js";
import { readJson } from "./workspace.js";

const execFileAsync = promisify(execFile);

const AUTOMATION_DIR = ".abstraction-tree/automation";
const LOOP_STATE_PATH = `${AUTOMATION_DIR}/loop-state.json`;
const LOOP_CONFIG_PATH = `${AUTOMATION_DIR}/loop-config.json`;
const LOOP_RUNTIME_EXAMPLE_PATH = `${AUTOMATION_DIR}/loop-runtime.example.json`;
const LOOP_RUNTIME_PATH = `${AUTOMATION_DIR}/loop-runtime.json`;

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

export async function validateAutomation(projectRoot: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

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

  if (await isGitTracked(projectRoot, LOOP_RUNTIME_PATH)) {
    issues.push({
      severity: "warning",
      filePath: LOOP_RUNTIME_PATH,
      message: "Automation loop-runtime.json is tracked; it must remain local runtime state."
    });
  }

  if (!(await isIgnoredByRootGitignore(projectRoot, LOOP_RUNTIME_PATH))) {
    issues.push({
      severity: "warning",
      filePath: LOOP_RUNTIME_PATH,
      message: "Automation loop-runtime.json is not ignored by the root .gitignore."
    });
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

async function isGitTracked(projectRoot: string, relativePath: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
      cwd: projectRoot,
      windowsHide: true
    });
    return true;
  } catch {
    return false;
  }
}

async function isIgnoredByRootGitignore(projectRoot: string, relativePath: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["check-ignore", "--quiet", "--no-index", "--", relativePath], {
      cwd: projectRoot,
      windowsHide: true
    });
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

function rootGitignoreContainsPath(gitignoreText: string, relativePath: string): boolean {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const basename = path.posix.basename(normalizedPath);
  return gitignoreText.split(/\r?\n/).some(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) return false;
    const normalizedPattern = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    return normalizedPattern === normalizedPath || (!normalizedPattern.includes("/") && normalizedPattern === basename);
  });
}
