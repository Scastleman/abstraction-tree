import type {
  AbstractionOntologyLevel,
  FileSummary,
  TreeNode,
  ValidationIssue
} from "../schema.js";
import { validateRuntimeSchema } from "../runtimeSchema.js";
import { atreePath, writeJson } from "../workspace.js";
import { validateTree } from "../validator.js";
import type {
  ChangeClassification,
  ClassifiedChange,
  DetectedChange,
  LlmAbstractionBuilder,
  OntologyProposal,
  ProposedOntologyChange,
  ProposedTreeChange,
  ProposalMetadata,
  TreeProposal
} from "./types.js";

export const LLM_PROPOSAL_PENDING_PATH = ".abstraction-tree/proposals/<pending>";
export const LLM_PROPOSAL_REVIEW_HINT =
  "Do not apply this proposal directly. Fix provider output, resolve validation issues, and run `atree validate` after any manual memory update.";

export const LLM_PROPOSAL_POLICY_GATES = [
  "A human reviews confidence, rationale, warnings, affected layers, and validation issues.",
  "All validation errors are resolved before any ontology or tree memory is changed.",
  "Destructive remove proposals require a separate explicit approval.",
  "Canonical .abstraction-tree memory is updated manually and revalidated after approval."
] as const;

export interface LlmProposalBundle {
  ontology: OntologyProposal;
  tree: TreeProposal;
  classification?: ChangeClassification;
}

export interface LlmProposalValidationContext {
  existingOntology: AbstractionOntologyLevel[];
  existingTree: TreeNode[];
  files: FileSummary[];
}

