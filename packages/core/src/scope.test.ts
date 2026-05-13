import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScopeContract,
  checkScope,
  formatScopeCheckMarkdown,
  formatScopeContractMarkdown
} from "./scope.js";
import type { FileSummary, TreeNode } from "./schema.js";

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

function file(filePath: string, summary: string): FileSummary {
  return {
    path: filePath,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    language: filePath.endsWith(".css") ? "CSS" : "TypeScript",
    sizeBytes: 10,
    lines: 1,
    imports: [],
    exports: [],
    symbols: [],
    isTest: filePath.includes(".test."),
    summary,
    ownedByNodeIds: []
  };
}
