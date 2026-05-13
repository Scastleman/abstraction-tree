import type {
  AbstractionTreeState,
  AbstractionOntologyLevel,
  AgentHealth,
  AtreeConfig,
  ChangeRecord,
  Concept,
  ContextPack,
  FileSummary,
  Invariant,
  TreeNode,
  ValidationIssue
} from "./schema.js";

export const CURRENT_ATREE_SCHEMA_VERSION = "0.1.0";
export const SUPPORTED_ATREE_SCHEMA_VERSIONS = [CURRENT_ATREE_SCHEMA_VERSION] as const;

export type RuntimeSchemaKind =
  | "config"
  | "files"
  | "ontology"
  | "tree"
  | "import-graph"
  | "concepts"
  | "invariants"
  | "changes"
  | "change"
  | "context-packs"
  | "context-pack"
  | "evaluations"
  | "evaluation"
  | "api-state";

export interface RuntimeMigration<T> {
  fromVersion: string;
  toVersion: string;
  migrate: (value: T) => T;
}

export const ATREE_CONFIG_MIGRATIONS: RuntimeMigration<AtreeConfig>[] = [{
  fromVersion: CURRENT_ATREE_SCHEMA_VERSION,
  toVersion: CURRENT_ATREE_SCHEMA_VERSION,
  migrate: config => ({ ...config })
}];

const CONFIG_HINT = "Fix .abstraction-tree/config.json or recreate it with `atree init`.";
const VERSION_HINT = "Upgrade the Abstraction Tree CLI or migrate .abstraction-tree/config.json before continuing.";
const SCAN_HINT = "Fix the JSON shape or regenerate project memory with `atree scan`.";
const CONTEXT_HINT = "Fix the JSON shape or regenerate this context pack with `atree context`.";
const EVALUATION_HINT = "Fix the JSON shape or regenerate this evaluation report with `atree evaluate`.";
const CHANGE_HINT = "Fix the JSON shape or replace this file with a valid semantic change record.";
const API_STATE_HINT = "Update the CLI /api/state loader or shared app state contract.";

export class RuntimeSchemaValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(["Abstraction Tree memory validation failed.", ...issues.map(formatRuntimeValidationIssue)].join("\n"));
    this.name = "RuntimeSchemaValidationError";
    this.issues = issues;
  }
}

export function formatRuntimeValidationIssue(issue: ValidationIssue): string {
  const location = [issue.filePath, issue.fieldPath].filter(Boolean).join(" ");
  const hint = issue.recoveryHint ? ` Hint: ${issue.recoveryHint}` : "";
  return `[${issue.severity}] ${location ? `${location}: ` : ""}${issue.message}${hint}`;
}

export function invalidJsonIssue(filePath: string, recoveryHint = SCAN_HINT): ValidationIssue {
  return runtimeIssue(filePath, "$", `${filePath} is not valid JSON.`, recoveryHint);
}

export function assertRuntimeSchema(issues: ValidationIssue[]): void {
  if (issues.some(issue => issue.severity === "error")) {
    throw new RuntimeSchemaValidationError(issues);
  }
}

export function validateRuntimeSchema(kind: RuntimeSchemaKind, value: unknown, filePath: string): ValidationIssue[] {
  switch (kind) {
    case "config":
      return validateAtreeConfigSchema(value, filePath);
    case "files":
      return validateFileSummariesSchema(value, filePath);
    case "ontology":
      return validateOntologySchema(value, filePath);
    case "tree":
      return validateTreeNodesSchema(value, filePath);
    case "import-graph":
      return validateImportGraphSchema(value, filePath);
    case "concepts":
      return validateConceptsSchema(value, filePath);
    case "invariants":
      return validateInvariantsSchema(value, filePath);
    case "changes":
      return validateChangeRecordsSchema(value, filePath);
    case "change":
      return validateChangeRecordSchema(value, filePath);
    case "context-packs":
      return validateContextPacksSchema(value, filePath);
    case "context-pack":
      return validateContextPackSchema(value, filePath);
    case "evaluations":
      return validateEvaluationReportsSchema(value, filePath);
    case "evaluation":
      return validateEvaluationReportSchema(value, filePath);
    case "api-state":
      return validateApiStateSchema(value, filePath);
  }
}

