import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  atreePath,
  ensureWorkspace,
  writeJson,
  type TreeNode
} from "@abstraction-tree/core";
import { runTreeExportCommand } from "./treeExportCommand.js";

test("tree export command prints Mermaid diagrams by default", async t => {
  const root = await workspace(t);
  await writeTree(root);
  const capture = captureIo();

  const exitCode = await runTreeExportCommand({ projectRoot: root }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout[0] ?? "", /flowchart TD/);
  assert.match(capture.stdout[0] ?? "", /n0 --> n1/);
});

test("tree export command writes Graphviz diagrams to a project-relative output file", async t => {
  const root = await workspace(t);
  await writeTree(root);
  const capture = captureIo();

  const exitCode = await runTreeExportCommand({
    projectRoot: root,
    format: "dot",
    direction: "LR",
    output: "docs/tree.dot",
    withSummaries: true
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout[0] ?? "", /Wrote dot tree diagram to docs\/tree\.dot/);
  const output = await readFile(path.join(root, "docs", "tree.dot"), "utf8");
  assert.match(output, /rankdir=LR/);
  assert.match(output, /Checkout\\nCheckout behavior/);
});

test("tree export command rejects unsupported formats", async t => {
  const root = await workspace(t);
  await writeTree(root);
  const capture = captureIo();

  const exitCode = await runTreeExportCommand({
    projectRoot: root,
    format: "svg"
  }, capture.io);

  assert.equal(exitCode, 1);
  assert.match(capture.stderr[0] ?? "", /format must be either/);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-export-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await ensureWorkspace(root, { installMode: "core", projectName: "Export Command Project" });
  return root;
}

async function writeTree(root: string): Promise<void> {
  await writeJson(atreePath(root, "tree.json"), [
    node("project.intent", "Project Intent", "Project purpose.", ["feature.checkout"]),
    { ...node("feature.checkout", "Checkout", "Checkout behavior.", []), parent: "project.intent" }
  ]);
}

function node(id: string, title: string, summary: string, children: string[]): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: "feature",
    level: "feature",
    summary,
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

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text)
    }
  };
}