export interface LlmProposalValidation {
  status: "valid" | "blocked";
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

export interface LlmProposalRecord {
  id: string;
  createdAt: string;
  provider: string;
  adapter?: string;
  reviewRequired: true;
  policyGates: string[];
  proposals: LlmProposalBundle;
  validation: LlmProposalValidation;
}

export interface CreateLlmProposalRecordOptions {
  provider: string;
  adapter?: string;
  proposals: LlmProposalBundle;
  validation: LlmProposalValidation;
  now?: Date;
}

export async function collectLlmProposalBundle(
  builder: LlmAbstractionBuilder,
  input: Parameters<LlmAbstractionBuilder["proposeOntology"]>[0]
): Promise<LlmProposalBundle> {
  const [ontology, tree, classification] = await Promise.all([
    builder.proposeOntology(input),
    builder.proposeTree(input),
    builder.classifyChange({ ...input, detectedChanges: input.detectedChanges ?? [] })
  ]);

  return { ontology, tree, classification };
}

export function createLlmProposalRecord(options: CreateLlmProposalRecordOptions): LlmProposalRecord {
  const createdAt = (options.now ?? new Date()).toISOString();
  return {
    id: `proposal.${compactTimestamp(createdAt)}.${safeProviderName(options.provider)}`,
    createdAt,
    provider: options.provider,
    adapter: options.adapter,
    reviewRequired: true,
    policyGates: [...LLM_PROPOSAL_POLICY_GATES],
    proposals: options.proposals,
    validation: options.validation
  };
}

export async function writeLlmProposalRecord(projectRoot: string, record: LlmProposalRecord): Promise<string> {
  const filePath = atreePath(projectRoot, "proposals", `${record.id}.json`);
  await writeJson(filePath, record);
  return filePath;
}

export function validateLlmProposalBundle(proposals: unknown, context: LlmProposalValidationContext): LlmProposalValidation {
  const issues: ValidationIssue[] = [];
  const bundle = expectRecord(proposals, "$", "LLM proposal bundle", issues);
  if (!bundle) return validationResult(issues);

  const ontologyProposal = expectRecordField(bundle, "ontology", "$", issues);
  const treeProposal = expectRecordField(bundle, "tree", "$", issues);

  const ontologyChanges = ontologyProposal
    ? validateOntologyProposal(ontologyProposal, "$.ontology", issues)
    : [];
  const materializedOntology = materializeOntology(context.existingOntology, ontologyChanges);
  issues.push(...remapRuntimeIssues(validateRuntimeSchema("ontology", materializedOntology, LLM_PROPOSAL_PENDING_PATH), "$.materializedOntology"));

  const treeChanges = treeProposal
    ? validateTreeProposal(treeProposal, "$.tree", context.existingTree, issues)
    : [];
  const materializedTree = materializeTree(context.existingTree, treeChanges);
  issues.push(...validateTree(materializedTree, context.files, materializedOntology).map(issue => ({
    ...issue,
    fieldPath: issue.fieldPath ?? "$.materializedTree",
    recoveryHint: issue.recoveryHint ?? LLM_PROPOSAL_REVIEW_HINT
  })));

  if ("classification" in bundle && bundle.classification !== undefined) {
    const classification = expectRecordField(bundle, "classification", "$", issues);
    if (classification) validateChangeClassification(classification, "$.classification", issues);
  }

  return validationResult(issues);
}

function validateOntologyProposal(
  proposal: Record<string, unknown>,
  fieldPath: string,
  issues: ValidationIssue[]
): ProposedOntologyChange[] {
  validateProposalMetadata(proposal, fieldPath, issues);
  const changes = expectArrayField(proposal, "proposedOntologyChanges", fieldPath, issues);
  if (!changes) return [];

  const validChanges: ProposedOntologyChange[] = [];
  changes.forEach((change, index) => {
    const changePath = `${fieldPath}.proposedOntologyChanges[${index}]`;
    const record = expectRecord(change, changePath, "Ontology proposal change", issues);
    if (!record) return;

    const action = stringField(record, "action");
    if (!["add", "update", "remove", "reorder"].includes(action ?? "")) {
      issues.push(proposalIssue(`${changePath}.action`, "Ontology proposal action must be add, update, remove, or reorder."));
      return;
    }
    if (action === "remove") {
      issues.push(policyIssue(`${changePath}.action`, "Destructive ontology remove proposals require separate explicit human approval."));
    }

    const proposedLevel = expectRecordField(record, "proposedLevel", changePath, issues);
    if (!proposedLevel) return;
    const levelIssues = validateRuntimeSchema("ontology", [proposedLevel], LLM_PROPOSAL_PENDING_PATH);
    issues.push(...remapRuntimeIssues(levelIssues, `${changePath}.proposedLevel`));
    if (levelIssues.some(issue => issue.severity === "error")) return;

    if ("currentLevel" in record && record.currentLevel !== undefined) {
      const currentLevel = expectRecordField(record, "currentLevel", changePath, issues);
      if (currentLevel) {
        issues.push(...remapRuntimeIssues(
          validateRuntimeSchema("ontology", [currentLevel], LLM_PROPOSAL_PENDING_PATH),
          `${changePath}.currentLevel`
        ));
      }
    }

    validateProposalMetadata(record, changePath, issues);
    validChanges.push(record as unknown as ProposedOntologyChange);
  });
  return validChanges;
}

function validateTreeProposal(
  proposal: Record<string, unknown>,
  fieldPath: string,
  existingTree: TreeNode[],
  issues: ValidationIssue[]
): ProposedTreeChange[] {
  validateProposalMetadata(proposal, fieldPath, issues);
  const changes = expectArrayField(proposal, "proposedTreeChanges", fieldPath, issues);
  if (!changes) return [];

  const existingIds = new Set(existingTree.map(node => node.id));
  const validChanges: ProposedTreeChange[] = [];
  changes.forEach((change, index) => {
    const changePath = `${fieldPath}.proposedTreeChanges[${index}]`;
    const record = expectRecord(change, changePath, "Tree proposal change", issues);
    if (!record) return;

    const action = stringField(record, "action");
    if (!["add-node", "update-node", "remove-node", "move-node"].includes(action ?? "")) {
      issues.push(proposalIssue(`${changePath}.action`, "Tree proposal action must be add-node, update-node, remove-node, or move-node."));
      return;
    }
    if (action === "remove-node") {
      issues.push(policyIssue(`${changePath}.action`, "Destructive tree remove-node proposals require separate explicit human approval."));
    }

    const proposedNode = expectRecordField(record, "proposedNode", changePath, issues);
    if (!proposedNode) return;
    const nodeIssues = validateRuntimeSchema("tree", [proposedNode], LLM_PROPOSAL_PENDING_PATH);
    issues.push(...remapRuntimeIssues(nodeIssues, `${changePath}.proposedNode`));
    if (nodeIssues.some(issue => issue.severity === "error")) return;

    const proposedId = stringField(proposedNode, "id");
    if (proposedId && action === "add-node" && existingIds.has(proposedId)) {
      issues.push(proposalIssue(`${changePath}.proposedNode.id`, `Tree add-node proposal targets existing node ${proposedId}.`));
    }
    if (proposedId && action !== undefined && ["update-node", "move-node", "remove-node"].includes(action) && !existingIds.has(proposedId)) {
      issues.push(proposalIssue(`${changePath}.proposedNode.id`, `Tree ${action} proposal targets missing node ${proposedId}.`));
    }
    validateNodeMemoryPaths(proposedNode, `${changePath}.proposedNode`, issues);

    if ("currentNode" in record && record.currentNode !== undefined) {
      const currentNode = expectRecordField(record, "currentNode", changePath, issues);
      if (currentNode) {
        issues.push(...remapRuntimeIssues(
          validateRuntimeSchema("tree", [currentNode], LLM_PROPOSAL_PENDING_PATH),
          `${changePath}.currentNode`
        ));
      }
    }
    if ("sourceFiles" in record && record.sourceFiles !== undefined) {
      const sourceFiles = expectArrayField(record, "sourceFiles", changePath, issues);
      if (sourceFiles) {
        issues.push(...remapRuntimeIssues(
          validateRuntimeSchema("files", sourceFiles, LLM_PROPOSAL_PENDING_PATH),
          `${changePath}.sourceFiles`
        ));
      }
    }

    validateProposalMetadata(record, changePath, issues);
    validChanges.push(record as unknown as ProposedTreeChange);
  });
  return validChanges;
}

function validateChangeClassification(
  classification: Record<string, unknown>,
  fieldPath: string,
  issues: ValidationIssue[]
): void {
  validateProposalMetadata(classification, fieldPath, issues);
  const changes = expectArrayField(classification, "changes", fieldPath, issues);
  if (!changes) return;

  changes.forEach((change, index) => {
    const changePath = `${fieldPath}.changes[${index}]`;
    const record = expectRecord(change, changePath, "Classified change", issues);
    if (!record) return;

    validateProposalMetadata(record, changePath, issues);
    if (!["no-tree-impact", "tree-memory-update-needed", "needs-human-review"].includes(stringField(record, "classification") ?? "")) {
      issues.push(proposalIssue(`${changePath}.classification`, "Classified change must use a known change impact classification."));
    }
    const detectedChange = expectRecordField(record, "change", changePath, issues);
    if (detectedChange) validateDetectedChange(detectedChange as Partial<DetectedChange>, `${changePath}.change`, issues);

    validateNestedProposalChanges(record as Partial<ClassifiedChange>, changePath, issues);
  });
}

function validateNestedProposalChanges(
  record: Partial<ClassifiedChange>,
  fieldPath: string,
  issues: ValidationIssue[]
): void {
  if (record.proposedOntologyChanges !== undefined) {
    const wrapper: ProposalMetadata & { proposedOntologyChanges: unknown } = {
      ...emptyMetadata(),
      proposedOntologyChanges: record.proposedOntologyChanges
    };
    validateOntologyProposal(wrapper as unknown as Record<string, unknown>, fieldPath, issues);
  }
  if (record.proposedTreeChanges !== undefined) {
    const wrapper: ProposalMetadata & { proposedTreeChanges: unknown } = {
      ...emptyMetadata(),
      proposedTreeChanges: record.proposedTreeChanges
    };
    validateTreeProposal(wrapper as unknown as Record<string, unknown>, fieldPath, [], issues);
  }
}

function validateDetectedChange(
  change: Partial<DetectedChange>,
  fieldPath: string,
  issues: ValidationIssue[]
): void {
  if (typeof change.filePath !== "string" || !change.filePath.trim()) {
    issues.push(proposalIssue(`${fieldPath}.filePath`, "Detected change must include a non-empty filePath."));
  }
  if (!["added", "modified", "deleted", "renamed", "unchanged"].includes(String(change.status))) {
    issues.push(proposalIssue(`${fieldPath}.status`, "Detected change status must be added, modified, deleted, renamed, or unchanged."));
  }
}

function validateProposalMetadata(record: Record<string, unknown>, fieldPath: string, issues: ValidationIssue[]): void {
  const confidence = record.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push(proposalIssue(`${fieldPath}.confidence`, "Proposal confidence must be a finite number between 0 and 1."));
  }
  if (!stringField(record, "rationale")) {
    issues.push(proposalIssue(`${fieldPath}.rationale`, "Proposal rationale must be a non-empty string."));
  }
  expectStringArrayField(record, "warnings", fieldPath, issues);
  validateAffectedLayers(record.affectedLayers, `${fieldPath}.affectedLayers`, issues);
}

