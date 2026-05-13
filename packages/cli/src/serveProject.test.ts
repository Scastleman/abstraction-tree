import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  atreePath,
  ensureWorkspace,
  writeJson,
  type TreeNode
} from "@abstraction-tree/core";
import { buildServeProjectSummary, formatServeProjectSummary } from "./serveProject.js";

test("serve project summary makes the resolved project and memory counts explicit", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { installMode: "full", projectName: "Target Project" });
  await writeJson(atreePath(root, "tree.json"), [node("project.intent", "Target Project")]);
  await writeJson(atreePath(root, "files.json"), []);
  await writeJson(atreePath(root, "ontology.json"), []);
  await writeJson(atreePath(root, "concepts.json"), []);
  await writeJson(atreePath(root, "invariants.json"), []);

  const summary = await buildServeProjectSummary(root);
  const output = formatServeProjectSummary(summary);

  assert.equal(summary.projectName, "Target Project");
  assert.equal(summary.memory.nodes, 1);
  assert.match(output, /Serving project: Target Project/);
  assert.match(output, new RegExp(escapeRegExp(`Project root: ${root}`)));
  assert.match(output, /Memory: 0 files, 1 nodes, 0 concepts, 0 invariants, 0 changes/);
  assert.doesNotMatch(output, /dogfooding memory/);
});

test("serve project summary warns for unscanned workspaces", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { installMode: "full", projectName: "Blank Project" });

  const output = formatServeProjectSummary(await buildServeProjectSummary(root));

  assert.match(output, /Serving project: Blank Project/);
  assert.match(output, /Warning: missing memory files/);
  assert.match(output, /atree scan --project/);
});

test("serve project summary warns when serving the Abstraction Tree development repo", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { installMode: "full", projectName: "abstraction-tree" });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "abstraction-tree-monorepo" }), "utf8");

  const output = formatServeProjectSummary(await buildServeProjectSummary(root));

  assert.match(output, /Abstraction Tree development repo/);
  assert.match(output, /dogfooding memory/);
  assert.match(output, /consumer project's --project path/);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-serve-project-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function node(id: string, title: string): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: "project-purpose",
    level: "project-purpose",
    summary: title,
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
    confidence: 0.8
  };
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
