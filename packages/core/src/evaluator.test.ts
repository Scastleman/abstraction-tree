import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { CONTEXT_OVER_BROAD_LIMITS, CONTEXT_PACK_LIMITS } from "./contextLimits.js";
import { evaluateProject } from "./evaluator.js";
import type { FileSummary, TreeNode } from "./schema.js";

const loopConfigPath = ".abstraction-tree/automation/loop-config.json";
const loopRuntimeExamplePath = ".abstraction-tree/automation/loop-runtime.example.json";
const loopRuntimePath = ".abstraction-tree/automation/loop-runtime.json";

test("evaluateProject counts tree nodes", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/tree.json", [
    node("root", undefined, ["feature"]),
    node("feature", "root", [])
  ]);

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.tree.nodeCount, 2);
  assert.equal(report.tree.orphanNodeCount, 0);
});

test("evaluateProject detects missing ownership", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "orphan.ts"), "export const orphan = true;\n", "utf8");
  await writeJson(root, ".abstraction-tree/files.json", [file("src/orphan.ts", [])]);

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.tree.filesWithoutOwners, 1);
});

test("evaluateProject counts run reports by result", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeRun(root, "2026-05-04-1000-agent-run.md", "success");
  await writeRun(root, "2026-05-04-1001-agent-run.md", "partial");
  await writeRun(root, "2026-05-04-1002-agent-run.md", "failed");
  await writeRun(root, "2026-05-04-1003-agent-run.md", "no-op");

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.deepEqual(report.runs, {
    runReportCount: 4,
    successCount: 1,
    partialCount: 1,
    failedCount: 1,
    noOpCount: 1
  });
});

test("evaluateProject reports generated scan change-record buildup", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  for (let index = 0; index < 12; index += 1) {
    await writeChange(root, `scan.${index}`);
  }
  await writeChange(root, "semantic.1");
  await writeChange(root, "semantic.2");

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.deepEqual(report.changes, {
    totalChangeRecordCount: 14,
    generatedScanRecordCount: 12,
    semanticChangeRecordCount: 2,
    generatedScanReviewNeeded: true
  });
  assert.ok(report.issues.some(issue =>
    issue.area === "changes" &&
    issue.filePath === ".abstraction-tree/changes" &&
    issue.message.includes("12 generated scan records")
  ));
});

test("evaluateProject reports automation config status", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root, { max_minutes_today: 0 });

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.automation.runtimeStateIgnored, true);
  assert.equal(report.automation.configValid, false);
  assert.ok(report.issues.some(issue => issue.filePath === loopConfigPath));
});

test("evaluateProject flags context packs at over-broad boundaries", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/context-packs/narrow.json", {
    relevantNodes: Array.from({ length: CONTEXT_PACK_LIMITS.nodes }, (_, index) => ({ id: `node.${index}` })),
    relevantFiles: Array.from({ length: CONTEXT_PACK_LIMITS.files }, (_, index) => ({ path: `src/file-${index}.ts` })),
    relevantConcepts: Array.from({ length: CONTEXT_PACK_LIMITS.concepts }, (_, index) => ({ id: `concept.${index}` }))
  });
  await writeJson(root, ".abstraction-tree/context-packs/broad.json", {
    relevantNodes: Array.from({ length: CONTEXT_OVER_BROAD_LIMITS.nodes }, (_, index) => ({ id: `node.${index}` })),
    relevantFiles: [],
    relevantConcepts: []
  });

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.context.possibleOverBroadPacks, 1);
});

test("evaluateProject accepts BOM-prefixed metadata JSON", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/tree.json", [node("root", undefined, [])], { bom: true });
  await writeJson(root, ".abstraction-tree/context-packs/root.json", {
    relevantNodes: [{ id: "root" }],
    relevantFiles: [],
    relevantConcepts: []
  }, { bom: true });

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.tree.nodeCount, 1);
  assert.equal(report.context.lastPackCount, 1);
  assert.ok(!report.issues.some(issue => issue.message.includes("not valid JSON")));
});

test("evaluation output is serializable", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/tree.json", [node("root", undefined, [])]);
  await writeFile(path.join(root, ".abstraction-tree", "lessons", "one.md"), "# Lesson\n\nRepeat this lesson.\n", "utf8");
  await writeFile(path.join(root, ".abstraction-tree", "lessons", "two.md"), "# Lesson\n\nRepeat this lesson.\n", "utf8");

  const report = await evaluateProject(root, { now: fixedNow() });
  const parsed = JSON.parse(JSON.stringify(report, null, 2));

  assert.equal(parsed.timestamp, "2026-05-04T15:30:00.000Z");
  assert.equal(parsed.lessons.duplicateLessonCandidates, 1);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-evaluator-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".abstraction-tree", "automation"), { recursive: true });
  await mkdir(path.join(root, ".abstraction-tree", "runs"), { recursive: true });
  await mkdir(path.join(root, ".abstraction-tree", "lessons"), { recursive: true });
  await writeFile(path.join(root, ".gitignore"), `${loopRuntimePath}\n`, "utf8");
  return root;
}

async function writeValidAutomationFiles(root: string, configOverrides: Record<string, unknown> = {}) {
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
  });
  await writeJson(root, loopRuntimeExamplePath, {
    loops_today: 0,
    failed_loops_today: 0,
    stagnation_count: 0,
    last_result: "",
    last_run_date: "",
    stop_requested: false
  });
}

async function writeRun(root: string, name: string, result: string) {
  await writeFile(path.join(root, ".abstraction-tree", "runs", name), `# Agent Run Report\n\n## Result\n\n${result}\n`, "utf8");
}

async function writeChange(root: string, id: string) {
  await writeJson(root, `.abstraction-tree/changes/${id}.json`, {
    id,
    timestamp: "2026-05-04T15:30:00.000Z",
    title: id.startsWith("scan.") ? "Deterministic scan" : "Semantic change",
    reason: "Test change record.",
    affectedNodeIds: [],
    filesChanged: [],
    invariantsPreserved: [],
    risk: "low"
  });
}

async function writeJson(root: string, relativePath: string, value: unknown, options: { bom?: boolean } = {}) {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${options.bom ? "\ufeff" : ""}${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixedNow(): Date {
  return new Date("2026-05-04T15:30:00.000Z");
}

function file(filePath: string, ownedByNodeIds: string[]): FileSummary {
  return {
    path: filePath,
    extension: ".ts",
    language: "TypeScript",
    parseStrategy: "typescript-ast",
    contentHash: "hash",
    sizeBytes: 28,
    lines: 2,
    imports: [],
    exports: ["orphan"],
    symbols: ["orphan"],
    isTest: false,
    summary: `${filePath} summary.`,
    ownedByNodeIds
  };
}

function node(id: string, parent: string | undefined, children: string[]): TreeNode {
  return {
    id,
    name: id,
    title: id,
    abstractionLevel: "component",
    level: "component",
    summary: `${id} summary.`,
    parent,
    parentId: parent,
    children,
    sourceFiles: [],
    ownedFiles: [],
    responsibilities: [],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: { allowedToChange: [], mustNotChange: [] },
    confidence: 0.8
  };
}