export function validateAtreeConfigSchema(value: unknown, filePath = ".abstraction-tree/config.json"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const record = expectRecord(value, filePath, "$", "Config memory", CONFIG_HINT, issues);
  if (!record) return issues;

  expectString(record, "version", filePath, "$", CONFIG_HINT, issues);
  if (typeof record.version === "string") {
    issues.push(...validateConfigVersion(record.version, filePath, "$.version"));
  }
  expectString(record, "projectName", filePath, "$", CONFIG_HINT, issues);
  expectTimestamp(record, "createdAt", filePath, "$", CONFIG_HINT, issues);
  expectString(record, "sourceRoot", filePath, "$", CONFIG_HINT, issues);
  expectStringArray(record, "ignored", filePath, "$", CONFIG_HINT, issues);
  expectOptionalBoolean(record, "respectGitignore", filePath, "$", CONFIG_HINT, issues);
  expectEnum(record, "treeBuilder", ["deterministic", "llm"], filePath, "$", CONFIG_HINT, issues);
  expectEnum(record, "installMode", ["core", "full"], filePath, "$", CONFIG_HINT, issues);

  if ("abstractionOntology" in record) {
    validateArrayField(record, "abstractionOntology", filePath, "$", CONFIG_HINT, issues, validateOntologyLevel);
  }

  const visualApp = expectRecordField(record, "visualApp", filePath, "$", CONFIG_HINT, issues);
  if (visualApp) {
    expectBoolean(visualApp, "enabled", filePath, "$.visualApp", CONFIG_HINT, issues);
    expectInteger(visualApp, "defaultPort", filePath, "$.visualApp", CONFIG_HINT, issues, { min: 1, max: 65535 });
  }

  return issues;
}

export function validateConfigVersion(version: string, filePath = ".abstraction-tree/config.json", fieldPath = "$.version"): ValidationIssue[] {
  if (SUPPORTED_ATREE_SCHEMA_VERSIONS.includes(version as (typeof SUPPORTED_ATREE_SCHEMA_VERSIONS)[number])) {
    return [];
  }

  const comparison = compareVersions(version, CURRENT_ATREE_SCHEMA_VERSION);
  const message = comparison > 0
    ? `${filePath} uses future schema version ${version}; this CLI supports up to ${CURRENT_ATREE_SCHEMA_VERSION}.`
    : `${filePath} uses unsupported schema version ${version}; this CLI supports ${SUPPORTED_ATREE_SCHEMA_VERSIONS.join(", ")}.`;
  return [runtimeIssue(filePath, fieldPath, message, VERSION_HINT)];
}

export function migrateAtreeConfig(config: AtreeConfig): AtreeConfig {
  let current = { ...config };
  const seen = new Set<string>();

  while (current.version !== CURRENT_ATREE_SCHEMA_VERSION) {
    if (seen.has(current.version)) {
      throw new Error(`Migration cycle detected at schema version ${current.version}.`);
    }
    seen.add(current.version);

    const migration = ATREE_CONFIG_MIGRATIONS.find(candidate => candidate.fromVersion === current.version);
    if (!migration) {
      throw new Error(`No migration path from schema version ${current.version} to ${CURRENT_ATREE_SCHEMA_VERSION}.`);
    }
    current = migration.migrate(current);
  }

  return current;
}

export function validateFileSummariesSchema(value: unknown, filePath = ".abstraction-tree/files.json"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", SCAN_HINT, validateFileSummary);
}

export function validateOntologySchema(value: unknown, filePath = ".abstraction-tree/ontology.json"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", SCAN_HINT, validateOntologyLevel);
}

export function validateTreeNodesSchema(value: unknown, filePath = ".abstraction-tree/tree.json"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", SCAN_HINT, validateTreeNode);
}

export function validateImportGraphSchema(value: unknown, filePath = ".abstraction-tree/import-graph.json"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateImportGraph(value, filePath, "$", SCAN_HINT, issues);
  return issues;
}

export function validateConceptsSchema(value: unknown, filePath = ".abstraction-tree/concepts.json"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", SCAN_HINT, validateConcept);
}

export function validateInvariantsSchema(value: unknown, filePath = ".abstraction-tree/invariants.json"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", SCAN_HINT, validateInvariant);
}

export function validateChangeRecordsSchema(value: unknown, filePath = ".abstraction-tree/changes"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", CHANGE_HINT, validateChangeRecord);
}

export function validateChangeRecordSchema(value: unknown, filePath = ".abstraction-tree/changes/change.json"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateChangeRecord(value, filePath, "$", CHANGE_HINT, issues);
  return issues;
}

export function validateContextPacksSchema(value: unknown, filePath = ".abstraction-tree/context-packs"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", CONTEXT_HINT, validateContextPack);
}

export function validateContextPackSchema(value: unknown, filePath = ".abstraction-tree/context-packs/context.json"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateContextPack(value, filePath, "$", CONTEXT_HINT, issues);
  return issues;
}

export function validateEvaluationReportsSchema(value: unknown, filePath = ".abstraction-tree/evaluations"): ValidationIssue[] {
  return validateArrayValue(value, filePath, "$", EVALUATION_HINT, validateEvaluationReport);
}

export function validateEvaluationReportSchema(value: unknown, filePath = ".abstraction-tree/evaluations/evaluation.json"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateEvaluationReport(value, filePath, "$", EVALUATION_HINT, issues);
  return issues;
}