function validateAffectedLayers(value: unknown, fieldPath: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(proposalIssue(fieldPath, "Proposal affectedLayers must be an array."));
    return;
  }
  value.forEach((layer, index) => {
    const layerPath = `${fieldPath}[${index}]`;
    const record = expectRecord(layer, layerPath, "Affected layer", issues);
    if (!record) return;
    if (!stringField(record, "id")) {
      issues.push(proposalIssue(`${layerPath}.id`, "Affected layer must include a non-empty id."));
    }
    if ("name" in record && record.name !== undefined && typeof record.name !== "string") {
      issues.push(proposalIssue(`${layerPath}.name`, "Affected layer name must be a string when present."));
    }
    if ("rank" in record && record.rank !== undefined && (!Number.isInteger(record.rank) || Number(record.rank) < 0)) {
      issues.push(proposalIssue(`${layerPath}.rank`, "Affected layer rank must be a non-negative integer when present."));
    }
  });
}

function validateNodeMemoryPaths(node: Record<string, unknown>, fieldPath: string, issues: ValidationIssue[]): void {
  for (const field of ["sourceFiles", "ownedFiles"]) {
    const value = node[field];
    if (!Array.isArray(value)) continue;
    value.forEach((filePath, index) => {
      if (typeof filePath !== "string") return;
      if (normalizeRelativePath(filePath).startsWith(".abstraction-tree/")) {
        issues.push(policyIssue(
          `${fieldPath}.${field}[${index}]`,
          "LLM tree proposals must not assign canonical .abstraction-tree memory files to tree nodes."
        ));
      }
    });
  }
}

