import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { CONTEXT_OVER_BROAD_LIMITS, CONTEXT_PACK_LIMITS } from "./contextLimits.js";
import { evaluateProject } from "./evaluator.js";
import type { ChangeRecord, Concept, ContextPack, FileSummary, ImportGraph, TreeNode } from "./schema.js";

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

test("evaluateProject reports explanation completeness metrics", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/tree.json", [
    { ...node("root", undefined, ["feature"]), explanation: "This explanation is long enough to describe the node role, ownership, relationships, constraints, and safe change guidance for developers and agents. It also names why the node exists and how to use it before making edits." },
    { ...node("feature", "root", []), explanation: "Thin explanation." },
    node("legacy", "root", [])
  ]);

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.tree.nodesWithoutExplanations, 1);
  assert.equal(report.tree.thinExplanationCount, 1);
  assert.ok(report.tree.averageExplanationLength > 0);
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

test("evaluateProject reports generated scan buildup with one retained scan", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  for (let index = 0; index < 12; index += 1) {
    await writeChange(root, `scan.${String(index).padStart(2, "0")}`, `2026-05-04T10:${String(index).padStart(2, "0")}:00.000Z`);
  }

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.deepEqual(report.changes, {
    totalChangeRecordCount: 12,
    generatedScanRecordCount: 12,
    semanticChangeRecordCount: 0,
    eligibleGeneratedScanRecordCount: 11,
    retainedGeneratedScanRecordId: "scan.11",
    changeReviewIssueCount: 0,
    generatedScanReviewNeeded: true
  });
  assert.ok(report.issues.some(issue =>
    issue.area === "changes" &&
    issue.filePath === ".abstraction-tree/changes" &&
    issue.message.includes("11 older generated scan records are eligible for consolidation") &&
    issue.message.includes("retaining latest generated scan scan.11") &&
    issue.message.includes("Change review reported 0 issues")
  ));
});

test("evaluateProject keeps semantic records separate from generated scan eligibility", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  for (let index = 0; index < 12; index += 1) {
    await writeChange(root, `scan.${String(index).padStart(2, "0")}`, `2026-05-04T10:${String(index).padStart(2, "0")}:00.000Z`);
  }
  for (let index = 0; index < 20; index += 1) {
    await writeChange(root, `semantic.${String(index).padStart(2, "0")}`, `2026-05-04T11:${String(index).padStart(2, "0")}:00.000Z`);
  }

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.deepEqual(report.changes, {
    totalChangeRecordCount: 32,
    generatedScanRecordCount: 12,
    semanticChangeRecordCount: 20,
    eligibleGeneratedScanRecordCount: 11,
    retainedGeneratedScanRecordId: "scan.11",
    changeReviewIssueCount: 0,
    generatedScanReviewNeeded: true
  });
  assert.ok(report.issues.some(issue =>
    issue.area === "changes" &&
    issue.message.includes("11 older generated scan records are eligible for consolidation")
  ));
});

test("evaluateProject does not warn when generated scan count is below threshold", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  for (let index = 0; index < 10; index += 1) {
    await writeChange(root, `scan.${String(index).padStart(2, "0")}`, `2026-05-04T10:${String(index).padStart(2, "0")}:00.000Z`);
  }

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.deepEqual(report.changes, {
    totalChangeRecordCount: 10,
    generatedScanRecordCount: 10,
    semanticChangeRecordCount: 0,
    eligibleGeneratedScanRecordCount: 9,
    retainedGeneratedScanRecordId: "scan.09",
    changeReviewIssueCount: 0,
    generatedScanReviewNeeded: false
  });
  assert.ok(!report.issues.some(issue =>
    issue.area === "changes" &&
    issue.filePath === ".abstraction-tree/changes" &&
    issue.message.includes("older generated scan records are eligible for consolidation")
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
  await writeJson(root, ".abstraction-tree/context-packs/narrow.json", contextPack("narrow", {
    relevantNodes: Array.from({ length: CONTEXT_PACK_LIMITS.nodes }, (_, index) => node(`node.${index}`, undefined, [])),
    relevantFiles: Array.from({ length: CONTEXT_PACK_LIMITS.files }, (_, index) => file(`src/file-${index}.ts`, [])),
    relevantConcepts: Array.from({ length: CONTEXT_PACK_LIMITS.concepts }, (_, index) => concept(`concept.${index}`))
  }));
  await writeJson(root, ".abstraction-tree/context-packs/broad.json", contextPack("broad", {
    relevantNodes: Array.from({ length: CONTEXT_OVER_BROAD_LIMITS.nodes }, (_, index) => node(`node.${index}`, undefined, []))
  }));

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.context.possibleOverBroadPacks, 1);
});

