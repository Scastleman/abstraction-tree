import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import {
  atreePath,
  buildDeterministicTree,
  buildImportGraph,
  ensureWorkspace,
  scanProject,
  writeJson
} from "@abstraction-tree/core";
import { runProposeCommand } from "./propose.js";

test("propose saves adapter output under proposals without changing canonical memory", async t => {
  const projectRoot = await workspace(t);
  await writeFile(path.join(projectRoot, "index.ts"), "export const answer = 42;\n", "utf8");

  await writeDeterministicMemory(projectRoot);
  const treeBefore = await readFile(path.join(projectRoot, ".abstraction-tree", "tree.json"), "utf8");

  const inputPath = path.join(projectRoot, "proposal.json");
  await writeFile(inputPath, JSON.stringify(noOpProposal(), null, 2), "utf8");

  const result = await runProposeCommand({
    projectRoot,
    provider: "local-json",
    adapter: path.join(repoRoot(), "adapters", "local-json", "index.mjs"),
    input: inputPath
  });

  const treeAfter = await readFile(path.join(projectRoot, ".abstraction-tree", "tree.json"), "utf8");
  const proposalNames = await readdir(path.join(projectRoot, ".abstraction-tree", "proposals"));
  const proposal = JSON.parse(await readFile(
    path.join(projectRoot, ".abstraction-tree", "proposals", proposalNames[0] ?? ""),
    "utf8"
  )) as Record<string, unknown>;

  assert.equal(treeAfter, treeBefore);
  assert.equal(proposalNames.length, 1);
  assert.equal(proposal.provider, "local-json");
  assert.equal(proposal.reviewRequired, true);
  assert.match(path.relative(projectRoot, result.proposalPath).replaceAll(path.sep, "/"), /^\.abstraction-tree\/proposals\/proposal\./);
  assert.equal(result.validation.status, "valid");
  assert.equal(result.validation.errorCount, 0);
});

async function writeDeterministicMemory(projectRoot: string) {
  await ensureWorkspace(projectRoot);
  const scan = await scanProject(projectRoot);
  const importGraph = await buildImportGraph(projectRoot, scan.files);
  const built = buildDeterministicTree("fixture", scan.files, { importGraph });
  await writeJson(atreePath(projectRoot, "files.json"), built.files);
  await writeJson(atreePath(projectRoot, "import-graph.json"), importGraph);
  await writeJson(atreePath(projectRoot, "ontology.json"), built.ontology);
  await writeJson(atreePath(projectRoot, "tree.json"), built.nodes);
  await writeJson(atreePath(projectRoot, "concepts.json"), built.concepts);
  await writeJson(atreePath(projectRoot, "invariants.json"), built.invariants);
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-propose-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function noOpProposal() {
  return {
    ontology: {
      confidence: 0.1,
      rationale: "No ontology changes are proposed by this fixture.",
      warnings: [],
      affectedLayers: [],
      proposedOntologyChanges: []
    },
    tree: {
      confidence: 0.1,
      rationale: "No tree changes are proposed by this fixture.",
      warnings: [],
      affectedLayers: [],
      proposedTreeChanges: []
    },
    classification: {
      confidence: 0.1,
      rationale: "No changes were classified by this fixture.",
      warnings: [],
      affectedLayers: [],
      changes: []
    }
  };
}
