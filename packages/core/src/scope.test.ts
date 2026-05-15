import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScopeContract,
  checkScope,
  formatScopeCheckMarkdown,
  formatScopeContractMarkdown
} from "./scope.js";
import { routePrompt } from "./promptRouter.js";
import type { Concept, FileSummary, TreeNode } from "./schema.js";

test("buildScopeContract maps ambiguous tree UI prompts to app tree files", () => {
  const contract = buildScopeContract({
    prompt: "the tree ui should have a dropdown option for ease of use",
    nodes: fixtureNodes(),
    files: fixtureFiles(),
    createdAt: new Date("2026-05-13T12:00:00.000Z")
  });

  assert.match(contract.id, /^2026-05-13-\d{4}-scope$/);
  assert.equal(contract.status, "needs-clarification");
  assert.equal(contract.requiresClarification, true);
  assert.ok(contract.ambiguities.some(ambiguity => ambiguity.includes("select menu or collapsible disclosure")));
  assert.ok(contract.affectedNodeIds.includes("architecture.visual.app"));
  assert.ok(contract.allowedFiles.includes("packages/app/src/components/TreeList.tsx"));
  assert.ok(contract.allowedFiles.includes("packages/app/src/styles.css"));
  assert.ok(contract.allowedFiles.includes("packages/app/src/app.test.tsx"));
  assert.match(formatScopeContractMarkdown(contract), /Scope Contract/);
});

