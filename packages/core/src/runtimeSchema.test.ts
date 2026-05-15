import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { AbstractionOntologyLevel, AbstractionTreeState, AgentHealth, ChangeRecord, Concept, ContextPack, FileSummary, ImportGraph, Invariant, TreeNode } from "./schema.js";
import {
  CURRENT_ATREE_SCHEMA_VERSION,
  RuntimeSchemaValidationError,
  formatRuntimeValidationIssue,
  migrateAtreeConfig,
  validateApiStateSchema,
  validateAtreeConfigOverrideSchema,
  validateAtreeConfigSchema,
  validateChangeRecordSchema,
  validateConceptsSchema,
  validateContextPackSchema,
  validateEvaluationReportSchema,
  validateFileSummariesSchema,
  validateImportGraphSchema,
  validateInvariantsSchema,
  validateOntologySchema,
  validateTreeNodesSchema
} from "./runtimeSchema.js";
import { atreePath, defaultConfig, loadAtreeMemory, loadChangeRecords, readChangeRecords, readConfig, writeJson } from "./workspace.js";

test("runtime schema accepts valid v0.1 memory shapes", () => {
  const config = {
    ...defaultConfig(process.cwd()),
    importAliases: [{ find: "@/*", replacement: "src/*" }],
    subsystemPatterns: [{
      id: "subsystem.commands",
      title: "Commands",
      paths: ["src/commands/**"],
      priority: 10,
      weight: 0.2
    }],
    domainVocabulary: [{
      concept: "inventory",
      synonyms: ["sku"],
      weight: 5
    }],
    conceptSignalWeights: {
      path: 2,
      symbol: 4,
      export: 5,
      doc: 1
    }
  };
  const ontology = [ontologyLevel("component", 0)];
  const files = [fileSummary("src/app.ts")];
  const importGraph = importGraphRecord();
  const nodes = [treeNode("root")];
  const concepts = [concept("checkout")];
  const invariants = [invariant("tree-updated")];
  const change = changeRecord("change.1");
  const contextPack = contextPackRecord(nodes, files, concepts, invariants, [change]);
  const evaluation = evaluationReport();
  const legacyEvaluation = evaluationReport({ omitChanges: true });
  const apiState: AbstractionTreeState = {
    config,
    ontology,
    nodes,
    files,
    importGraph,
    concepts,
    invariants,
    changes: [change],
    agentHealth: agentHealthRecord()
  };

  assert.deepEqual(validateAtreeConfigSchema(config), []);
  assert.deepEqual(validateOntologySchema(ontology), []);
  assert.deepEqual(validateFileSummariesSchema(files), []);
  assert.deepEqual(validateImportGraphSchema(importGraph), []);
  assert.deepEqual(validateTreeNodesSchema(nodes), []);
  assert.deepEqual(validateConceptsSchema(concepts), []);
  assert.deepEqual(validateInvariantsSchema(invariants), []);
  assert.deepEqual(validateChangeRecordSchema(change), []);
  assert.deepEqual(validateContextPackSchema(contextPack), []);
  assert.deepEqual(validateEvaluationReportSchema(evaluation), []);
  assert.deepEqual(validateEvaluationReportSchema(legacyEvaluation), []);
  assert.deepEqual(validateApiStateSchema(apiState), []);
  assert.deepEqual(migrateAtreeConfig(config), config);
});

test("api state schema rejects missing app-required top-level fields", () => {
  const issues = validateApiStateSchema({});

  assert.ok(issues.some(issue => issue.fieldPath === "$.config"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.ontology"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.nodes"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.files"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.importGraph"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.concepts"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.invariants"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.changes"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.agentHealth"));
});

test("custom config override schema validates project-specific scanner settings", () => {
  assert.deepEqual(validateAtreeConfigOverrideSchema({
    sourceRoot: "src",
    ignored: ["**/*.generated.ts"],
    subsystemPatterns: [{
      id: "subsystem.api.routes",
      title: "API Routes",
      paths: ["src/routes/**"],
      imports: ["hono"],
      minimumMatches: 1
    }],
    domainVocabulary: [{
      concept: "inventory",
      synonyms: ["sku", "stock unit"],
      weight: 3
    }],
    conceptSignalWeights: {
      symbol: 5
    }
  }), []);

  const issues = validateAtreeConfigOverrideSchema({
    subsystemPatterns: [{
      id: "subsystem.bad",
      title: "Bad"
    }],
    conceptSignalWeights: {
      typo: 4
    }
  });

  assert.ok(issues.some(issue => issue.fieldPath === "$.subsystemPatterns[0]"));
  assert.ok(issues.some(issue => issue.fieldPath === "$.conceptSignalWeights.typo"));
});

