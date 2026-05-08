import assert from "node:assert/strict";
import test from "node:test";
import {
  LLM_PROPOSAL_POLICY_GATES,
  createLlmProposalRecord,
  validateLlmProposalBundle
} from "./index.js";
import type {
  AbstractionOntologyLevel,
  FileSummary,
  LlmProposalBundle,
  ProposalMetadata,
  TreeNode
} from "./index.js";

test("validates materialized LLM ontology and tree proposals", () => {
  const validation = validateLlmProposalBundle(validBundle(), {
    existingOntology: [ontologyLevel("component", 0)],
    existingTree: [node("root", undefined, [])],
    files: [file("src/feature.ts", ["feature"])]
  });

  assert.equal(validation.status, "valid");
  assert.equal(validation.errorCount, 0);
});

test("blocks malformed LLM proposal output before it can be reviewed for application", () => {
  const validation = validateLlmProposalBundle({
    ontology: {
      ...metadata(),
      confidence: 1.5,
      proposedOntologyChanges: [{
        ...metadata(),
        action: "add",
        proposedLevel: { id: "feature" }
      }]
    },
    tree: {
      ...metadata(),
      proposedTreeChanges: [{
        ...metadata(),
        action: "add-node",
        proposedNode: { id: "feature" }
      }]
    }
  }, {
    existingOntology: [ontologyLevel("component", 0)],
    existingTree: [node("root", undefined, [])],
    files: []
  });

  assert.equal(validation.status, "blocked");
  assert.ok(validation.issues.some(issue => issue.fieldPath === "$.ontology.confidence"));
  assert.ok(validation.issues.some(issue => issue.fieldPath === "$.ontology.proposedOntologyChanges[0].proposedLevel.name"));
  assert.ok(validation.issues.some(issue => issue.fieldPath === "$.tree.proposedTreeChanges[0].proposedNode.name"));
});

test("blocks unsafe destructive and canonical-memory tree proposals", () => {
  const unsafeNode = {
    ...node("root", undefined, []),
    sourceFiles: [".abstraction-tree/tree.json"],
    ownedFiles: [".abstraction-tree/tree.json"]
  };
  const validation = validateLlmProposalBundle({
    ontology: { ...metadata(), proposedOntologyChanges: [] },
    tree: {
      ...metadata(),
      proposedTreeChanges: [{
        ...metadata(),
        action: "remove-node",
        proposedNode: unsafeNode
      }]
    }
  }, {
    existingOntology: [ontologyLevel("component", 0)],
    existingTree: [node("root", undefined, [])],
    files: []
  });

  assert.equal(validation.status, "blocked");
  assert.ok(validation.issues.some(issue => issue.message.includes("remove-node proposals require separate explicit human approval")));
  assert.ok(validation.issues.some(issue => issue.message.includes("must not assign canonical .abstraction-tree memory files")));
});

test("creates review-gated proposal records", () => {
  const proposals = validBundle();
  const validation = validateLlmProposalBundle(proposals, {
    existingOntology: [ontologyLevel("component", 0)],
    existingTree: [node("root", undefined, [])],
    files: [file("src/feature.ts", ["feature"])]
  });

  const record = createLlmProposalRecord({
    provider: "local-json",
    adapter: "adapters/local-json/index.mjs",
    proposals,
    validation,
    now: new Date("2026-05-08T12:13:14.015Z")
  });

  assert.equal(record.id, "proposal.20260508121314015.local-json");
  assert.equal(record.reviewRequired, true);
  assert.deepEqual(record.policyGates, [...LLM_PROPOSAL_POLICY_GATES]);
});

function validBundle(): LlmProposalBundle {
  const rootUpdate = {
    ...node("root", undefined, ["feature"]),
    summary: "Root node updated to include the proposed feature child."
  };
  return {
    ontology: {
      ...metadata(),
      proposedOntologyChanges: []
    },
    tree: {
      ...metadata(),
      proposedTreeChanges: [
        {
          ...metadata(),
          action: "update-node",
          proposedNode: rootUpdate,
          currentNode: node("root", undefined, [])
        },
        {
          ...metadata(),
          action: "add-node",
          proposedNode: node("feature", "root", [], ["src/feature.ts"]),
          sourceFiles: [file("src/feature.ts", ["feature"])]
        }
      ]
    },
    classification: {
      ...metadata(),
      changes: []
    }
  };
}

function metadata(): ProposalMetadata {
  return {
    confidence: 0.72,
    rationale: "The proposal is based on explicit provider output under review.",
    warnings: [],
    affectedLayers: [{ id: "component", name: "Component", rank: 0 }]
  };
}

function ontologyLevel(id: string, rank: number): AbstractionOntologyLevel {
  return {
    id,
    name: id,
    description: `${id} layer.`,
    rank,
    signals: [],
    confidence: 0.8
  };
}

function node(id: string, parent: string | undefined, children: string[], sourceFiles: string[] = []): TreeNode {
  return {
    id,
    name: id,
    title: id,
    abstractionLevel: "component",
    level: "component",
    summary: `${id} summary.`,
    parent,
    parentId: parent,
    children,
    sourceFiles,
    ownedFiles: sourceFiles,
    responsibilities: [],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: { allowedToChange: [], mustNotChange: [] },
    confidence: 0.8
  };
}

function file(path: string, ownedByNodeIds: string[]): FileSummary {
  return {
    path,
    extension: ".ts",
    language: "TypeScript",
    parseStrategy: "typescript-ast",
    contentHash: "hash",
    sizeBytes: 32,
    lines: 1,
    imports: [],
    exports: [],
    symbols: [],
    isTest: false,
    summary: `${path} file.`,
    ownedByNodeIds
  };
}