export function validateApiStateSchema(value: unknown, filePath = "/api/state"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const record = expectRecord(value, filePath, "$", "API state", API_STATE_HINT, issues);
  if (!record) return issues;

  issues.push(...validateNestedStateField(record, "config", filePath, validateAtreeConfigSchema));
  issues.push(...validateNestedStateField(record, "ontology", filePath, validateOntologySchema));
  issues.push(...validateNestedStateField(record, "nodes", filePath, validateTreeNodesSchema));
  issues.push(...validateNestedStateField(record, "files", filePath, validateFileSummariesSchema));
  issues.push(...validateNestedStateField(record, "importGraph", filePath, validateImportGraphSchema));
  issues.push(...validateNestedStateField(record, "concepts", filePath, validateConceptsSchema));
  issues.push(...validateNestedStateField(record, "invariants", filePath, validateInvariantsSchema));
  issues.push(...validateNestedStateField(record, "changes", filePath, validateChangeRecordsSchema));

  const agentHealth = expectRecordField(record, "agentHealth", filePath, "$", API_STATE_HINT, issues);
  if (agentHealth) validateAgentHealth(agentHealth, filePath, "$.agentHealth", API_STATE_HINT, issues);

  return issues;
}

function validateNestedStateField<K extends Exclude<keyof AbstractionTreeState, "agentHealth">>(
  record: Record<string, unknown>,
  field: K,
  filePath: string,
  validate: (value: unknown, filePath: string) => ValidationIssue[]
): ValidationIssue[] {
  return prefixIssues(validate(record[field], filePath), `$.${field}`);
}

function validateAgentHealth(
  health: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
  hint: string,
  issues: ValidationIssue[]
): void {
  if ("latestRun" in health && health.latestRun !== undefined) {
    const latestRun = expectRecordField(health, "latestRun", filePath, fieldPath, hint, issues);
    if (latestRun) {
      expectString(latestRun, "file", filePath, `${fieldPath}.latestRun`, hint, issues);
      expectOptionalString(latestRun, "timestamp", filePath, `${fieldPath}.latestRun`, hint, issues);
      expectOptionalString(latestRun, "task", filePath, `${fieldPath}.latestRun`, hint, issues);
      expectOptionalEnum(latestRun, "result", ["success", "partial", "failed", "no-op", "unknown"], filePath, `${fieldPath}.latestRun`, hint, issues);
    }
  }

  if ("latestEvaluation" in health && health.latestEvaluation !== undefined) {
    const latestEvaluation = expectRecordField(health, "latestEvaluation", filePath, fieldPath, hint, issues);
    if (latestEvaluation) {
      expectString(latestEvaluation, "file", filePath, `${fieldPath}.latestEvaluation`, hint, issues);
      expectOptionalString(latestEvaluation, "timestamp", filePath, `${fieldPath}.latestEvaluation`, hint, issues);
      expectOptionalInteger(latestEvaluation, "issueCount", filePath, `${fieldPath}.latestEvaluation`, hint, issues);
      expectOptionalInteger(latestEvaluation, "staleFileCount", filePath, `${fieldPath}.latestEvaluation`, hint, issues);
      expectOptionalInteger(latestEvaluation, "missingFileCount", filePath, `${fieldPath}.latestEvaluation`, hint, issues);
    }
  }

  if ("validation" in health && health.validation !== undefined) {
    const validation = expectRecordField(health, "validation", filePath, fieldPath, hint, issues);
    if (validation) {
      expectInteger(validation, "issueCount", filePath, `${fieldPath}.validation`, hint, issues, { min: 0 });
      expectInteger(validation, "errorCount", filePath, `${fieldPath}.validation`, hint, issues, { min: 0 });
      expectInteger(validation, "warningCount", filePath, `${fieldPath}.validation`, hint, issues, { min: 0 });
    }
  }

  if ("automation" in health && health.automation !== undefined) {
    const automation = expectRecordField(health, "automation", filePath, fieldPath, hint, issues);
    if (automation) {
      for (const field of [
        "loopsToday",
        "maxLoopsToday",
        "failedLoopsToday",
        "maxFailedLoops",
        "maxMinutesToday",
        "maxDiffLines",
        "completedMissions",
        "failedMissions"
      ] as readonly (keyof NonNullable<AgentHealth["automation"]>)[]) {
        expectOptionalInteger(automation, field, filePath, `${fieldPath}.automation`, hint, issues);
      }
      expectOptionalBoolean(automation, "stopRequested", filePath, `${fieldPath}.automation`, hint, issues);
      expectOptionalString(automation, "currentMission", filePath, `${fieldPath}.automation`, hint, issues);
    }
  }

  if ("scope" in health && health.scope !== undefined) {
    const scope = expectRecordField(health, "scope", filePath, fieldPath, hint, issues);
    if (scope) {
      expectString(scope, "file", filePath, `${fieldPath}.scope`, hint, issues);
      expectString(scope, "prompt", filePath, `${fieldPath}.scope`, hint, issues);
      expectEnum(scope, "status", ["draft", "needs-clarification", "ready", "clean", "warning", "blocked"], filePath, `${fieldPath}.scope`, hint, issues);
      expectOptionalBoolean(scope, "requiresClarification", filePath, `${fieldPath}.scope`, hint, issues);
      expectOptionalInteger(scope, "affectedNodeCount", filePath, `${fieldPath}.scope`, hint, issues);
      expectOptionalInteger(scope, "allowedFileCount", filePath, `${fieldPath}.scope`, hint, issues);
      expectOptionalInteger(scope, "violationCount", filePath, `${fieldPath}.scope`, hint, issues);
      expectOptionalString(scope, "checkedAt", filePath, `${fieldPath}.scope`, hint, issues);
    }
  }
}

