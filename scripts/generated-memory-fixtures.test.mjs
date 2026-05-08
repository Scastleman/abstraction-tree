import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildContextPack,
  buildImportGraph,
  buildDeterministicTree,
  evaluateGeneratedMemoryQuality,
  scanProject
} from "../packages/core/dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = ".abstraction-tree/evaluation-fixture.json";

const fixtures = [
  {
    name: "small web app",
    projectName: "small-web-app",
    root: path.join(repoRoot, "examples", "small-web-app")
  },
  {
    name: "inventory API",
    projectName: "inventory-api",
    root: path.join(repoRoot, "examples", "inventory-api")
  }
];

for (const fixtureProject of fixtures) {
  test(`generated memory fixture quality stays stable for ${fixtureProject.name}`, async () => {
    const { quality } = await evaluateFixtureProject(fixtureProject);

    assert.deepEqual(quality.fixture.missingExpectedTreeNodeIds, []);
    assert.deepEqual(quality.fixture.missingExpectedArchitectureNodeIds, []);
    assert.deepEqual(quality.fixture.missingExpectedConceptIds, []);
    assert.deepEqual(quality.fixture.missingExpectedInvariantIds, []);
    assert.deepEqual(quality.context.missingExpectedInclusions, []);
    assert.equal(quality.concepts.noisyConceptCount, 0);
    assert.equal(quality.imports.unresolvedImportCount, 0);
    assert.equal(quality.context.passingExpectedContextPackCount, quality.context.expectedContextPackCount);
    assert.ok(quality.architecture.architectureCoveragePercent >= 80);
  });
}

async function evaluateFixtureProject(project) {
  const fixture = await readFixture(project.root);
  const scan = await scanProject(project.root);
  const importGraph = await buildImportGraph(project.root, scan.files);
  const built = buildDeterministicTree(project.projectName, scan.files, { importGraph });
  const contextPacks = (fixture.expectedContextPacks ?? []).map(expected =>
    buildContextPack({
      target: expected.target,
      nodes: built.nodes,
      files: built.files,
      concepts: built.concepts,
      invariants: built.invariants,
      changes: []
    })
  );

  return {
    scan,
    importGraph,
    built,
    contextPacks,
    quality: evaluateGeneratedMemoryQuality({
      nodes: built.nodes,
      files: built.files,
      concepts: built.concepts,
      invariants: built.invariants,
      importGraph,
      contextPacks,
      fixture,
      fixturePath
    })
  };
}

async function readFixture(projectRoot) {
  return JSON.parse(await readFile(path.join(projectRoot, ...fixturePath.split("/")), "utf8"));
}