function materializeOntology(
  existingOntology: AbstractionOntologyLevel[],
  changes: ProposedOntologyChange[]
): AbstractionOntologyLevel[] {
  let ontology = existingOntology.map(level => ({ ...level }));
  for (const change of changes) {
    const id = change.proposedLevel.id;
    if (change.action === "remove") {
      ontology = ontology.filter(level => level.id !== id);
      continue;
    }
    const index = ontology.findIndex(level => level.id === id);
    if (index === -1) ontology.push({ ...change.proposedLevel });
    else ontology[index] = { ...change.proposedLevel };
  }
  return ontology;
}

function materializeTree(existingTree: TreeNode[], changes: ProposedTreeChange[]): TreeNode[] {
  let nodes = existingTree.map(node => cloneTreeNode(node));
  for (const change of changes) {
    const id = change.proposedNode.id;
    if (change.action === "remove-node") {
      nodes = nodes.filter(node => node.id !== id);
      continue;
    }
    if (change.action === "add-node") {
      nodes.push(cloneTreeNode(change.proposedNode));
      continue;
    }
    const index = nodes.findIndex(node => node.id === id);
    if (index === -1) nodes.push(cloneTreeNode(change.proposedNode));
    else nodes[index] = cloneTreeNode(change.proposedNode);
  }
  return nodes;
}