function validateFileSummary(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "File summary", hint, issues);
  if (!record) return;

  expectString(record, "path", filePath, fieldPath, hint, issues);
  expectString(record, "extension", filePath, fieldPath, hint, issues, { allowEmpty: true });
  expectString(record, "language", filePath, fieldPath, hint, issues);
  expectOptionalEnum(record, "parseStrategy", ["typescript-ast", "regex"], filePath, fieldPath, hint, issues);
  expectOptionalString(record, "contentHash", filePath, fieldPath, hint, issues);
  expectInteger(record, "sizeBytes", filePath, fieldPath, hint, issues, { min: 0 });
  expectInteger(record, "lines", filePath, fieldPath, hint, issues, { min: 0 });
  expectStringArray(record, "imports", filePath, fieldPath, hint, issues);
  expectStringArray(record, "exports", filePath, fieldPath, hint, issues);
  expectStringArray(record, "symbols", filePath, fieldPath, hint, issues);
  expectBoolean(record, "isTest", filePath, fieldPath, hint, issues);
  expectString(record, "summary", filePath, fieldPath, hint, issues);
  expectStringArray(record, "ownedByNodeIds", filePath, fieldPath, hint, issues);
}

function validateOntologyLevel(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Ontology level", hint, issues);
  if (!record) return;

  expectString(record, "id", filePath, fieldPath, hint, issues);
  expectString(record, "name", filePath, fieldPath, hint, issues);
  expectString(record, "description", filePath, fieldPath, hint, issues);
  expectInteger(record, "rank", filePath, fieldPath, hint, issues, { min: 0 });
  expectStringArray(record, "signals", filePath, fieldPath, hint, issues);
  expectNumber(record, "confidence", filePath, fieldPath, hint, issues, { min: 0, max: 1 });
}

function validateTreeNode(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Tree node", hint, issues);
  if (!record) return;

  expectString(record, "id", filePath, fieldPath, hint, issues);
  expectString(record, "name", filePath, fieldPath, hint, issues);
  expectString(record, "title", filePath, fieldPath, hint, issues);
  expectString(record, "abstractionLevel", filePath, fieldPath, hint, issues);
  expectString(record, "level", filePath, fieldPath, hint, issues);
  expectString(record, "summary", filePath, fieldPath, hint, issues);
  expectOptionalString(record, "explanation", filePath, fieldPath, hint, issues);
  expectOptionalString(record, "reasonForExistence", filePath, fieldPath, hint, issues);
  expectOptionalString(record, "separationLogic", filePath, fieldPath, hint, issues);
  expectOptionalString(record, "parent", filePath, fieldPath, hint, issues);
  expectOptionalString(record, "parentId", filePath, fieldPath, hint, issues);
  expectStringArray(record, "children", filePath, fieldPath, hint, issues);
  expectStringArray(record, "sourceFiles", filePath, fieldPath, hint, issues);
  expectStringArray(record, "ownedFiles", filePath, fieldPath, hint, issues);
  expectStringArray(record, "responsibilities", filePath, fieldPath, hint, issues);
  expectStringArray(record, "dependencies", filePath, fieldPath, hint, issues);
  expectStringArray(record, "dependsOn", filePath, fieldPath, hint, issues);
  expectStringArray(record, "changeLog", filePath, fieldPath, hint, issues);
  expectStringArray(record, "invariants", filePath, fieldPath, hint, issues);
  const changePolicy = expectRecordField(record, "changePolicy", filePath, fieldPath, hint, issues);
  if (changePolicy) {
    expectStringArray(changePolicy, "allowedToChange", filePath, `${fieldPath}.changePolicy`, hint, issues);
    expectStringArray(changePolicy, "mustNotChange", filePath, `${fieldPath}.changePolicy`, hint, issues);
  }
  expectNumber(record, "confidence", filePath, fieldPath, hint, issues, { min: 0, max: 1 });
}

function validateImportGraph(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Import graph", hint, issues);
  if (!record) return;

  validateArrayField(record, "edges", filePath, fieldPath, hint, issues, validateImportGraphEdge);
  validateArrayField(record, "externalImports", filePath, fieldPath, hint, issues, validateExternalImport);
  validateArrayField(record, "unresolvedImports", filePath, fieldPath, hint, issues, validateUnresolvedImport);
  validateArrayField(record, "cycles", filePath, fieldPath, hint, issues, validateImportCycle);
  validateArrayField(record, "workspacePackages", filePath, fieldPath, hint, issues, validateWorkspacePackage);
}

