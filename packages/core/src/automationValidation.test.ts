import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { validateAutomation } from "./automationValidation.js";

const loopConfigPath = ".abstraction-tree/automation/loop-config.json";
const loopRuntimeExamplePath = ".abstraction-tree/automation/loop-runtime.example.json";
const loopRuntimePath = ".abstraction-tree/automation/loop-runtime.json";
const loopStatePath = ".abstraction-tree/automation/loop-state.json";
const missionRuntimeExamplePath = ".abstraction-tree/automation/mission-runtime.example.json";
const missionRuntimePath = ".abstraction-tree/automation/mission-runtime.json";
const missionLogsPath = ".abstraction-tree/automation/mission-logs/";
const fullLoopLivePidPath = ".abstraction-tree/automation/full-loop-live.pid";
const fullLoopRunsPath = ".abstraction-tree/automation/full-loop-runs/";
const assessmentPacksPath = ".abstraction-tree/assessment-packs/";
const missionRunsPath = ".abstraction-tree/mission-runs/";
const worktreesPath = ".abstraction-tree/worktrees/";

const localRuntimePaths = [
  loopRuntimePath,
  missionRuntimePath,
  missionLogsPath,
  fullLoopLivePidPath,
  fullLoopRunsPath,
  assessmentPacksPath,
  missionRunsPath,
  worktreesPath
];

test("validateAutomation accepts valid committed config and ignored runtime state", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);

  const issues = await validateAutomation(root);

  assert.deepEqual(issues, []);
});

test("validateAutomation accepts BOM-prefixed automation JSON", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root, {}, { bom: true });

  const issues = await validateAutomation(root);

  assert.deepEqual(issues, []);
});

test("validateAutomation reports legacy loop-state.json", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, loopStatePath, { loops_today: 1 });

  const issues = await validateAutomation(root);

  assert.ok(hasIssue(issues, loopStatePath, "loop-state.json exists"));
});

test("validateAutomation reports volatile runtime fields in committed config", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root, {
    loops_today: 2,
    failed_loops_today: 1,
    stagnation_count: 1,
    last_result: "failed",
    last_run_date: "2026-05-04",
    stop_requested: false
  });

  const issues = await validateAutomation(root);

  assert.ok(hasIssue(issues, loopConfigPath, "volatile runtime field loops_today"));
  assert.ok(hasIssue(issues, loopConfigPath, "volatile runtime field failed_loops_today"));
  assert.ok(hasIssue(issues, loopConfigPath, "volatile runtime field stagnation_count"));
  assert.ok(hasIssue(issues, loopConfigPath, "volatile runtime field last_result"));
  assert.ok(hasIssue(issues, loopConfigPath, "volatile runtime field last_run_date"));
  assert.ok(hasIssue(issues, loopConfigPath, "volatile runtime field stop_requested"));
});

test("validateAutomation reports invalid automation config values", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root, {
    max_loops_today: -1,
    max_minutes_today: 0,
    max_failed_loops: "3",
    commit_each_successful_loop: "false",
    stop_if_diff_too_large: 1
  });

  const issues = await validateAutomation(root);

  assert.ok(hasIssue(issues, loopConfigPath, "field max_loops_today must be a non-negative integer"));
  assert.ok(hasIssue(issues, loopConfigPath, "field max_minutes_today must be a positive integer"));
  assert.ok(hasIssue(issues, loopConfigPath, "field max_failed_loops must be a non-negative integer"));
  assert.ok(hasIssue(issues, loopConfigPath, "flag commit_each_successful_loop must be boolean"));
  assert.ok(hasIssue(issues, loopConfigPath, "flag stop_if_diff_too_large must be boolean"));
});

test("validateAutomation reports invalid automation runtime example values", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root, {}, {
    runtimeOverrides: {
      loops_today: -1,
      consecutive_test_failures: "0",
      last_run_date: 20260504,
      stop_requested: "false"
    }
  });

  const issues = await validateAutomation(root);

  assert.ok(hasIssue(issues, loopRuntimeExamplePath, "runtime field loops_today must be a non-negative integer"));
  assert.ok(hasIssue(issues, loopRuntimeExamplePath, "runtime field consecutive_test_failures must be a non-negative integer"));
  assert.ok(hasIssue(issues, loopRuntimeExamplePath, "runtime field last_run_date must be a string"));
  assert.ok(hasIssue(issues, loopRuntimeExamplePath, "runtime flag stop_requested must be boolean"));
});

test("validateAutomation reports invalid mission runtime example values", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root, {}, {
    missionRuntimeOverrides: {
      completed: ["mission-001.md", 2],
      failed: "mission-002.md",
      current: null,
      stop_requested: "false"
    }
  });

  const issues = await validateAutomation(root);

  assert.ok(hasIssue(issues, missionRuntimeExamplePath, "field completed must be an array of strings"));
  assert.ok(hasIssue(issues, missionRuntimeExamplePath, "field failed must be an array of strings"));
  assert.ok(hasIssue(issues, missionRuntimeExamplePath, "field current must be a string"));
  assert.ok(hasIssue(issues, missionRuntimeExamplePath, "flag stop_requested must be boolean"));
});

