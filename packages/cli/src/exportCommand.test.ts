import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { TreeNode } from "@abstraction-tree/core";

const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));

test("export command prints Mermaid output from tree memory", () => {
  const root = fixtureProject();
  const output = execFileSync(process.execPath, [cliPath, "export", "--project", root, "--format", "mermaid"], {
    encoding: "utf8"
  });

  assert.match(output, /^flowchart TD/m);
  assert.match(output, /Project Purpose/);
  assert.match(output, /CLI Surface/);
});

test("export command writes DOT output to a project-relative file", () => {
  const root = fixtureProject();
  const output = execFileSync(process.execPath, [
    cliPath,
    "export",
    "--project",
    root,
    "--format",
    "dot",
    "--out",
    "docs/tree.dot"
  ], {
    encoding: "utf8"
  });

  assert.match(output, /Wrote dot tree diagram to docs\/tree\.dot/);
  assert.match(readFileSync(path.join(root, "docs", "tree.dot"), "utf8"), /digraph AbstractionTree/);
});

test("top-level CLI help labels stable, beta, and experimental command groups", () => {
  const output = execFileSync(process.execPath, [cliPath, "--help"], {
    encoding: "utf8"
  });

  assert.match(output, /\[stable\] Scan files/);
  assert.match(output, /\[beta\] Classify a prompt/);
  assert.match(output, /\[experimental\] Run an explicit LLM provider adapter/);
});

function fixtureProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "atree-export-command-"));
  const atreeDir = path.join(root, ".abstraction-tree");
  mkdirSync(atreeDir, { recursive: true });
  writeFileSync(path.join(atreeDir, "tree.json"), `${JSON.stringify(nodes(), null, 2)}\n`, "utf8");
  return root;
}

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