test("checkScope blocks files outside the contract while allowing generated memory refreshes", () => {
  const contract = buildScopeContract({
    prompt: "make the tree UI collapsible",
    nodes: fixtureNodes(),
    files: fixtureFiles(),
    createdAt: new Date("2026-05-13T12:00:00.000Z")
  });

  const report = checkScope({
    contract,
    changes: [
      { path: "packages/app/src/components/TreeList.tsx", addedLines: 20, deletedLines: 4 },
      { path: ".abstraction-tree/tree.json", addedLines: 5, deletedLines: 2 },
      { path: "packages/core/src/scanner.ts", addedLines: 10, deletedLines: 1 }
    ]
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.violations.some(violation => violation.kind === "file-out-of-scope" && violation.filePath === "packages/core/src/scanner.ts"));
  assert.ok(!report.violations.some(violation => violation.filePath === ".abstraction-tree/tree.json"));
  assert.match(formatScopeCheckMarkdown(report), /packages\/core\/src\/scanner\.ts changed outside/);
});

test("checkScope reports clean when changed files stay inside the contract", () => {
  const contract = buildScopeContract({
    prompt: "make the tree UI collapsible",
    nodes: fixtureNodes(),
    files: fixtureFiles(),
    createdAt: new Date("2026-05-13T12:00:00.000Z")
  });

  const report = checkScope({
    contract: {
      ...contract,
      requiresClarification: false,
      status: "ready",
      ambiguities: []
    },
    changes: [
      { path: "packages/app/src/components/TreeList.tsx", addedLines: 20, deletedLines: 4 },
      { path: "packages/app/src/app.test.tsx", addedLines: 8, deletedLines: 1 }
    ]
  });

  assert.equal(report.status, "clean");
  assert.deepEqual(report.violations, []);
});

test("buildScopeContract includes route-estimated files in allowed scope", () => {
  const files = [
    file("backend/middleware/authMiddleware.js", "Authentication middleware protects routes."),
    file("backend/routes/goalRoutes.js", "Goal routes use protected middleware."),
    file("frontend/src/features/goals/goalSlice.js", "Goals dashboard state."),
    file("frontend/src/pages/Dashboard.jsx", "Dashboard goal UI.")
  ];
  const nodes = [
    node("architecture.local.api.routes", "Local API routes", "architecture", "Authentication middleware protected goals routes.", [
      "backend/middleware/authMiddleware.js",
      "backend/routes/goalRoutes.js"
    ]),
    node("architecture.visual.app.ui", "Visual app UI", "architecture", "Frontend goals dashboard flow.", [
      "frontend/src/features/goals/goalSlice.js",
      "frontend/src/pages/Dashboard.jsx"
    ])
  ];
  const prompt = "Implement authentication middleware protected routes across frontend backend goals dashboard flow";
  const route = routePrompt({ prompt, nodes, files, concepts: [], invariants: [] });
  const contract = buildScopeContract({ prompt, nodes, files, concepts: [] });

  for (const filePath of route.estimatedFiles) {
    assert.ok(contract.allowedFiles.includes(filePath), `scope missing route file ${filePath}`);
  }
  assert.ok(contract.rationale.some(reason => reason.includes("Route evidence contributed")));
});

test("buildScopeContract grounds scope files with concept, import, and nearby test evidence", () => {
  const contract = buildScopeContract({
    prompt: "Improve scope contract overreach reporting",
    nodes: [
      node("architecture.core.engine", "Core engine", "architecture", "Scope contract engine.", [
        "packages/core/src/scope.ts"
      ])
    ],
    files: [
      file("packages/core/src/scope.ts", "Builds and checks scope contracts.", ["./diffSummary.js"]),
      file("packages/core/src/diffSummary.ts", "Reports overreach categories."),
      file("packages/core/src/scope.test.ts", "Scope contract tests.", ["./scope.js"]),
      file("packages/cli/src/scopeCommand.ts", "CLI command for scope contracts."),
      file("docs/SCOPE_CONTRACTS.md", "Scope contract documentation.")
    ],
    concepts: [
      concept("scope", [
        "packages/core/src/scope.ts",
        "packages/core/src/diffSummary.ts",
        "packages/core/src/scope.test.ts",
        "packages/cli/src/scopeCommand.ts",
        "docs/SCOPE_CONTRACTS.md"
      ])
    ]
  });

  assert.ok(contract.allowedFiles.includes("packages/core/src/scope.ts"));
  assert.ok(contract.allowedFiles.includes("packages/core/src/diffSummary.ts"));
  assert.ok(contract.allowedFiles.includes("packages/core/src/scope.test.ts"));
  assert.ok(contract.allowedFiles.includes("packages/cli/src/scopeCommand.ts"));
  assert.ok(contract.allowedFiles.includes("docs/SCOPE_CONTRACTS.md"));
  assert.ok(contract.rationale.some(reason => reason.includes("Concept evidence contributed")));
  assert.ok(contract.rationale.some(reason => reason.includes("Import graph evidence contributed")));
});

test("checkScope reports review-specific overreach categories", () => {
  const contract = {
    id: "scope-review-categories",
    createdAt: "2026-05-13T12:00:00.000Z",
    prompt: "Improve scope contracts",
    intent: "Improve scope contracts.",
    status: "ready" as const,
    affectedNodeIds: ["architecture.core.engine"],
    allowedFiles: [
      "packages/core/src/scope.ts",
      "docs/SCOPE_CONTRACTS.md"
    ],
    allowedAreas: ["core", "docs"],
    forbiddenAreas: [],
    ambiguities: [],
    requiresClarification: false,
    maxFilesChanged: 5,
    maxDiffLines: 200,
    allowGeneratedMemory: true,
    requiredChecks: [],
    rationale: []
  };

  const sourceReport = checkScope({
    contract,
    changes: [
      { path: "packages/core/src/scope.ts", addedLines: 12, deletedLines: 2 }
    ]
  });
  assert.equal(sourceReport.status, "warning");
  assert.ok(sourceReport.violations.some(violation => violation.kind === "implementation-without-test"));
  assert.ok(sourceReport.violations.some(violation => violation.kind === "source-changed-memory-not-refreshed"));

  const docsReport = checkScope({
    contract,
    changes: [
      { path: "docs/SCOPE_CONTRACTS.md", addedLines: 4, deletedLines: 0 }
    ]
  });
  assert.ok(docsReport.violations.some(violation => violation.kind === "docs-only-change"));
  assert.match(formatScopeCheckMarkdown(docsReport), /Recommended Reviewer Checks/);
});

function fixtureNodes(): TreeNode[] {
  return [
    node("project.intent", "Project intent", "project-purpose", "Overall project purpose.", []),
    node("architecture.visual.app", "Visual app", "architecture", "React visual app tree explorer.", [
      "packages/app/src/App.tsx",
      "packages/app/src/components/TreeList.tsx",
      "packages/app/src/styles.css"
    ]),
    node("module.core.scanner", "Scanner", "module", "Core file scanner.", ["packages/core/src/scanner.ts"])
  ];
}

function fixtureFiles(): FileSummary[] {
  return [
    file("packages/app/src/App.tsx", "App visual shell."),
    file("packages/app/src/components/TreeList.tsx", "TreeList renders tree navigation nodes."),
    file("packages/app/src/styles.css", "App styles."),
    file("packages/app/src/app.test.tsx", "App tests."),
    file("packages/core/src/scanner.ts", "Core scanner.")
  ];
}

function node(id: string, title: string, level: string, summary: string, ownedFiles: string[]): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: level,
    level,
    summary,
    children: [],
    sourceFiles: ownedFiles,
    ownedFiles,
    responsibilities: [summary],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: {
      allowedToChange: ownedFiles,
      mustNotChange: []
    },
    confidence: 0.8
  };
}

function file(filePath: string, summary: string, imports: string[] = []): FileSummary {
  return {
    path: filePath,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    language: filePath.endsWith(".css") ? "CSS" : "TypeScript",
    sizeBytes: 10,
    lines: 1,
    imports,
    exports: [],
    symbols: [],
    isTest: filePath.includes(".test."),
    summary,
    ownedByNodeIds: []
  };
}

function concept(id: string, relatedFiles: string[]): Concept {
  return {
    id,
    title: id,
    summary: `${id} concept.`,
    relatedNodeIds: [],
    relatedFiles,
    tags: [id],
    evidence: []
  };
}
