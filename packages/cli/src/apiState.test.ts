import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  atreePath,
  ensureWorkspace,
  validateApiStateSchema,
  writeJson,
  type AbstractionOntologyLevel,
  type AbstractionTreeState,
  type AgentHealth,
  type ChangeRecord,
  type Concept,
  type FileSummary,
  type ImportGraph,
  type Invariant,
  type TreeNode
} from "@abstraction-tree/core";
import { loadApiAgentHealth, loadApiState, type ApiState } from "./apiState.js";

type ExactApiStateContract = [ApiState] extends [AbstractionTreeState]
  ? [AbstractionTreeState] extends [ApiState]
    ? true
    : never
  : never;

const apiStateMatchesSharedState: ExactApiStateContract = true;

test("/api/state loader returns fixture memory using the shared core state contract", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { installMode: "full", projectName: "Contract Project" });
  await writeFixtureMemory(root);

  const agentHealth: AgentHealth = {
    latestRun: {
      file: ".abstraction-tree/runs/2026-05-08-0100-agent-run.md",
      timestamp: "2026-05-08 01:00",
      task: "Mission 017",
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

  const state = await loadApiState(root, async () => agentHealth);
  const sharedState: AbstractionTreeState = state;

  assert.equal(apiStateMatchesSharedState, true);
  assert.deepEqual(validateApiStateSchema(state), []);
  assert.equal(sharedState.config.projectName, "Contract Project");
  assert.equal(sharedState.config.visualApp.enabled, true);
  assert.deepEqual(sharedState.ontology.map(level => level.id), ["intent", "feature"]);
  assert.deepEqual(sharedState.nodes.map(node => node.id), ["project.intent", "feature.api-state"]);
  assert.deepEqual(sharedState.files.map(file => file.path), ["packages/cli/src/apiState.ts"]);
  assert.deepEqual(sharedState.importGraph.edges.map(edge => edge.to), ["packages/core/src/index.ts"]);
  assert.deepEqual(sharedState.concepts.map(concept => concept.id), ["api-state-contract"]);
  assert.deepEqual(sharedState.invariants.map(invariant => invariant.id), ["state-shape-documented"]);
  assert.deepEqual(sharedState.changes.map(change => change.id), ["mission-017.fixture"]);
  assert.equal(sharedState.agentHealth.automation?.currentMission, "mission-017");
});

test("/api/state supplies stable defaults when optional health files are missing", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { installMode: "full", projectName: "Empty Contract Project" });

  const health = await loadApiAgentHealth(root, async () => []);
  const state = await loadApiState(root, projectRoot => loadApiAgentHealth(projectRoot, async () => []));

  assert.equal(health.latestRun, undefined);
  assert.equal(health.latestEvaluation, undefined);
  assert.equal(health.automation, undefined);
  assert.deepEqual(health.validation, {
    issueCount: 0,
    errorCount: 0,
    warningCount: 0
  });
  assert.deepEqual(state.nodes, []);
  assert.deepEqual(state.files, []);
  assert.deepEqual(state.importGraph, {
    edges: [],
    externalImports: [],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: []
  });
  assert.deepEqual(state.concepts, []);
  assert.deepEqual(state.invariants, []);
  assert.deepEqual(state.changes, []);
  assert.deepEqual(validateApiStateSchema(state), []);
});

