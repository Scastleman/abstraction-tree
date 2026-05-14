import assert from "node:assert/strict";
import test from "node:test";
import { formatTreeDot, formatTreeMermaid } from "./exportGraph.js";
import type { TreeNode } from "./schema.js";

test("formatTreeMermaid exports tree nodes and parent edges", () => {
  const output = formatTreeMermaid(nodes());

  assert.match(output, /^flowchart TD/m);
  assert.match(output, /Project Purpose/);
  assert.match(output, /CLI Surface/);
  assert.match(output, /n0 --> n1/);
});

test("formatTreeDot exports Graphviz-compatible tree edges", () => {
  const output = formatTreeDot(nodes());

  assert.match(output, /^digraph AbstractionTree \{/m);
  assert.match(output, /"project.intent" \[label="Project Purpose"\]/);
  assert.match(output, /"project.intent" -> "architecture.cli"/);
});

function nodes(): TreeNode[] {
  return [
    node("project.intent", "Project Purpose"),
    node("architecture.cli", "CLI Surface", "project.intent")
  ];
}

function node(id: string, name: string, parent?: string): TreeNode {
  return {
    id,
    name,
    title: name,
    abstractionLevel: "project",
    level: "project",
    summary: name,
    parent,
    parentId: parent,
    children: [],
    sourceFiles: [],
    ownedFiles: [],
    responsibilities: [],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: {
      allowedToChange: [],
      mustNotChange: []
    },
    confidence: 1
  };
}
