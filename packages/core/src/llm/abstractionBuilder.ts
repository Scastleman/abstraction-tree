import type {
  AbstractionBuilderInput,
  ChangeClassification,
  ChangeClassificationInput,
  LlmAbstractionBuilder,
  OntologyProposal,
  ProposalEvidence,
  ProposalMetadata,
  TreeProposal
} from "./types.js";

export const LLM_PROVIDER_NOT_CONFIGURED_MESSAGE =
  "LLM provider not configured; using deterministic no-op abstraction proposals.";

export class NoopLlmAbstractionBuilder implements LlmAbstractionBuilder {
  async proposeOntology(input: AbstractionBuilderInput): Promise<OntologyProposal> {
    return {
      ...noopMetadata(input),
      proposedOntologyChanges: []
    };
  }

  async proposeTree(input: AbstractionBuilderInput): Promise<TreeProposal> {
    return {
      ...noopMetadata(input),
      proposedTreeChanges: []
    };
  }

  async classifyChange(input: ChangeClassificationInput): Promise<ChangeClassification> {
    return {
      ...noopMetadata(input),
      changes: input.detectedChanges.map(change => ({
        ...noopMetadata(input),
        change,
        classification: "needs-human-review"
      }))
    };
  }
}

function noopMetadata(input: AbstractionBuilderInput): ProposalMetadata {
  return {
    confidence: 0,
    rationale: "No LLM provider adapter was supplied, so the deterministic placeholder did not infer abstraction changes.",
    warnings: [LLM_PROVIDER_NOT_CONFIGURED_MESSAGE],
    affectedLayers: [],
    evidence: proposalEvidence(input)
  };
}

function proposalEvidence(input: AbstractionBuilderInput): ProposalEvidence {
  return {
    scannerFilePaths: input.scannerOutput.files.map(file => file.path),
    docPaths: input.docsSummaries?.map(doc => doc.path) ?? [],
    priorRunReportPaths: input.priorRunReports?.map(report => report.path) ?? [],
    detectedChangeFilePaths: input.detectedChanges?.map(change => change.filePath) ?? []
  };
}
