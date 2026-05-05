import assert from "node:assert/strict";
import test from "node:test";
import { LLM_PROVIDER_NOT_CONFIGURED_MESSAGE, NoopLlmAbstractionBuilder } from "./index.js";
import type {
  AbstractionBuilderInput,
  ChangeClassification,
  ChangeClassificationInput,
  LlmAbstractionBuilder,
  OntologyProposal,
  TreeProposal
} from "./index.js";

test("core exports LLM abstraction types and deterministic no-op builder", async () => {
  const builder: LlmAbstractionBuilder = new NoopLlmAbstractionBuilder();
  const input = abstractionInput();

  const ontology: OntologyProposal = await builder.proposeOntology(input);
  const tree: TreeProposal = await builder.proposeTree(input);
  const classificationInput: ChangeClassificationInput = {
    ...input,
    detectedChanges: [{
      filePath: "packages/core/src/schema.ts",
      status: "modified",
      affectedLayers: [{ id: "component.file.layer" }]
    }]
  };
  const classification: ChangeClassification = await builder.classifyChange(classificationInput);

  assert.equal(ontology.confidence, 0);
  assert.deepEqual(ontology.proposedOntologyChanges, []);
  assert.deepEqual(tree.proposedTreeChanges, []);
  assert.ok(ontology.warnings.includes(LLM_PROVIDER_NOT_CONFIGURED_MESSAGE));
  assert.deepEqual(ontology.evidence?.scannerFilePaths, ["packages/core/src/schema.ts"]);
  assert.equal(classification.changes[0]?.classification, "needs-human-review");
  assert.equal(classification.changes[0]?.change.filePath, "packages/core/src/schema.ts");
});

function abstractionInput(): AbstractionBuilderInput {
  return {
    projectName: "abstraction-tree",
    scannerOutput: {
      files: [{
        path: "packages/core/src/schema.ts",
        extension: ".ts",
        language: "TypeScript",
        parseStrategy: "typescript-ast",
        sizeBytes: 120,
        lines: 8,
        imports: [],
        exports: ["TreeNode"],
        symbols: ["TreeNode"],
        isTest: false,
        summary: "schema.ts is a TypeScript data/schema file.",
        ownedByNodeIds: ["file.packages.core.src.schema.ts"]
      }]
    },
    existingOntology: [],
    existingTree: [],
    docsSummaries: [{
      path: "docs/ARCHITECTURE.md",
      summary: "Core stays deterministic by default."
    }],
    priorRunReports: [{
      path: ".abstraction-tree/runs/example-agent-run.md",
      summary: "Prior deterministic scan completed."
    }],
    detectedChanges: []
  };
}