function validateImportGraphEdge(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Import graph edge", hint, issues);
  if (!record) return;

  expectString(record, "from", filePath, fieldPath, hint, issues);
  expectString(record, "to", filePath, fieldPath, hint, issues);
  expectString(record, "specifier", filePath, fieldPath, hint, issues);
  expectEnum(record, "kind", ["relative", "workspace-package"], filePath, fieldPath, hint, issues);
  expectOptionalString(record, "packageName", filePath, fieldPath, hint, issues);
}

function validateExternalImport(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "External import", hint, issues);
  if (!record) return;

  expectString(record, "from", filePath, fieldPath, hint, issues);
  expectString(record, "specifier", filePath, fieldPath, hint, issues);
  expectString(record, "packageName", filePath, fieldPath, hint, issues);
}

function validateUnresolvedImport(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Unresolved import", hint, issues);
  if (!record) return;

  expectString(record, "from", filePath, fieldPath, hint, issues);
  expectString(record, "specifier", filePath, fieldPath, hint, issues);
  expectEnum(record, "kind", ["relative", "workspace-package"], filePath, fieldPath, hint, issues);
  expectOptionalString(record, "packageName", filePath, fieldPath, hint, issues);
  expectString(record, "reason", filePath, fieldPath, hint, issues);
}

function validateImportCycle(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Import cycle", hint, issues);
  if (!record) return;

  expectStringArray(record, "files", filePath, fieldPath, hint, issues);
}

function validateWorkspacePackage(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Workspace package", hint, issues);
  if (!record) return;

  expectString(record, "name", filePath, fieldPath, hint, issues);
  expectString(record, "root", filePath, fieldPath, hint, issues);
  expectString(record, "manifestPath", filePath, fieldPath, hint, issues);
  expectOptionalString(record, "entrypoint", filePath, fieldPath, hint, issues);
  expectOptionalStringArray(record, "binCommands", filePath, fieldPath, hint, issues);
  expectOptionalStringArray(record, "scriptNames", filePath, fieldPath, hint, issues);
  expectOptionalStringArray(record, "dependencyPackageNames", filePath, fieldPath, hint, issues);
}

function validateConcept(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Concept", hint, issues);
  if (!record) return;

  expectString(record, "id", filePath, fieldPath, hint, issues);
  expectString(record, "title", filePath, fieldPath, hint, issues);
  expectString(record, "summary", filePath, fieldPath, hint, issues);
  expectStringArray(record, "relatedNodeIds", filePath, fieldPath, hint, issues);
  expectStringArray(record, "relatedFiles", filePath, fieldPath, hint, issues);
  expectStringArray(record, "tags", filePath, fieldPath, hint, issues);
  if ("evidence" in record) {
    validateArrayField(record, "evidence", filePath, fieldPath, hint, issues, validateConceptEvidence);
  }
}

function validateConceptEvidence(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Concept evidence", hint, issues);
  if (!record) return;

  expectEnum(record, "kind", ["path", "symbol", "export", "doc"], filePath, fieldPath, hint, issues);
  expectString(record, "filePath", filePath, fieldPath, hint, issues);
  expectString(record, "value", filePath, fieldPath, hint, issues);
  expectString(record, "term", filePath, fieldPath, hint, issues);
  expectNumber(record, "score", filePath, fieldPath, hint, issues, { min: 0 });
}

function validateInvariant(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Invariant", hint, issues);
  if (!record) return;

  expectString(record, "id", filePath, fieldPath, hint, issues);
  expectString(record, "title", filePath, fieldPath, hint, issues);
  expectString(record, "description", filePath, fieldPath, hint, issues);
  expectStringArray(record, "nodeIds", filePath, fieldPath, hint, issues);
  expectStringArray(record, "filePaths", filePath, fieldPath, hint, issues);
  expectEnum(record, "severity", ["low", "medium", "high"], filePath, fieldPath, hint, issues);
}

function validateChangeRecord(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Change record", hint, issues);
  if (!record) return;

  expectString(record, "id", filePath, fieldPath, hint, issues);
  expectTimestamp(record, "timestamp", filePath, fieldPath, hint, issues);
  expectString(record, "title", filePath, fieldPath, hint, issues);
  expectString(record, "reason", filePath, fieldPath, hint, issues);
  expectStringArray(record, "affectedNodeIds", filePath, fieldPath, hint, issues);
  expectStringArray(record, "filesChanged", filePath, fieldPath, hint, issues);
  expectStringArray(record, "invariantsPreserved", filePath, fieldPath, hint, issues);
  expectEnum(record, "risk", ["low", "medium", "high"], filePath, fieldPath, hint, issues);
}

function validateContextPack(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Context pack", hint, issues);
  if (!record) return;

  expectString(record, "id", filePath, fieldPath, hint, issues);
  expectTimestamp(record, "createdAt", filePath, fieldPath, hint, issues);
  expectString(record, "target", filePath, fieldPath, hint, issues);
  expectString(record, "projectSummary", filePath, fieldPath, hint, issues);
  validateArrayField(record, "relevantNodes", filePath, fieldPath, hint, issues, validateTreeNode);
  validateArrayField(record, "relevantFiles", filePath, fieldPath, hint, issues, validateFileSummary);
  validateArrayField(record, "relevantConcepts", filePath, fieldPath, hint, issues, validateConcept);
  validateArrayField(record, "invariants", filePath, fieldPath, hint, issues, validateInvariant);
  validateArrayField(record, "recentChanges", filePath, fieldPath, hint, issues, validateChangeRecord);
  expectStringArray(record, "agentInstructions", filePath, fieldPath, hint, issues);
}