test("loadAtreeMemory treats missing memory files as empty valid collections", async t => {
  const root = await workspace(t);
  await mkdir(atreePath(root), { recursive: true });
  await writeJson(atreePath(root, "config.json"), defaultConfig(root));

  const memory = await loadAtreeMemory(root);

  assert.equal(memory.config.version, CURRENT_ATREE_SCHEMA_VERSION);
  assert.deepEqual(memory.files, []);
  assert.deepEqual(memory.importGraph, {
    edges: [],
    externalImports: [],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: []
  });
  assert.deepEqual(memory.nodes, []);
  assert.deepEqual(memory.changes, []);
  assert.deepEqual(memory.contextPacks, []);
  assert.deepEqual(memory.evaluations, []);
  assert.deepEqual(memory.issues, []);
});

test("loadAtreeMemory reports malformed JSON with file, field, severity, and recovery hint", async t => {
  const root = await workspace(t);
  await mkdir(atreePath(root), { recursive: true });
  await writeJson(atreePath(root, "config.json"), defaultConfig(root));
  await writeFile(atreePath(root, "files.json"), "{ bad json\n", "utf8");

  const memory = await loadAtreeMemory(root);
  const issue = memory.issues.find(candidate => candidate.filePath === ".abstraction-tree/files.json");

  assert.ok(issue);
  assert.equal(issue.severity, "error");
  assert.equal(issue.fieldPath, "$");
  assert.match(issue.message, /not valid JSON/);
  assert.match(issue.recoveryHint ?? "", /atree scan/);
  assert.deepEqual(memory.files, []);
});

test("loadAtreeMemory reports malformed memory shape at the failing field path", async t => {
  const root = await workspace(t);
  await mkdir(atreePath(root), { recursive: true });
  await writeJson(atreePath(root, "config.json"), defaultConfig(root));
  await writeJson(atreePath(root, "files.json"), [{ ...fileSummary("src/app.ts"), path: 42 }]);

  const memory = await loadAtreeMemory(root);
  const issue = memory.issues.find(candidate => candidate.fieldPath === "$[0].path");

  assert.ok(issue);
  assert.equal(issue.filePath, ".abstraction-tree/files.json");
  assert.equal(issue.severity, "error");
  assert.match(issue.message, /Expected path/);
  assert.match(issue.recoveryHint ?? "", /atree scan/);
});

test("loadChangeRecords reports malformed JSON while tolerant reads keep valid records", async t => {
  const root = await workspace(t);
  await mkdir(atreePath(root, "changes"), { recursive: true });
  await writeJson(atreePath(root, "changes", "valid.json"), changeRecord("change.valid"));
  await writeFile(atreePath(root, "changes", "bad.json"), "{ bad json\n", "utf8");

  const loaded = await loadChangeRecords(root);
  const issue = loaded.issues.find(candidate => candidate.filePath === ".abstraction-tree/changes/bad.json");
  const records = await readChangeRecords(root);

  assert.deepEqual(loaded.data.map(change => change.id), ["change.valid"]);
  assert.deepEqual(records.map(change => change.id), ["change.valid"]);
  assert.ok(issue);
  assert.equal(issue.severity, "error");
  assert.equal(issue.fieldPath, "$");
  assert.match(issue.message, /not valid JSON/);
  assert.match(issue.recoveryHint ?? "", /valid semantic change record/);
  assert.match(formatRuntimeValidationIssue(issue), /\.abstraction-tree\/changes\/bad\.json/);
  assert.match(formatRuntimeValidationIssue(issue), /Hint: .*valid semantic change record/);
});

