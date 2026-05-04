import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicTree } from "./treeBuilder.js";
import type { FileSummary } from "./schema.js";

test("buildDeterministicTree infers concepts from repo-specific paths and symbols", () => {
  const result = buildDeterministicTree("billing-app", [
    file("src/billing/invoice.ts", ["InvoiceLedger"], ["createInvoice"]),
    file("tests/invoice.test.ts", ["InvoiceLedger"], [])
  ]);

  const concept = result.concepts.find(c => c.id === "invoice");

  assert.ok(concept);
  assert.equal(concept.title, "Invoice");
  assert.deepEqual(concept.relatedFiles, ["src/billing/invoice.ts", "tests/invoice.test.ts"]);
  assert.ok(concept.relatedNodeIds.includes("file.src.billing.invoice.ts"));
});

function file(path: string, symbols: string[], exports: string[]): FileSummary {
  return {
    path,
    extension: ".ts",
    language: "TypeScript",
    parseStrategy: "typescript-ast",
    sizeBytes: 100,
    lines: 5,
    imports: [],
    exports,
    symbols,
    isTest: path.includes("test"),
    summary: `${path} summary.`,
    ownedByNodeIds: []
  };
}