test("/api/state agent health surfaces the latest scope contract status", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { installMode: "full", projectName: "Scope Health Project" });
  await writeJson(atreePath(root, "scopes", "2026-05-13-1200-scope.json"), {
    id: "2026-05-13-1200-scope",
    createdAt: "2026-05-13T12:00:00.000Z",
    prompt: "make the tree UI collapsible",
    intent: "make the tree UI collapsible.",
    status: "ready",
    affectedNodeIds: ["architecture.visual.app"],
    allowedFiles: ["packages/app/src/components/TreeList.tsx"],
    allowedAreas: ["app"],
    forbiddenAreas: ["core"],
    ambiguities: [],
    requiresClarification: false,
    maxFilesChanged: 3,
    maxDiffLines: 600,
    allowGeneratedMemory: true,
    requiredChecks: ["npm.cmd test"],
    rationale: ["Test fixture."]
  });
  await writeJson(atreePath(root, "scopes", "2026-05-13-1200-scope-check.json"), {
    id: "2026-05-13-1200-scope-check",
    checkedAt: "2026-05-13T12:10:00.000Z",
    contractId: "2026-05-13-1200-scope",
    status: "clean",
    prompt: "make the tree UI collapsible",
    changedFiles: ["packages/app/src/components/TreeList.tsx"],
    affectedNodeIds: ["architecture.visual.app"],
    allowedFiles: ["packages/app/src/components/TreeList.tsx"],
    violations: [],
    diffSummary: {
      changedFileCount: 1,
      addedLines: 1,
      deletedLines: 0,
      changedLines: 1,
      changedSourceFiles: 1,
      changedTestFiles: 0,
      changedDocsFiles: 0,
      changedMemoryFiles: 0,
      changedGeneratedMemoryFiles: 0,
      changedAutomationFiles: 0,
      changedPackageFiles: 0,
      changedCiFiles: 0,
      changedAppFiles: 1,
      changedAreas: ["app", "source"],
      dangerousFileChanges: [],
      overreach: [],
      thresholds: {
        maxDiffLines: 600,
        maxFiles: 3,
        broadAreaCount: 4
      },
      files: []
    }
  });

  const health = await loadApiAgentHealth(root, async () => []);

  assert.equal(health.scope?.status, "clean");
  assert.equal(health.scope?.violationCount, 0);
  assert.equal(health.scope?.allowedFileCount, 1);
  assert.deepEqual(validateApiStateSchema({
    ...(await loadApiState(root, async () => health)),
    agentHealth: health
  }), []);
});

test("/api/state contract rejects missing app-required top-level fields", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { installMode: "full", projectName: "Contract Project" });
  await writeFixtureMemory(root);

  const state = await loadApiState(root, async () => ({ validation: { issueCount: 0, errorCount: 0, warningCount: 0 } }));
  const requiredFields = [
    "config",
    "ontology",
    "nodes",
    "files",
    "importGraph",
    "concepts",
    "invariants",
    "changes",
    "agentHealth"
  ];

  for (const field of requiredFields) {
    const candidate = { ...state } as Record<string, unknown>;
    delete candidate[field];

    const issues = validateApiStateSchema(candidate);

    assert.ok(
      issues.some(issue => issue.fieldPath === `$.${field}`),
      `expected an API state contract issue for missing ${field}`
    );
  }
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-api-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFixtureMemory(root: string): Promise<void> {
  await writeJson(atreePath(root, "ontology.json"), fixtureOntology());
  await writeJson(atreePath(root, "tree.json"), fixtureNodes());
  await writeJson(atreePath(root, "files.json"), fixtureFiles());
  await writeJson(atreePath(root, "import-graph.json"), fixtureImportGraph());
  await writeJson(atreePath(root, "concepts.json"), fixtureConcepts());
  await writeJson(atreePath(root, "invariants.json"), fixtureInvariants());
  await writeJson(atreePath(root, "changes", "mission-017.fixture.json"), fixtureChange());
}

function fixtureOntology(): AbstractionOntologyLevel[] {
  return [
    {
      id: "intent",
      name: "Intent",
      description: "Project-level intent.",
      rank: 0,
      signals: ["README.md"],
      confidence: 0.9
    },
    {
      id: "feature",
      name: "Feature",
      description: "User-visible or developer-visible feature.",
      rank: 1,
      signals: ["src"],
      confidence: 0.8
    }
  ];
}

