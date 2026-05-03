import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFile } from "./scanner.js";
import { detectFileDrift, validateTree } from "./validator.js";
import type { AbstractionOntologyLevel, TreeNode } from "./schema.js";

test("detectFileDrift reports stale file summaries and new files", () => {
  const stored = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const current = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\nexport const tax = 0;\n", 48);
  const added = summarizeFile("src/payment.ts", ".ts", "export const payment = 1;\n", 25);

  const issues = detectFileDrift([stored], [current, added]);

  assert.ok(issues.some(issue => issue.filePath === "src/checkout.ts" && issue.message.includes("changed since the last scan")));
  assert.ok(issues.some(issue => issue.filePath === "src/payment.ts" && issue.message.includes("missing from abstraction memory")));
});

test("detectFileDrift reports files removed from disk", () => {
  const stored = summarizeFile("src/old.ts", ".ts", "export const oldFlow = true;\n", 28);

  const issues = detectFileDrift([stored], []);

  assert.ok(issues.some(issue => issue.filePath === "src/old.ts" && issue.message.includes("no longer present")));
});

test("validateTree reports parent and children link mismatches", () => {
  const nodes = [
    node("root", undefined, ["child"]),
    node("child", "other-parent", []),
    node("other-parent", undefined, [])
  ];

  const issues = validateTree(nodes, []);

  assert.ok(issues.some(issue => issue.nodeId === "root" && issue.message.includes("child child declares parent other-parent")));
  assert.ok(issues.some(issue => issue.nodeId === "child" && issue.message.includes("parent other-parent does not list child as a child")));
});

test("validateTree reports parent cycles even when links are bidirectional", () => {
  const nodes = [
    node("root", undefined, []),
    node("cycle-a", "cycle-b", ["cycle-b"]),
    node("cycle-b", "cycle-a", ["cycle-a"])
  ];

  const issues = validateTree(nodes, []);

  assert.ok(issues.some(issue => issue.message.includes("Tree contains parent cycle: cycle-a -> cycle-b -> cycle-a.")));
});

test("validateTree reports duplicate node ids before map lookups collapse them", () => {
  const nodes = [
    node("root", undefined, ["feature"]),
    node("feature", "root", []),
    node("feature", "root", [])
  ];

  const issues = validateTree(nodes, []);

  assert.ok(issues.some(issue => issue.nodeId === "feature" && issue.message.includes("duplicate node id feature")));
});

test("validateTree reports duplicate file paths before path lookups collapse them", () => {
  const first = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const second = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 2;\n", 26);

  const issues = validateTree([node("root", undefined, [])], [first, second]);

  assert.ok(issues.some(issue => issue.filePath === "src/checkout.ts" && issue.message.includes("duplicate path src/checkout.ts")));
});

test("validateTree reports duplicate ontology level ids before ontology lookups collapse them", () => {
  const ontology = [
    ontologyLevel("component", 0),
    ontologyLevel("component", 1)
  ];

  const issues = validateTree([node("root", undefined, [])], [], ontology);

  assert.ok(issues.some(issue => issue.message.includes("duplicate level id component")));
});

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