function validateEvaluationReport(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Evaluation report", hint, issues);
  if (!record) return;

  expectTimestamp(record, "timestamp", filePath, fieldPath, hint, issues);
  validateEvaluationCountGroup(record, "tree", ["nodeCount", "orphanNodeCount", "nodesWithoutSummaries", "filesWithoutOwners"], filePath, fieldPath, hint, issues);
  validateOptionalEvaluationExplanationMetrics(record, filePath, fieldPath, hint, issues);
  validateEvaluationNumberGroup(record, "context", ["lastPackCount", "averageFilesPerPack", "averageConceptsPerPack", "possibleOverBroadPacks"], filePath, fieldPath, hint, issues);
  validateEvaluationCountGroup(record, "drift", ["staleFileCount", "missingFileCount"], filePath, fieldPath, hint, issues);
  validateEvaluationCountGroup(record, "runs", ["runReportCount", "successCount", "partialCount", "failedCount", "noOpCount"], filePath, fieldPath, hint, issues);
  if ("changes" in record) {
    const changes = expectRecordField(record, "changes", filePath, fieldPath, hint, issues);
    if (changes) {
      for (const key of ["totalChangeRecordCount", "generatedScanRecordCount", "semanticChangeRecordCount"]) {
        expectInteger(changes, key, filePath, `${fieldPath}.changes`, hint, issues, { min: 0 });
      }
      expectBoolean(changes, "generatedScanReviewNeeded", filePath, `${fieldPath}.changes`, hint, issues);
    }
  }
  validateEvaluationCountGroup(record, "lessons", ["lessonCount", "duplicateLessonCandidates"], filePath, fieldPath, hint, issues);

  const automation = expectRecordField(record, "automation", filePath, fieldPath, hint, issues);
  if (automation) {
    expectBoolean(automation, "runtimeStateIgnored", filePath, `${fieldPath}.automation`, hint, issues);
    expectBoolean(automation, "configValid", filePath, `${fieldPath}.automation`, hint, issues);
  }

  if ("quality" in record) {
    validateEvaluationQuality(record, filePath, fieldPath, hint, issues);
  }

  const evaluationIssues = expectArrayField(record, "issues", filePath, fieldPath, hint, issues);
  if (evaluationIssues) {
    evaluationIssues.forEach((item, index) => validateEvaluationIssue(item, filePath, `${fieldPath}.issues[${index}]`, hint, issues));
  }
}

function validateOptionalEvaluationExplanationMetrics(
  record: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
  hint: string,
  issues: ValidationIssue[]
): void {
  const tree = record.tree;
  if (!objectRecord(tree)) return;
  for (const key of ["nodesWithoutExplanations", "thinExplanationCount"]) {
    expectOptionalInteger(tree, key, filePath, `${fieldPath}.tree`, hint, issues, { min: 0 });
  }
  if ("averageExplanationLength" in tree) {
    expectNumber(tree, "averageExplanationLength", filePath, `${fieldPath}.tree`, hint, issues, { min: 0 });
  }
}