function fixtureNodes(): TreeNode[] {
  return [
    {
      id: "project.intent",
      name: "Project intent",
      title: "Project intent",
      abstractionLevel: "intent",
      level: "intent",
      summary: "Abstraction Tree maps repository structure for development agents.",
      children: ["feature.api-state"],
      sourceFiles: [],
      ownedFiles: [],
      responsibilities: ["Keep API state understandable."],
      dependencies: [],
      dependsOn: [],
      changeLog: ["mission-017.fixture"],
      invariants: ["state-shape-documented"],
      changePolicy: {
        allowedToChange: ["docs/DATA_MODEL.md"],
        mustNotChange: []
      },
      confidence: 0.9
    },
    {
      id: "feature.api-state",
      name: "API state contract",
      title: "API state contract",
      abstractionLevel: "feature",
      level: "feature",
      parent: "project.intent",
      parentId: "project.intent",
      summary: "The CLI serves a documented state payload to the visual app.",
      children: [],
      sourceFiles: ["packages/cli/src/apiState.ts"],
      ownedFiles: ["packages/cli/src/apiState.ts"],
      responsibilities: ["Load project memory for /api/state."],
      dependencies: ["project.intent"],
      dependsOn: ["project.intent"],
      changeLog: ["mission-017.fixture"],
      invariants: ["state-shape-documented"],
      changePolicy: {
        allowedToChange: ["packages/cli/src/apiState.ts", "packages/cli/src/apiState.test.ts"],
        mustNotChange: []
      },
      confidence: 0.86
    }
  ];
}

function fixtureFiles(): FileSummary[] {
  return [{
    path: "packages/cli/src/apiState.ts",
    extension: ".ts",
    language: "TypeScript",
    parseStrategy: "typescript-ast",
    contentHash: "fixture-api-state",
    sizeBytes: 1200,
    lines: 80,
    imports: ["@abstraction-tree/core"],
    exports: ["loadApiState"],
    symbols: ["loadApiState", "loadApiAgentHealth"],
    isTest: false,
    summary: "Loads state for the local visual app API.",
    ownedByNodeIds: ["feature.api-state"]
  }];
}

function fixtureImportGraph(): ImportGraph {
  return {
    edges: [{
      from: "packages/cli/src/apiState.ts",
      to: "packages/core/src/index.ts",
      specifier: "@abstraction-tree/core",
      kind: "workspace-package",
      packageName: "@abstraction-tree/core"
    }],
    externalImports: [],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: [{
      name: "@abstraction-tree/cli",
      root: "packages/cli",
      manifestPath: "packages/cli/package.json",
      entrypoint: "packages/cli/src/index.ts",
      binCommands: ["atree", "abstraction-tree"],
      scriptNames: ["build", "typecheck"],
      dependencyPackageNames: ["@abstraction-tree/core"]
    }]
  };
}

function fixtureConcepts(): Concept[] {
  return [{
    id: "api-state-contract",
    title: "API state contract",
    summary: "The CLI and app share the same runtime state shape.",
    relatedNodeIds: ["feature.api-state"],
    relatedFiles: ["packages/cli/src/apiState.ts"],
    tags: ["api", "contract"],
    evidence: [{
      kind: "export",
      filePath: "packages/cli/src/apiState.ts",
      value: "loadApiState",
      term: "state contract",
      score: 5
    }]
  }];
}

function fixtureInvariants(): Invariant[] {
  return [{
    id: "state-shape-documented",
    title: "State shape documented",
    description: "The app-facing state payload remains documented and contract-tested.",
    nodeIds: ["feature.api-state"],
    filePaths: ["packages/cli/src/apiState.ts"],
    severity: "medium"
  }];
}

function fixtureChange(): ChangeRecord {
  return {
    id: "mission-017.fixture",
    timestamp: "2026-05-08T00:00:00.000Z",
    title: "Fixture API state memory",
    reason: "Exercise /api/state contract tests with populated .abstraction-tree memory.",
    affectedNodeIds: ["feature.api-state"],
    filesChanged: ["packages/cli/src/apiState.ts"],
    invariantsPreserved: ["state-shape-documented"],
    risk: "low"
  };
}
