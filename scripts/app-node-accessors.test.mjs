import assert from "node:assert/strict";
import test from "node:test";
import { nodeDependencies, nodeFiles, nodeLevel, nodeName } from "../packages/app/dist-ts/nodeAccessors.js";

function node(overrides = {}) {
  return {
    id: "legacy",
    title: "Legacy node",
    level: "module",
    summary: "Legacy alias-shaped node.",
    children: [],
    ownedFiles: [],
    dependsOn: [],
    invariants: [],
    confidence: 1,
    ...overrides
  };
}

test("app nodeFiles falls back to ownedFiles when sourceFiles is empty", () => {
  assert.deepEqual(nodeFiles(node({ sourceFiles: [], ownedFiles: ["src/legacy.ts"] })), ["src/legacy.ts"]);
});

test("app nodeFiles prefers non-empty sourceFiles", () => {
  assert.deepEqual(nodeFiles(node({ sourceFiles: ["src/current.ts"], ownedFiles: ["src/legacy.ts"] })), ["src/current.ts"]);
});

test("app nodeDependencies falls back to dependsOn when dependencies is empty", () => {
  assert.deepEqual(nodeDependencies(node({ dependencies: [], dependsOn: ["legacy.node"] })), ["legacy.node"]);
});

test("app node accessors keep compatibility aliases visible", () => {
  const item = node({
    name: "Display name",
    abstractionLevel: "feature",
    dependencies: ["dependency.node"],
    dependsOn: ["legacy.node"]
  });

  assert.equal(nodeName(item), "Display name");
  assert.equal(nodeLevel(item), "feature");
  assert.deepEqual(nodeDependencies(item), ["dependency.node"]);
});