test("evaluateProject accepts BOM-prefixed metadata JSON", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/tree.json", [node("root", undefined, [])], { bom: true });
  await writeJson(root, ".abstraction-tree/context-packs/root.json", contextPack("root", {
    relevantNodes: [node("root", undefined, [])]
  }), { bom: true });

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.tree.nodeCount, 1);
  assert.equal(report.context.lastPackCount, 1);
  assert.ok(!report.issues.some(issue => issue.message.includes("not valid JSON")));
});

test("evaluateProject reports generated-memory quality regressions", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "checkout.ts"), "import { missing } from './missing';\nexport const checkout = missing;\n", "utf8");
  await writeJson(root, ".abstraction-tree/files.json", [file("src/checkout.ts", ["file.src.checkout.ts"])]);
  await writeJson(root, ".abstraction-tree/tree.json", [node("file.src.checkout.ts", undefined, [])]);
  await writeJson(root, ".abstraction-tree/concepts.json", [noisyConcept("service")]);
  await writeJson(root, ".abstraction-tree/import-graph.json", importGraphWithUnresolvedImport());
  await writeJson(root, ".abstraction-tree/evaluation-fixture.json", {
    expectedConceptIds: ["checkout"],
    expectedContextPacks: [{
      target: "checkout",
      expectedFilePaths: ["src/checkout.ts"]
    }]
  });

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.quality.concepts.noisyConceptCount, 1);
  assert.deepEqual(report.quality.fixture.missingExpectedConceptIds, ["checkout"]);
  assert.equal(report.quality.imports.unresolvedImportCount, 1);
  assert.equal(report.quality.architecture.architectureCoveragePercent, 0);
  assert.equal(report.quality.context.missingExpectedInclusionCount, 1);
  assert.ok(report.issues.some(issue => issue.area === "quality" && issue.message.includes("missing expected concepts")));
  assert.ok(report.issues.some(issue => issue.area === "quality" && issue.message.includes("noisy concept")));
  assert.ok(report.issues.some(issue => issue.area === "quality" && issue.message.includes("unresolved import")));
});

test("evaluateProject warns when expected context pack exceeds fixture ceilings", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/context-packs/checkout.json", contextPack("checkout", {
    relevantNodes: [node("node.checkout", undefined, []), node("node.extra", undefined, [])],
    relevantFiles: [file("src/checkout.ts", []), file("src/extra.ts", [])],
    relevantConcepts: [concept("checkout"), concept("extra")],
    recentChanges: [changeRecord("change.one"), changeRecord("change.two")]
  }));
  await writeJson(root, ".abstraction-tree/evaluation-fixture.json", {
    expectedContextPacks: [{
      target: "checkout",
      expectedFilePaths: ["src/checkout.ts"],
      maxRelevantNodes: 1,
      maxRelevantFiles: 1,
      maxRelevantConcepts: 1,
      maxRecentChanges: 1,
      maxEstimatedTokens: 1
    }]
  });

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.quality.context.missingExpectedInclusionCount, 0);
  assert.deepEqual(report.quality.context.missingExpectedInclusions, []);
  assert.equal(report.quality.context.expectedContextPackCeilingViolationCount, 5);
  assert.equal(report.quality.context.passingExpectedContextPackCount, 0);
  const ceilingViolations = report.quality.context.expectedContextPackCeilingViolations.join("; ");
  assert.ok(ceilingViolations.includes("maxRelevantNodes (2 > 1)"));
  assert.ok(ceilingViolations.includes("maxRelevantFiles (2 > 1)"));
  assert.ok(ceilingViolations.includes("maxRelevantConcepts (2 > 1)"));
  assert.ok(ceilingViolations.includes("maxRecentChanges (2 > 1)"));
  assert.ok(ceilingViolations.includes("maxEstimatedTokens"));
  assert.ok(report.issues.some(issue =>
    issue.severity === "warning" &&
    issue.area === "quality" &&
    issue.message.includes("Generated context packs exceed fixture ceilings") &&
    issue.message.includes("maxRelevantFiles")
  ));
  assert.ok(!report.issues.some(issue =>
    issue.area === "quality" &&
    issue.message.includes("Generated context packs are missing expected inclusions")
  ));
});