function validateEvaluationQuality(
  record: Record<string, unknown>,
  filePath: string,
  fieldPath: string,
  hint: string,
  issues: ValidationIssue[]
): void {
  const quality = expectRecordField(record, "quality", filePath, fieldPath, hint, issues);
  if (!quality) return;

  const fixture = expectRecordField(quality, "fixture", filePath, `${fieldPath}.quality`, hint, issues);
  if (fixture) {
    expectOptionalString(fixture, "path", filePath, `${fieldPath}.quality.fixture`, hint, issues);
    for (const key of [
      "expectedTreeNodeCount",
      "missingExpectedTreeNodeCount",
      "expectedArchitectureNodeCount",
      "missingExpectedArchitectureNodeCount",
      "expectedConceptCount",
      "missingExpectedConceptCount",
      "expectedInvariantCount",
      "missingExpectedInvariantCount"
    ]) {
      expectInteger(fixture, key, filePath, `${fieldPath}.quality.fixture`, hint, issues, { min: 0 });
    }
    for (const key of [
      "missingExpectedTreeNodeIds",
      "missingExpectedArchitectureNodeIds",
      "missingExpectedConceptIds",
      "missingExpectedInvariantIds"
    ]) {
      expectStringArray(fixture, key, filePath, `${fieldPath}.quality.fixture`, hint, issues);
    }
  }

  const concepts = expectRecordField(quality, "concepts", filePath, `${fieldPath}.quality`, hint, issues);
  if (concepts) {
    for (const key of ["totalConceptCount", "noisyConceptCount", "conceptsWithoutEvidence", "conceptsWithoutRelatedFiles"]) {
      expectInteger(concepts, key, filePath, `${fieldPath}.quality.concepts`, hint, issues, { min: 0 });
    }
    expectStringArray(concepts, "noisyConceptIds", filePath, `${fieldPath}.quality.concepts`, hint, issues);
  }

  validateEvaluationCountGroup(quality, "imports", ["unresolvedImportCount"], filePath, `${fieldPath}.quality`, hint, issues);

  const architecture = expectRecordField(quality, "architecture", filePath, `${fieldPath}.quality`, hint, issues);
  if (architecture) {
    for (const key of ["architectureNodeCount", "architectureCoverableFileCount", "architectureCoveredFileCount"]) {
      expectInteger(architecture, key, filePath, `${fieldPath}.quality.architecture`, hint, issues, { min: 0 });
    }
    expectNumber(architecture, "architectureCoveragePercent", filePath, `${fieldPath}.quality.architecture`, hint, issues, { min: 0, max: 100 });
  }

  const context = expectRecordField(quality, "context", filePath, `${fieldPath}.quality`, hint, issues);
  if (context) {
    for (const key of [
      "evaluatedContextPackCount",
      "expectedContextPackCount",
      "passingExpectedContextPackCount",
      "missingExpectedInclusionCount"
    ]) {
      expectInteger(context, key, filePath, `${fieldPath}.quality.context`, hint, issues, { min: 0 });
    }
    expectStringArray(context, "missingExpectedInclusions", filePath, `${fieldPath}.quality.context`, hint, issues);
  }
}

function validateEvaluationIssue(value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]): void {
  const record = expectRecord(value, filePath, fieldPath, "Evaluation issue", hint, issues);
  if (!record) return;

  expectEnum(record, "severity", ["info", "warning", "error"], filePath, fieldPath, hint, issues);
  expectEnum(record, "area", ["tree", "context", "runs", "changes", "lessons", "automation", "quality"], filePath, fieldPath, hint, issues);
  expectString(record, "message", filePath, fieldPath, hint, issues);
  expectOptionalString(record, "filePath", filePath, fieldPath, hint, issues);
}

function validateEvaluationCountGroup(
  record: Record<string, unknown>,
  field: string,
  keys: string[],
  filePath: string,
  fieldPath: string,
  hint: string,
  issues: ValidationIssue[]
): void {
  const group = expectRecordField(record, field, filePath, fieldPath, hint, issues);
  if (!group) return;
  for (const key of keys) {
    expectInteger(group, key, filePath, `${fieldPath}.${field}`, hint, issues, { min: 0 });
  }
}

function validateEvaluationNumberGroup(
  record: Record<string, unknown>,
  field: string,
  keys: string[],
  filePath: string,
  fieldPath: string,
  hint: string,
  issues: ValidationIssue[]
): void {
  const group = expectRecordField(record, field, filePath, fieldPath, hint, issues);
  if (!group) return;
  for (const key of keys) {
    expectNumber(group, key, filePath, `${fieldPath}.${field}`, hint, issues, { min: 0 });
  }
}

function validateArrayValue(
  value: unknown,
  filePath: string,
  fieldPath: string,
  hint: string,
  validateItem: (value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]) => void
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(value)) {
    issues.push(runtimeIssue(filePath, fieldPath, "Expected a JSON array.", hint));
    return issues;
  }
  value.forEach((item, index) => validateItem(item, filePath, `${fieldPath}[${index}]`, hint, issues));
  return issues;
}

function validateArrayField(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  hint: string,
  issues: ValidationIssue[],
  validateItem: (value: unknown, filePath: string, fieldPath: string, hint: string, issues: ValidationIssue[]) => void
): void {
  const value = expectArrayField(record, field, filePath, fieldPath, hint, issues);
  if (!value) return;
  value.forEach((item, index) => validateItem(item, filePath, `${fieldPath}.${field}[${index}]`, hint, issues));
}

function expectRecord(
  value: unknown,
  filePath: string,
  fieldPath: string,
  label: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): Record<string, unknown> | undefined {
  if (objectRecord(value)) return value;
  issues.push(runtimeIssue(filePath, fieldPath, `${label} must be a JSON object.`, recoveryHint));
  return undefined;
}

function expectRecordField(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): Record<string, unknown> | undefined {
  const value = record[field];
  const path = `${fieldPath}.${field}`;
  if (objectRecord(value)) return value;
  issues.push(runtimeIssue(filePath, path, `Expected ${field} to be a JSON object.`, recoveryHint));
  return undefined;
}

function expectArrayField(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): unknown[] | undefined {
  const value = record[field];
  const path = `${fieldPath}.${field}`;
  if (Array.isArray(value)) return value;
  issues.push(runtimeIssue(filePath, path, `Expected ${field} to be a JSON array.`, recoveryHint));
  return undefined;
}

