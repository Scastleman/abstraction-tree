import assert from "node:assert/strict";
import test from "node:test";
import { formatTreeAsDot, formatTreeAsMermaid } from "./treeExport.js";
import type { TreeNode } from "./schema.js";

test("formatTreeAsMermaid emits deterministic node declarations and tree edges", () => {
  const output = formatTreeAsMermaid([
    node("project.intent", "Project Intent", ["feature.checkout"]),
    node("feature.checkout", "Checkout [API]", [])
  ], { includeSummaries: true, maxSummaryLength: 28 });

  assert.equal(output, [
    "flowchart TD",
    "  n0[\"Project Intent<br/>Summary for Project Intent\"]",
    "  n1[\"Checkout &#91;API&#93;<br/>Summary for Checkout &#91;API&#93;\"]",
    "  n0 --> n1",
    ""
  ].join("\n"));
});

test("formatTreeAsDot emits Graphviz with parent fallback edges and escaped labels", () => {
  const output = formatTreeAsDot([
    node("root", "Root \"Node\"", []),
    { ...node("child", "Path \\ Child", []), parent: "root" }
  ], { direction: "LR" });

  assert.equal(output, [
    "digraph AbstractionTree {",
    "  rankdir=LR;",
    "  node [shape=box, style=\"rounded\", fontname=\"Arial\"];",
    "  n0 [label=\"Root \\\"Node\\\"\"];",
    "  n1 [label=\"Path \\\\ Child\"];",
    "  n0 -> n1;",
    "}",
    ""
  ].join("\n"));
});

function node(id: string, title: string, children: string[]): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: "feature",
    level: "feature",
    summary: `Summary for ${title}`,
    children,
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
    confidence: 0.8
  };
}
