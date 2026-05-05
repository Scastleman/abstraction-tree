import type {
  AbstractionLevel,
  AbstractionOntologyLevel,
  ChangeRecord,
  Concept,
  ContextPack,
  FileSummary,
  Invariant,
  TreeNode
} from "../schema.js";
import type { ScanResult } from "../scanner.js";

export interface AbstractionBuilderInput {
  projectName: string;
  scannerOutput: ScanResult;
  existingOntology: AbstractionOntologyLevel[];
  existingTree: TreeNode[];
  existingConcepts?: Concept[];
  existingInvariants?: Invariant[];
  docsSummaries?: DocumentationSummary[];
  priorRunReports?: PriorRunReport[];
  detectedChanges?: DetectedChange[];
  contextPacks?: ContextPack[];
}

export interface ChangeClassificationInput extends AbstractionBuilderInput {
  detectedChanges: DetectedChange[];
  priorChangeRecords?: ChangeRecord[];
}

export interface DocumentationSummary {
  path: string;
  title?: string;
  summary: string;
  relatedFilePaths?: string[];
  relatedNodeIds?: string[];
}

export interface PriorRunReport {
  path: string;
  timestamp?: string;
  task?: string;
  result?: RunResult;
  summary: string;
  checksRun?: string[];
  risks?: string[];
}

export type RunResult = "success" | "partial" | "failed" | "unknown";

export type DetectedChangeStatus = "added" | "modified" | "deleted" | "renamed" | "unchanged";

export type ChangeRisk = "low" | "medium" | "high" | "unknown";

export interface DetectedChange {
  filePath: string;
  status: DetectedChangeStatus;
  summary?: string;
  beforeHash?: string;
  afterHash?: string;
  affectedNodeIds?: string[];
  affectedLayers?: AbstractionLayerReference[];
  risk?: ChangeRisk;
}

export interface AbstractionLayerReference {
  id: AbstractionLevel;
  name?: string;
  rank?: number;
}

export interface ProposalEvidence {
  scannerFilePaths?: string[];
  docPaths?: string[];
  priorRunReportPaths?: string[];
  detectedChangeFilePaths?: string[];
}

export interface ProposalMetadata {
  confidence: number;
  rationale: string;
  warnings: string[];
  affectedLayers: AbstractionLayerReference[];
  evidence?: ProposalEvidence;
}

export interface ProposedOntologyChange extends ProposalMetadata {
  action: "add" | "update" | "remove" | "reorder";
  proposedLevel: AbstractionOntologyLevel;
  currentLevel?: AbstractionOntologyLevel;
}

export interface ProposedTreeChange extends ProposalMetadata {
  action: "add-node" | "update-node" | "remove-node" | "move-node";
  proposedNode: TreeNode;
  currentNode?: TreeNode;
  sourceFiles?: FileSummary[];
}

export interface OntologyProposal extends ProposalMetadata {
  proposedOntologyChanges: ProposedOntologyChange[];
}

export interface TreeProposal extends ProposalMetadata {
  proposedTreeChanges: ProposedTreeChange[];
}

export interface ClassifiedChange extends ProposalMetadata {
  change: DetectedChange;
  classification: ChangeImpactClassification;
  proposedOntologyChanges?: ProposedOntologyChange[];
  proposedTreeChanges?: ProposedTreeChange[];
}

export type ChangeImpactClassification = "no-tree-impact" | "tree-memory-update-needed" | "needs-human-review";

export interface ChangeClassification extends ProposalMetadata {
  changes: ClassifiedChange[];
}

export interface LlmAbstractionBuilder {
  proposeOntology(input: AbstractionBuilderInput): Promise<OntologyProposal>;
  proposeTree(input: AbstractionBuilderInput): Promise<TreeProposal>;
  classifyChange(input: ChangeClassificationInput): Promise<ChangeClassification>;
}
