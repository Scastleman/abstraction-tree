import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFile } from "./scanner.js";
import { detectFileDrift, validateChanges, validateConcepts, validateInvariants, validateTree } from "./validator.js";
import type { AbstractionOntologyLevel, ChangeRecord, Concept, Invariant, TreeNode } from "./schema.js";

test("detectFileDrift reports stale file summaries and new files", () => {
  const stored = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const current = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\nexport const tax = 0;\n", 48);
  const added = summarizeFile("src/payment.ts", ".ts", "export const payment = 1;\n", 25);

  const issues = detectFileDrift([stored], [current, added]);

  assert.ok(issues.some(issue => issue.filePath === "src/checkout.ts" && issue.message.includes("changed since the last scan")));
  assert.ok(issues.some(issue => issue.filePath === "src/payment.ts" && issue.message.includes("missing from abstraction memory")));
});

test("detectFileDrift ignores platform line ending size differences when content hash matches", () => {
  const stored = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const current = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\r\n", 27);

  const issues = detectFileDrift([stored], [current]);

  assert.equal(issues.some(issue => issue.filePath === "src/checkout.ts" && issue.message.includes("changed since the last scan")), false);
});

test("detectFileDrift uses legacy signatures when only one side has a content hash", () => {
  const stored = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const current = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\r\n", 27);
  delete stored.contentHash;

  const issues = detectFileDrift([stored], [current]);

  assert.equal(issues.some(issue => issue.filePath === "src/checkout.ts" && issue.message.includes("changed since the last scan")), false);
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

test("validateTree reports duplicate ontology level names", () => {
  const ontology = [
    ontologyLevel("runtime", 0, "Runtime Layer"),
    ontologyLevel("execution", 1, " runtime   layer ")
  ];

  const issues = validateTree([node("root", undefined, [])], [], ontology);

  assert.ok(issues.some(issue => issue.message.includes("duplicate level name Runtime Layer")));
});

test("validateTree reports invalid ontology rank shapes", () => {
  const nonIntegerOntology = [
    ontologyLevel("root", 0),
    ontologyLevel("feature", 1.5)
  ];
  const gappedOntology = [
    ontologyLevel("root", 0),
    ontologyLevel("feature", 2)
  ];

  const nonIntegerIssues = validateTree([node("root", undefined, [])], [], nonIntegerOntology);
  const gappedIssues = validateTree([node("root", undefined, [])], [], gappedOntology);

  assert.ok(nonIntegerIssues.some(issue => issue.message.includes("level feature must use a non-negative integer rank")));
  assert.ok(gappedIssues.some(issue => issue.message.includes("ranks must be contiguous from 0")));
});

test("validateTree reports invalid ontology confidence values", () => {
  const ontology = [
    ontologyLevel("root", 0),
    { ...ontologyLevel("feature", 1), confidence: 1.2 },
    { ...ontologyLevel("runtime", 2), confidence: Number.NaN }
  ];

  const issues = validateTree([node("root", undefined, [])], [], ontology);

  assert.ok(issues.some(issue => issue.message.includes("level feature must use a confidence between 0 and 1")));
  assert.ok(issues.some(issue => issue.message.includes("level runtime must use a confidence between 0 and 1")));
});

test("validateConcepts reports duplicate concept ids before context de-duplication", () => {
  const concepts = [
    concept("checkout"),
    concept("checkout"),
    concept("payment")
  ];

  const issues = validateConcepts(concepts);

  assert.ok(issues.some(issue => issue.message.includes("duplicate concept id checkout")));
});

test("validateConcepts reports concept references to missing nodes and files", () => {
  const existingFile = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const staleConcept = {
    ...concept("checkout"),
    relatedNodeIds: ["checkout-node", "missing-node"],
    relatedFiles: ["src/checkout.ts", "src/missing.ts"]
  };

  const issues = validateConcepts([staleConcept], [node("checkout-node", undefined, [])], [existingFile]);

  assert.ok(issues.some(issue => issue.nodeId === "missing-node" && issue.message.includes("references missing tree node missing-node")));
  assert.ok(issues.some(issue => issue.filePath === "src/missing.ts" && issue.message.includes("references missing file src/missing.ts")));
});

test("validateInvariants reports duplicate invariant ids before invariant lookups collapse them", () => {
  const invariants = [
    invariant("tree-updated"),
    invariant("tree-updated"),
    invariant("tests-updated")
  ];

  const issues = validateInvariants(invariants);

  assert.ok(issues.some(issue => issue.message.includes("duplicate invariant id tree-updated")));
});

test("validateInvariants reports invariant references to missing nodes and files", () => {
  const existingFile = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const staleInvariant = {
    ...invariant("checkout-boundary"),
    nodeIds: ["checkout", "missing-node"],
    filePaths: ["src/checkout.ts", "src/missing.ts"]
  };

  const issues = validateInvariants([staleInvariant], [node("checkout", undefined, [])], [existingFile]);

  assert.ok(issues.some(issue => issue.nodeId === "missing-node" && issue.message.includes("references missing tree node missing-node")));
  assert.ok(issues.some(issue => issue.filePath === "src/missing.ts" && issue.message.includes("references missing file src/missing.ts")));
});

test("validateInvariants reports tree nodes that reference missing invariant ids", () => {
  const checkoutNode = {
    ...node("checkout", undefined, []),
    invariants: ["checkout-boundary", "missing-invariant"]
  };

  const issues = validateInvariants([invariant("checkout-boundary")], [checkoutNode]);

  assert.ok(issues.some(issue => issue.nodeId === "checkout" && issue.message.includes("references missing invariant missing-invariant")));
});

test("validateChanges reports duplicate ids and missing node, file, and invariant references", () => {
  const existingFile = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const staleChange = {
    ...change("scan.1"),
    affectedNodeIds: ["checkout", "missing-node"],
    filesChanged: ["src/checkout.ts", "src/missing.ts"],
    invariantsPreserved: ["tree-updated", "missing-invariant"]
  };

  const issues = validateChanges(
    [staleChange, change("scan.1")],
    [node("checkout", undefined, [])],
    [existingFile],
    [invariant("tree-updated")]
  );

  assert.ok(issues.some(issue => issue.message.includes("duplicate change id scan.1")));
  assert.ok(issues.some(issue => issue.nodeId === "missing-node" && issue.message.includes("references missing tree node missing-node")));
  assert.ok(issues.some(issue => issue.filePath === "src/missing.ts" && issue.message.includes("references missing file src/missing.ts")));
  assert.ok(issues.some(issue => issue.message.includes("references missing invariant missing-invariant")));
});

test("validateChanges reports malformed change record shapes before checking references", () => {
  const malformed = {
    id: "",
    timestamp: "not-a-date",
    title: "",
    reason: 42,
    affectedNodeIds: "checkout",
    filesChanged: ["src/checkout.ts", 7],
    invariantsPreserved: undefined,
    risk: "critical"
  } as unknown as ChangeRecord;

  const issues = validateChanges([null as unknown as ChangeRecord, malformed], [], [], []);

  assert.ok(issues.some(issue => issue.message.includes("at index 0 must be an object")));
  assert.ok(issues.some(issue => issue.message.includes("missing a non-empty id")));
  assert.ok(issues.some(issue => issue.message.includes("must use a valid timestamp")));
  assert.ok(issues.some(issue => issue.message.includes("missing a non-empty title")));
  assert.ok(issues.some(issue => issue.message.includes("missing a non-empty reason")));
  assert.ok(issues.some(issue => issue.message.includes("must use risk low, medium, or high")));
  assert.ok(issues.some(issue => issue.message.includes("string array for affectedNodeIds")));
  assert.ok(issues.some(issue => issue.message.includes("only strings in filesChanged")));
  assert.ok(issues.some(issue => issue.message.includes("string array for invariantsPreserved")));
  assert.equal(issues.some(issue => issue.nodeId === "c"), false);
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

function ontologyLevel(id: string, rank: number, name = id): AbstractionOntologyLevel {
  return {
    id,
    name,
    description: `${id} layer.`,
    rank,
    signals: [],
    confidence: 0.8
  };
}

function concept(id: string): Concept {
  return {
    id,
    title: id,
    summary: `${id} concept.`,
    relatedNodeIds: [],
    relatedFiles: [],
    tags: []
  };
}

function invariant(id: string): Invariant {
  return {
    id,
    title: id,
    description: `${id} invariant.`,
    nodeIds: [],
    filePaths: [],
    severity: "medium"
  };
}

function change(id: string): ChangeRecord {
  return {
    id,
    timestamp: "2026-05-03T00:00:00.000Z",
    title: id,
    reason: `${id} reason.`,
    affectedNodeIds: [],
    filesChanged: [],
    invariantsPreserved: [],
    risk: "low"
  };
}