test("validateAutomation reports missing config and runtime example files", async t => {
  const root = await workspace(t);

  const issues = await validateAutomation(root);

  assert.ok(hasIssue(issues, loopConfigPath, "config is missing"));
  assert.ok(hasIssue(issues, loopRuntimeExamplePath, "runtime example is missing"));
  assert.ok(hasIssue(issues, missionRuntimeExamplePath, "mission runtime example is missing"));
});

test("validateAutomation reports local runtime artifact paths when they are not ignored", async t => {
  const root = await workspace(t, { ignoreRuntime: false });
  await writeValidAutomationFiles(root, {}, { writeGitignore: false });

  const issues = await validateAutomation(root);

  for (const runtimePath of localRuntimePaths) {
    assert.ok(hasIssue(issues, runtimePath, "not ignored"), runtimePath);
  }
});

test("validateAutomation uses root gitignore fallback for runtime artifact paths", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);

  const issues = await validateAutomation(root);

  for (const runtimePath of localRuntimePaths) {
    assert.ok(!hasIssue(issues, runtimePath, "not ignored"), runtimePath);
  }
});

test("validateAutomation warns when local runtime artifact paths are tracked", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  const runGit = fakeGitRunner([
    missionRuntimePath,
    ".abstraction-tree/automation/mission-logs/run.log",
    fullLoopLivePidPath,
    ".abstraction-tree/automation/full-loop-runs/2026/status.json",
    ".abstraction-tree/assessment-packs/2026/assessment-prompt.md",
    ".abstraction-tree/mission-runs/2026/status.json",
    ".abstraction-tree/worktrees/2026/status.txt"
  ]);

  const issues = await validateAutomation(root, { runGit });

  for (const runtimePath of [
    missionRuntimePath,
    missionLogsPath,
    fullLoopLivePidPath,
    fullLoopRunsPath,
    assessmentPacksPath,
    missionRunsPath,
    worktreesPath
  ]) {
    assert.ok(hasIssue(issues, runtimePath, "is tracked"), runtimePath);
  }
});

async function workspace(t: TestContext, options: { ignoreRuntime?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-automation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".abstraction-tree", "automation"), { recursive: true });
  if (options.ignoreRuntime !== false) {
    await writeRootGitignore(root);
  }
  return root;
}

async function writeValidAutomationFiles(
  root: string,
  configOverrides: Record<string, unknown> = {},
  options: {
    bom?: boolean;
    writeGitignore?: boolean;
    runtimeOverrides?: Record<string, unknown>;
    missionRuntimeOverrides?: Record<string, unknown>;
  } = {}
) {
  if (options.writeGitignore !== false) {
    await writeRootGitignore(root);
  }
  await writeJson(root, loopConfigPath, {
    max_loops_today: 25,
    max_minutes_today: 300,
    max_stagnation: 3,
    max_failed_loops: 3,
    max_diff_lines: 1200,
    commit_each_successful_loop: false,
    revert_failed_experiments: true,
    stop_if_tests_fail_twice: true,
    stop_if_diff_too_large: true,
    ...configOverrides
  }, { bom: options.bom });
  await writeJson(root, loopRuntimeExamplePath, {
    loops_today: 0,
    failed_loops_today: 0,
    stagnation_count: 0,
    consecutive_test_failures: 0,
    last_result: "",
    last_run_date: "",
    stop_requested: false,
    ...options.runtimeOverrides
  }, { bom: options.bom });
  await writeJson(root, missionRuntimeExamplePath, {
    completed: [],
    failed: [],
    current: "",
    stop_requested: false,
    ...options.missionRuntimeOverrides
  }, { bom: options.bom });
}

async function writeJson(root: string, relativePath: string, value: unknown, options: { bom?: boolean } = {}) {
  await writeFileAt(root, relativePath, `${options.bom ? "\ufeff" : ""}${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileAt(root: string, relativePath: string, text: string) {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
}

async function writeRootGitignore(root: string) {
  await writeFile(path.join(root, ".gitignore"), `${localRuntimePaths.join("\n")}\n`, "utf8");
}

function hasIssue(issues: { filePath?: string; message: string }[], filePath: string, message: string): boolean {
  return issues.some(issue => issue.filePath === filePath && issue.message.includes(message));
}

function fakeGitRunner(trackedPaths: string[]) {
  const tracked = new Set(trackedPaths);
  return async (args: string[]): Promise<{ stdout: string }> => {
    if (args[0] === "check-ignore") {
      throw new Error("Use root .gitignore fallback.");
    }

    if (args[0] !== "ls-files") {
      throw new Error(`Unexpected git command: ${args.join(" ")}`);
    }

    const relativePath = args[args.length - 1];
    if (args.includes("--error-unmatch")) {
      if (tracked.has(relativePath)) return { stdout: `${relativePath}\n` };
      throw new Error(`${relativePath} is not tracked.`);
    }

    const matches = [...tracked].filter(filePath => filePath.startsWith(relativePath));
    return { stdout: matches.join("\n") };
  };
}