test("evaluateProject validates context-pack fixture ceilings", async t => {
  const root = await workspace(t);
  await writeValidAutomationFiles(root);
  await writeJson(root, ".abstraction-tree/context-packs/checkout.json", contextPack("checkout", {}));
  await writeJson(root, ".abstraction-tree/evaluation-fixture.json", {
    expectedContextPacks: [{
      target: "checkout",
      maxRelevantNodes: 0,
      maxRelevantFiles: 1.5,
      maxRelevantConcepts: "2",
      maxRecentChanges: null,
      maxEstimatedTokens: -1
    }]
  });

  const report = await evaluateProject(root, { now: fixedNow() });

  assert.equal(report.quality.context.expectedContextPackCeilingViolationCount, 0);
  assert.equal(report.quality.context.passingExpectedContextPackCount, 1);
  for (const field of ["maxRelevantNodes", "maxRelevantFiles", "maxRelevantConcepts", "maxRecentChanges", "maxEstimatedTokens"]) {
    assert.ok(report.issues.some(issue =>
      issue.severity === "warning" &&
      issue.area === "quality" &&
      issue.filePath === ".abstraction-tree/evaluation-fixture.json" &&
      issue.message.includes(`expectedContextPacks[0].${field} must be a positive integer`)
    ));
  }
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

async function writeChange(root: string, id: string, timestamp = "2026-05-04T15:30:00.000Z") {
  await writeJson(root, `.abstraction-tree/changes/${id}.json`, changeRecord(id, timestamp));
}

function changeRecord(id: string, timestamp = "2026-05-04T15:30:00.000Z"): ChangeRecord {
  return {
    id,
    timestamp,
    title: id.startsWith("scan.") ? "Deterministic scan" : "Semantic change",
    reason: "Test change record.",
    affectedNodeIds: [],
    filesChanged: [],
    invariantsPreserved: [],
    risk: "low"
  };
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

function concept(id: string): Concept {
  return {
    id,
    title: id,
    summary: `${id} summary.`,
    relatedNodeIds: [],
    relatedFiles: [],
    tags: [id],
    evidence: [{
      kind: "symbol",
      filePath: "src/app.ts",
      value: id,
      term: id,
      score: 3
    }]
  };
}

function noisyConcept(id: string): Concept {
  return {
    id,
    title: id,
    summary: `${id} summary.`,
    relatedNodeIds: [],
    relatedFiles: [],
    tags: [id],
    evidence: []
  };
}

function importGraphWithUnresolvedImport(): ImportGraph {
  return {
    edges: [],
    externalImports: [],
    unresolvedImports: [{
      from: "src/checkout.ts",
      specifier: "./missing",
      kind: "relative",
      reason: "Relative import could not be resolved to a scanned repository file."
    }],
    cycles: [],
    workspacePackages: []
  };
}

function contextPack(
  id: string,
  overrides: Partial<Pick<ContextPack, "relevantNodes" | "relevantFiles" | "relevantConcepts" | "recentChanges">>
): ContextPack {
  return {
    id: `context.${id}`,
    createdAt: "2026-05-04T15:30:00.000Z",
    target: id,
    projectSummary: "Project summary.",
    relevantNodes: overrides.relevantNodes ?? [],
    relevantFiles: overrides.relevantFiles ?? [],
    relevantConcepts: overrides.relevantConcepts ?? [],
    invariants: [],
    recentChanges: overrides.recentChanges ?? [],
    agentInstructions: ["Use relevant memory."]
  };
}