function cloneTreeNode(node: TreeNode): TreeNode {
  return {
    ...node,
    children: [...node.children],
    sourceFiles: [...node.sourceFiles],
    ownedFiles: [...node.ownedFiles],
    responsibilities: [...node.responsibilities],
    dependencies: [...node.dependencies],
    dependsOn: [...node.dependsOn],
    changeLog: [...node.changeLog],
    invariants: [...node.invariants],
    changePolicy: {
      allowedToChange: [...node.changePolicy.allowedToChange],
      mustNotChange: [...node.changePolicy.mustNotChange]
    }
  };
}

function validationResult(issues: ValidationIssue[]): LlmProposalValidation {
  const errorCount = issues.filter(issue => issue.severity === "error").length;
  const warningCount = issues.filter(issue => issue.severity === "warning").length;
  return {
    status: errorCount ? "blocked" : "valid",
    issueCount: issues.length,
    errorCount,
    warningCount,
    issues
  };
}

function remapRuntimeIssues(issues: ValidationIssue[], fieldPath: string): ValidationIssue[] {
  return issues.map(issue => ({
    ...issue,
    filePath: LLM_PROPOSAL_PENDING_PATH,
    fieldPath: remapFieldPath(issue.fieldPath, fieldPath),
    recoveryHint: LLM_PROPOSAL_REVIEW_HINT
  }));
}

function remapFieldPath(fieldPath: string | undefined, basePath: string): string {
  if (!fieldPath || fieldPath === "$") return basePath;
  if (fieldPath.startsWith("$[0]")) return fieldPath.replace(/^\$\[0\]/, basePath);
  if (fieldPath.startsWith("$")) return fieldPath.replace(/^\$/, basePath);
  return `${basePath}.${fieldPath}`;
}

function expectRecord(
  value: unknown,
  fieldPath: string,
  label: string,
  issues: ValidationIssue[]
): Record<string, unknown> | undefined {
  if (objectRecord(value)) return value;
  issues.push(proposalIssue(fieldPath, `${label} must be a JSON object.`));
  return undefined;
}

function expectRecordField(
  record: Record<string, unknown>,
  field: string,
  fieldPath: string,
  issues: ValidationIssue[]
): Record<string, unknown> | undefined {
  return expectRecord(record[field], `${fieldPath}.${field}`, field, issues);
}

function expectArrayField(
  record: Record<string, unknown>,
  field: string,
  fieldPath: string,
  issues: ValidationIssue[]
): unknown[] | undefined {
  const value = record[field];
  if (Array.isArray(value)) return value;
  issues.push(proposalIssue(`${fieldPath}.${field}`, `${field} must be an array.`));
  return undefined;
}

function expectStringArrayField(
  record: Record<string, unknown>,
  field: string,
  fieldPath: string,
  issues: ValidationIssue[]
): void {
  const value = record[field];
  if (!Array.isArray(value)) {
    issues.push(proposalIssue(`${fieldPath}.${field}`, `${field} must be an array of strings.`));
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push(proposalIssue(`${fieldPath}.${field}[${index}]`, `${field} entries must be strings.`));
    }
  });
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function proposalIssue(fieldPath: string, message: string): ValidationIssue {
  return {
    severity: "error",
    filePath: LLM_PROPOSAL_PENDING_PATH,
    fieldPath,
    message,
    recoveryHint: LLM_PROPOSAL_REVIEW_HINT
  };
}

function policyIssue(fieldPath: string, message: string): ValidationIssue {
  return {
    severity: "error",
    filePath: LLM_PROPOSAL_PENDING_PATH,
    fieldPath,
    message,
    recoveryHint: "Require explicit human approval and manual application outside `atree propose`."
  };
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyMetadata(): ProposalMetadata {
  return {
    confidence: 0,
    rationale: "Nested change proposal wrapper.",
    warnings: [],
    affectedLayers: []
  };
}

function safeProviderName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "provider";
}

function compactTimestamp(isoTimestamp: string): string {
  return isoTimestamp.replace(/\D/g, "").slice(0, 17);
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}
