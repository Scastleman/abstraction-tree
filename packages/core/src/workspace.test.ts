import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { buildImportGraphFromFiles } from "./importGraph.js";
import { scanProject } from "./scanner.js";
import { buildDeterministicTree } from "./treeBuilder.js";
import { atreePath, ensureWorkspace, readJson, writeJson } from "./workspace.js";

test("readJson accepts JSON files with a leading BOM", async t => {
  const root = await workspace(t);
  const filePath = path.join(root, "state.json");
  await writeFile(filePath, "\ufeff{\"ok\":true}", "utf8");

  assert.deepEqual(await readJson(filePath, { ok: false }), { ok: true });
});

test("ensureWorkspace creates a blank project-local workspace", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { projectName: "External Project", installMode: "core" });

  assert.deepEqual(await sortedEntries(atreePath(root)), ["changes", "config.json", "context-packs"]);
  assert.deepEqual(await sortedEntries(atreePath(root, "changes")), []);
  assert.deepEqual(await sortedEntries(atreePath(root, "context-packs")), []);

  assert.equal(existsSync(atreePath(root, "tree.json")), false);
  assert.equal(existsSync(atreePath(root, "files.json")), false);
  assert.equal(existsSync(atreePath(root, "concepts.json")), false);
  assert.equal(existsSync(atreePath(root, "invariants.json")), false);
  assert.equal(existsSync(atreePath(root, "import-graph.json")), false);
  assert.equal(existsSync(atreePath(root, "runs")), false);
  assert.equal(existsSync(atreePath(root, "lessons")), false);
  assert.equal(existsSync(atreePath(root, "evaluations")), false);
  assert.equal(existsSync(atreePath(root, "goals")), false);
  assert.equal(existsSync(atreePath(root, "automation")), false);
});

test("scan memory for a temporary project is generated from that project", async t => {
  const root = await workspace(t);
  await writeFile(path.join(root, "package.json"), "{\"name\":\"external-fixture\"}\n", "utf8");
  await writeFile(path.join(root, "index.ts"), "export const externalAnswer = 42;\n", "utf8");
  await ensureWorkspace(root, { projectName: "External Fixture" });

  const scan = await scanProject(root);
  const importGraph = buildImportGraphFromFiles(scan.files);
  const built = buildDeterministicTree("External Fixture", scan.files, { importGraph });
  await writeJson(atreePath(root, "files.json"), built.files);
  await writeJson(atreePath(root, "import-graph.json"), importGraph);
  await writeJson(atreePath(root, "ontology.json"), built.ontology);
  await writeJson(atreePath(root, "tree.json"), built.nodes);
  await writeJson(atreePath(root, "concepts.json"), built.concepts);
  await writeJson(atreePath(root, "invariants.json"), built.invariants);

  const files = await readJson<Array<{ path: string }>>(atreePath(root, "files.json"), []);
  const tree = await readJson<Array<{ id: string; title?: string; sourceFiles?: string[] }>>(atreePath(root, "tree.json"), []);

  assert.deepEqual(files.map(file => file.path).sort(), ["index.ts", "package.json"]);
  assert.ok(tree.some(node => node.id === "project.intent" && node.title === "External Fixture"));
  assert.ok(tree.some(node => node.sourceFiles?.includes("index.ts")));
  assert.equal(tree.some(node => node.sourceFiles?.some(filePath => filePath.startsWith("packages/core/"))), false);
  assert.equal(existsSync(atreePath(root, "runs")), false);
  assert.equal(existsSync(atreePath(root, "lessons")), false);
  assert.equal(existsSync(atreePath(root, "evaluations")), false);
  assert.equal(existsSync(atreePath(root, "automation")), false);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-workspace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function sortedEntries(directory: string): Promise<string[]> {
  return (await readdir(directory)).sort();
}