test("loadAtreeMemory reports non-object change JSON with recovery guidance", async t => {
  const root = await workspace(t);
  await mkdir(atreePath(root, "changes"), { recursive: true });
  await writeJson(atreePath(root, "config.json"), defaultConfig(root));
  await writeJson(atreePath(root, "changes", "array.json"), []);

  const memory = await loadAtreeMemory(root);
  const issue = memory.issues.find(candidate => candidate.filePath === ".abstraction-tree/changes/array.json");

  assert.deepEqual(memory.changes, []);
  assert.ok(issue);
  assert.equal(issue.severity, "error");
  assert.equal(issue.fieldPath, "$");
  assert.match(issue.message, /Change record must be a JSON object/);
  assert.match(issue.recoveryHint ?? "", /valid semantic change record/);
});

test("loadAtreeMemory reports malformed change record shapes with file paths and hints", async t => {
  const root = await workspace(t);
  await mkdir(atreePath(root, "changes"), { recursive: true });
  await writeJson(atreePath(root, "config.json"), defaultConfig(root));
  await writeJson(atreePath(root, "changes", "malformed.json"), {
    ...changeRecord("change.malformed"),
    timestamp: "not-a-date",
    filesChanged: ["src/app.ts", 7],
    risk: "critical"
  });

  const memory = await loadAtreeMemory(root);

  assert.deepEqual(memory.changes, []);
  assert.ok(memory.issues.some(issue =>
    issue.filePath === ".abstraction-tree/changes/malformed.json" &&
    issue.fieldPath === "$.timestamp" &&
    /valid timestamp/.test(issue.message) &&
    /valid semantic change record/.test(issue.recoveryHint ?? "")
  ));
  assert.ok(memory.issues.some(issue =>
    issue.filePath === ".abstraction-tree/changes/malformed.json" &&
    issue.fieldPath === "$.filesChanged[1]" &&
    /Expected filesChanged\[1\] to be a string/.test(issue.message) &&
    /valid semantic change record/.test(issue.recoveryHint ?? "")
  ));
  assert.ok(memory.issues.some(issue =>
    issue.filePath === ".abstraction-tree/changes/malformed.json" &&
    issue.fieldPath === "$.risk" &&
    /low, medium, high/.test(issue.message) &&
    /valid semantic change record/.test(issue.recoveryHint ?? "")
  ));
});