function expectString(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[],
  options: { allowEmpty?: boolean } = {}
): void {
  const value = record[field];
  if (typeof value === "string" && (options.allowEmpty || value.trim().length > 0)) return;
  issues.push(runtimeIssue(filePath, `${fieldPath}.${field}`, `Expected ${field} to be a ${options.allowEmpty ? "" : "non-empty "}string.`, recoveryHint));
}

function expectOptionalString(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  if (!(field in record) || record[field] === undefined) return;
  expectString(record, field, filePath, fieldPath, recoveryHint, issues, { allowEmpty: true });
}

function expectStringArray(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  const value = record[field];
  const path = `${fieldPath}.${field}`;
  if (!Array.isArray(value)) {
    issues.push(runtimeIssue(filePath, path, `Expected ${field} to be an array of strings.`, recoveryHint));
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push(runtimeIssue(filePath, `${path}[${index}]`, `Expected ${field}[${index}] to be a string.`, recoveryHint));
    }
  });
}

function expectOptionalStringArray(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  if (!(field in record) || record[field] === undefined) return;
  expectStringArray(record, field, filePath, fieldPath, recoveryHint, issues);
}

function expectTimestamp(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  const value = record[field];
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return;
  issues.push(runtimeIssue(filePath, `${fieldPath}.${field}`, `Expected ${field} to be a valid timestamp string.`, recoveryHint));
}

function expectBoolean(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  if (typeof record[field] === "boolean") return;
  issues.push(runtimeIssue(filePath, `${fieldPath}.${field}`, `Expected ${field} to be a boolean.`, recoveryHint));
}

function expectOptionalBoolean(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  if (!(field in record) || record[field] === undefined) return;
  expectBoolean(record, field, filePath, fieldPath, recoveryHint, issues);
}

function expectEnum(
  record: Record<string, unknown>,
  field: string,
  values: readonly string[],
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  if (typeof record[field] === "string" && values.includes(record[field] as string)) return;
  issues.push(runtimeIssue(filePath, `${fieldPath}.${field}`, `Expected ${field} to be one of: ${values.join(", ")}.`, recoveryHint));
}

function expectOptionalEnum(
  record: Record<string, unknown>,
  field: string,
  values: readonly string[],
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[]
): void {
  if (!(field in record) || record[field] === undefined) return;
  expectEnum(record, field, values, filePath, fieldPath, recoveryHint, issues);
}

function expectInteger(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[],
  options: { min?: number; max?: number } = {}
): void {
  const value = record[field];
  if (typeof value === "number" && Number.isInteger(value) && inRange(value, options)) return;
  issues.push(runtimeIssue(filePath, `${fieldPath}.${field}`, `Expected ${field} to be an integer${rangeLabel(options)}.`, recoveryHint));
}

function expectOptionalInteger(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[],
  options: { min?: number; max?: number } = { min: 0 }
): void {
  if (!(field in record) || record[field] === undefined) return;
  expectInteger(record, field, filePath, fieldPath, recoveryHint, issues, options);
}

function expectNumber(
  record: Record<string, unknown>,
  field: string,
  filePath: string,
  fieldPath: string,
  recoveryHint: string,
  issues: ValidationIssue[],
  options: { min?: number; max?: number } = {}
): void {
  const value = record[field];
  if (typeof value === "number" && Number.isFinite(value) && inRange(value, options)) return;
  issues.push(runtimeIssue(filePath, `${fieldPath}.${field}`, `Expected ${field} to be a finite number${rangeLabel(options)}.`, recoveryHint));
}

function inRange(value: number, options: { min?: number; max?: number }): boolean {
  if (options.min !== undefined && value < options.min) return false;
  if (options.max !== undefined && value > options.max) return false;
  return true;
}

function rangeLabel(options: { min?: number; max?: number }): string {
  if (options.min !== undefined && options.max !== undefined) return ` between ${options.min} and ${options.max}`;
  if (options.min !== undefined) return ` greater than or equal to ${options.min}`;
  if (options.max !== undefined) return ` less than or equal to ${options.max}`;
  return "";
}

function runtimeIssue(
  filePath: string,
  fieldPath: string,
  message: string,
  recoveryHint: string,
  severity: ValidationIssue["severity"] = "error"
): ValidationIssue {
  return { severity, filePath, fieldPath, message, recoveryHint };
}

function prefixIssues(issues: ValidationIssue[], prefix: string): ValidationIssue[] {
  return issues.map(issue => ({
    ...issue,
    fieldPath: prefixFieldPath(issue.fieldPath, prefix)
  }));
}

function prefixFieldPath(fieldPath: string | undefined, prefix: string): string {
  if (!fieldPath || fieldPath === "$") return prefix;
  if (fieldPath.startsWith("$.")) return `${prefix}.${fieldPath.slice(2)}`;
  if (fieldPath.startsWith("$[")) return `${prefix}${fieldPath.slice(1)}`;
  return `${prefix}.${fieldPath}`;
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareVersions(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function semverParts(value: string): number[] | undefined {
  const parts = value.split(".").map(part => Number(part));
  return parts.every(part => Number.isInteger(part) && part >= 0) ? parts : undefined;
}
