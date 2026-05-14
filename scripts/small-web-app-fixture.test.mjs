import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildContextPack,
  buildImportGraph,
  buildDeterministicTree,
  scanProject,
  validateConcepts,
  validateContextPacks,
  validateInvariants,
  validateTree
} from "../packages/core/dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = path.join(repoRoot, "examples", "small-web-app");
const generatedMemoryPaths = [".abstraction-tree/files.json", ".abstraction-tree/import-graph.json", ".abstraction-tree/tree.json"];

test("small web app fixture scans checkout files and builds useful context", async () => {
  const scan = await scanProject(exampleRoot);
  const files = new Map(scan.files.map(file => [file.path, file]));

  assert.deepEqual([...files.keys()], [
    "package.json",
    "README.md",
    "src/api/checkout.ts",
    "src/components/CheckoutForm.tsx",
    "src/services/cart.ts",
    "src/services/orders.ts",
    "src/services/payment.ts",
    "tests/checkout.test.js"
  ]);

  const checkout = requiredFile(files, "src/api/checkout.ts");
  assert.equal(checkout.parseStrategy, "typescript-ast");
  assert.deepEqual(checkout.imports, ["../services/cart", "../services/payment", "../services/orders"]);
  assert.deepEqual(checkout.exports, ["checkout"]);
  assertIncludes(checkout.symbols, ["checkout", "cart", "payment"]);
  assert.ok(checkout.summary.includes("AST-backed scan."));
  assert.ok(checkout.summary.includes("Depends on ../services/cart, ../services/payment, ../services/orders."));

  assert.deepEqual(requiredFile(files, "src/services/cart.ts").exports, ["validateCart"]);
  assert.deepEqual(requiredFile(files, "src/services/payment.ts").exports, ["authorizePayment"]);
  assert.deepEqual(requiredFile(files, "src/services/orders.ts").exports, ["createOrder"]);

  const checkoutTest = requiredFile(files, "tests/checkout.test.js");
  assert.equal(checkoutTest.isTest, true);
  assertIncludes(checkoutTest.imports, ["node:assert/strict", "node:test", "typescript"]);

  const importGraph = await buildImportGraph(exampleRoot, scan.files);
  const built = buildDeterministicTree("small-web-app", scan.files, { importGraph });
  assert.deepEqual([
    ...validateTree(built.nodes, built.files, built.ontology),
    ...validateConcepts(built.concepts, built.nodes, built.files),
    ...validateInvariants(built.invariants, built.nodes, built.files, generatedMemoryPaths)
  ], []);

  const nodes = new Map(built.nodes.map(node => [node.id, node]));
  const architecture = nodes.get("project.architecture");
  assert.ok(architecture);
  assertIncludes(architecture.children, [
    "architecture.local.api.routes",
    "architecture.visual.app.ui",
    "architecture.runtime.dataflow",
    "architecture.package.distribution"
  ]);
  assertIncludes(nodes.get("architecture.runtime.dataflow").sourceFiles, [
    "src/api/checkout.ts",
    "src/services/cart.ts",
    "src/services/orders.ts",
    "src/services/payment.ts"
  ]);

  const concepts = new Map(built.concepts.map(concept => [concept.id, concept]));
  assertExpectedConcepts(concepts, ["cart", "checkout", "order", "payment"]);
  assertAbsentConcepts(concepts, ["service", "services", "src", "test"]);
  assertRelatedFiles(concepts, "checkout", [
    "src/api/checkout.ts",
    "src/components/CheckoutForm.tsx",
    "tests/checkout.test.js"
  ]);
  assertRelatedFiles(concepts, "cart", ["src/api/checkout.ts", "src/services/cart.ts"]);
  assertRelatedFiles(concepts, "payment", ["src/api/checkout.ts", "src/services/payment.ts"]);
  assertRelatedFiles(concepts, "order", ["src/services/orders.ts"]);
  assertIncludes(concepts.get("checkout").evidence.map(evidence => evidence.kind), ["path", "symbol", "export"]);

  const pack = buildContextPack({
    target: "checkout",
    nodes: built.nodes,
    files: built.files,
    concepts: built.concepts,
    invariants: built.invariants,
    changes: []
  });
  assert.deepEqual(validateContextPacks([pack], built.nodes, built.files, built.concepts, built.invariants, [], generatedMemoryPaths), []);
  assertIncludes(pack.relevantFiles.map(file => file.path), [
    "src/api/checkout.ts",
    "src/components/CheckoutForm.tsx",
    "src/services/cart.ts",
    "src/services/orders.ts",
    "src/services/payment.ts",
    "tests/checkout.test.js"
  ]);
  assertIncludes(pack.relevantConcepts.map(concept => concept.id), ["checkout", "cart", "payment"]);
  assertIncludes(pack.relevantNodes.map(node => node.id), [
    "file.src.api.checkout.ts",
    "concept-node.checkout",
    "module.src"
  ]);
});

function requiredFile(files, filePath) {
  const file = files.get(filePath);
  assert.ok(file, `Expected scan to include ${filePath}`);
  return file;
}

function assertRelatedFiles(concepts, conceptId, expectedFiles) {
  const concept = concepts.get(conceptId);
  assert.ok(concept, `Expected ${conceptId} concept`);
  assertIncludes(concept.relatedFiles, expectedFiles);
  assert.ok(concept.evidence.length > 0, `Expected ${conceptId} concept to include evidence`);
}

function assertIncludes(actual, expected) {
  for (const value of expected) {
    assert.ok(actual.includes(value), `Expected ${JSON.stringify(actual)} to include ${value}`);
  }
}

function assertExpectedConcepts(concepts, expectedIds) {
  for (const conceptId of expectedIds) {
    assert.ok(concepts.has(conceptId), `Expected ${conceptId} concept`);
  }
}

function assertAbsentConcepts(concepts, absentIds) {
  for (const conceptId of absentIds) {
    assert.equal(concepts.has(conceptId), false, `Did not expect ${conceptId} concept`);
  }
}