test("future config schema versions stop loading with migration guidance", async t => {
  const root = await workspace(t);
  await mkdir(atreePath(root), { recursive: true });
  await writeJson(atreePath(root, "config.json"), {
    ...defaultConfig(root),
    version: "0.2.0"
  });

  const memory = await loadAtreeMemory(root);
  const issue = memory.issues.find(candidate => candidate.fieldPath === "$.version");

  assert.ok(issue);
  assert.equal(issue.filePath, ".abstraction-tree/config.json");
  assert.match(issue.message, /future schema version 0\.2\.0/);
  assert.match(issue.recoveryHint ?? "", /migrate/);
  await assert.rejects(() => readConfig(root), RuntimeSchemaValidationError);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-runtime-schema-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function ontologyLevel(id: string, rank: number): AbstractionOntologyLevel {
  return {
    id,
    name: id,
    description: `${id} layer.`,
    rank,
    signals: [],
    confidence: 0.8
  };
}

function fileSummary(filePath: string): FileSummary {
  return {
    path: filePath,
    extension: ".ts",
    language: "TypeScript",
    parseStrategy: "typescript-ast",
    contentHash: "abc123",
    sizeBytes: 20,
    lines: 2,
    imports: [],
    exports: ["run"],
    symbols: ["run"],
    isTest: false,
    summary: `${filePath} summary.`,
    ownedByNodeIds: ["root"]
  };
}

function importGraphRecord(): ImportGraph {
  return {
    edges: [{
      from: "src/app.ts",
      to: "src/run.ts",
      specifier: "./run.js",
      kind: "relative"
    }, {
      from: "src/app.ts",
      to: "src/components/Button.ts",
      specifier: "@/components/Button",
      kind: "alias",
      aliasSource: "typescript:tsconfig.json"
    }],
    externalImports: [{
      from: "src/app.ts",
      specifier: "react",
      packageName: "react"
    }],
    unresolvedImports: [{
      from: "src/app.ts",
      specifier: "./missing.js",
      kind: "relative",
      reason: "Relative import could not be resolved."
    }, {
      from: "src/app.ts",
      specifier: "@/missing",
      kind: "alias",
      aliasSource: "typescript:tsconfig.json",
      reason: "Alias matched, but the target file was not scanned."
    }],
    cycles: [{
      files: ["src/app.ts", "src/run.ts"]
    }],
    workspacePackages: [{
      name: "@scope/app",
      root: "packages/app",
      manifestPath: "packages/app/package.json",
      entrypoint: "packages/app/src/index.ts"
    }]
  };
}

function treeNode(id: string): TreeNode {
  return {
    id,
    name: id,
    title: id,
    abstractionLevel: "component",
    level: "component",
    summary: `${id} summary.`,
    children: [],
    sourceFiles: ["src/app.ts"],
    ownedFiles: ["src/app.ts"],
    responsibilities: [],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: ["tree-updated"],
    changePolicy: { allowedToChange: ["src/app.ts"], mustNotChange: [] },
    confidence: 0.8
  };
}

function concept(id: string): Concept {
  return {
    id,
    title: id,
    summary: `${id} summary.`,
    relatedNodeIds: ["root"],
    relatedFiles: ["src/app.ts"],
    tags: [id],
    evidence: [{
      kind: "export",
      filePath: "src/app.ts",
      value: "run",
      term: id,
      score: 4
    }]
  };
}

function invariant(id: string): Invariant {
  return {
    id,
    title: id,
    description: `${id} description.`,
    nodeIds: ["root"],
    filePaths: ["src/app.ts"],
    severity: "medium"
  };
}

function changeRecord(id: string): ChangeRecord {
  return {
    id,
    timestamp: "2026-05-07T00:00:00.000Z",
    title: id,
    reason: `${id} reason.`,
    affectedNodeIds: ["root"],
    filesChanged: ["src/app.ts"],
    invariantsPreserved: ["tree-updated"],
    risk: "low"
  };
}

function contextPackRecord(
  nodes: TreeNode[],
  files: FileSummary[],
  concepts: Concept[],
  invariants: Invariant[],
  changes: ChangeRecord[]
): ContextPack {
  return {
    id: "context.1",
    createdAt: "2026-05-07T00:00:00.000Z",
    target: "checkout",
    projectSummary: "Project summary.",
    relevantNodes: nodes,
    relevantFiles: files,
    relevantConcepts: concepts,
    invariants,
    recentChanges: changes,
    agentInstructions: ["Preserve invariants."]
  };
}

function agentHealthRecord(): AgentHealth {
  return {
    latestRun: {
      file: ".abstraction-tree/runs/2026-05-08-0100-agent-run.md",
      timestamp: "2026-05-08 01:00",
      task: "Validate API state",
      result: "success"
    },
    latestEvaluation: {
      file: ".abstraction-tree/evaluations/2026-05-08-0105-evaluation.json",
      timestamp: "2026-05-08T01:05:00.000Z",
      issueCount: 0,
      staleFileCount: 0,
      missingFileCount: 0
    },
    validation: {
      issueCount: 0,
      errorCount: 0,
      warningCount: 0
    },
    automation: {
      loopsToday: 1,
      maxLoopsToday: 3,
      failedLoopsToday: 0,
      maxFailedLoops: 1,
      maxMinutesToday: 30,
      maxDiffLines: 500,
      stopRequested: false,
      currentMission: "mission-017",
      completedMissions: 16,
      failedMissions: 0
    }
  };
}

function evaluationReport(options: { omitChanges?: boolean } = {}): Record<string, unknown> {
  return {
    timestamp: "2026-05-07T00:00:00.000Z",
    tree: {
      nodeCount: 1,
      orphanNodeCount: 0,
      nodesWithoutSummaries: 0,
      filesWithoutOwners: 0
    },
    context: {
      lastPackCount: 1,
      averageFilesPerPack: 1,
      averageConceptsPerPack: 1,
      possibleOverBroadPacks: 0
    },
    drift: {
      staleFileCount: 0,
      missingFileCount: 0
    },
    runs: {
      runReportCount: 0,
      successCount: 0,
      partialCount: 0,
      failedCount: 0,
      noOpCount: 0
    },
    ...(options.omitChanges ? {} : {
      changes: {
        totalChangeRecordCount: 0,
        generatedScanRecordCount: 0,
        semanticChangeRecordCount: 0,
        generatedScanReviewNeeded: false
      }
    }),
    lessons: {
      lessonCount: 0,
      duplicateLessonCandidates: 0
    },
    automation: {
      runtimeStateIgnored: true,
      configValid: true
    },
    issues: []
  };
}
