export type AbstractionLevel = string;

export const TREE_NODE_THIN_EXPLANATION_CHAR_THRESHOLD = 160;

export interface AbstractionOntologyLevel {
  id: AbstractionLevel;
  name: string;
  description: string;
  rank: number;
  signals: string[];
  confidence: number;
}

export type InstallMode = "core" | "full";

export interface MissionPlanningConfig {
  docsPatterns?: string[];
  testPatterns?: string[];
  buildPatterns?: string[];
  docsCommands?: string[];
  testCommands?: string[];
  buildCommands?: string[];
  validationCommands?: string[];
  scanCommands?: string[];
}

export interface ImportAliasPattern {
  find: string;
  replacement: string;
  source?: string;
  configPath?: string;
}

export type ConceptEvidenceKind = "path" | "symbol" | "export" | "doc";

export interface SubsystemPatternConfig {
  id: string;
  title: string;
  summary?: string;
  paths?: string[];
  fileNames?: string[];
  imports?: string[];
  symbols?: string[];
  extensions?: string[];
  responsibilities?: string[];
  priority?: number;
  weight?: number;
  minimumMatches?: number;
}

export interface DomainVocabularyMapping {
  concept: string;
  synonyms: string[];
  weight?: number;
}

export type ConceptSignalWeightsConfig = Partial<Record<ConceptEvidenceKind, number>>;

export interface AtreeConfig {
  version: string;
  projectName: string;
  createdAt: string;
  sourceRoot: string;
  ignored: string[];
  respectGitignore?: boolean;
  treeBuilder: "deterministic" | "llm";
  abstractionOntology?: AbstractionOntologyLevel[];
  missionPlanning?: MissionPlanningConfig;
  importAliases?: ImportAliasPattern[];
  subsystemPatterns?: SubsystemPatternConfig[];
  domainVocabulary?: DomainVocabularyMapping[];
  conceptSignalWeights?: ConceptSignalWeightsConfig;
  installMode: InstallMode;
  visualApp: {
    enabled: boolean;
    defaultPort: number;
  };
}

export interface AtreeConfigOverride extends Partial<Omit<AtreeConfig, "visualApp">> {
  visualApp?: Partial<AtreeConfig["visualApp"]>;
}

export interface FileSummary {
  path: string;
  extension: string;
  language: string;
  parseStrategy?: "typescript-ast" | "regex";
  contentHash?: string;
  sizeBytes: number;
  lines: number;
  imports: string[];
  exports: string[];
  symbols: string[];
  isTest: boolean;
  summary: string;
  ownedByNodeIds: string[];
}

export interface TreeNode {
  id: string;
  name: string;
  title: string;
  abstractionLevel: AbstractionLevel;
  level: AbstractionLevel;
  summary: string;
  explanation?: string;
  reasonForExistence?: string;
  separationLogic?: string;
  parent?: string;
  children: string[];
  parentId?: string;
  sourceFiles: string[];
  ownedFiles: string[];
  responsibilities: string[];
  dependencies: string[];
  dependsOn: string[];
  changeLog: string[];
  invariants: string[];
  changePolicy: {
    allowedToChange: string[];
    mustNotChange: string[];
  };
  confidence: number;
}

export type ImportGraphEdgeKind = "relative" | "workspace-package" | "alias";

export interface WorkspacePackage {
  name: string;
  root: string;
  manifestPath: string;
  entrypoint?: string;
  binCommands?: string[];
  scriptNames?: string[];
  dependencyPackageNames?: string[];
}

export interface ImportGraphEdge {
  from: string;
  to: string;
  specifier: string;
  kind: ImportGraphEdgeKind;
  packageName?: string;
  aliasSource?: string;
}

export interface ExternalImport {
  from: string;
  specifier: string;
  packageName: string;
}

export interface UnresolvedImport {
  from: string;
  specifier: string;
  kind: ImportGraphEdgeKind;
  packageName?: string;
  aliasSource?: string;
  reason: string;
}

export interface ImportCycle {
  files: string[];
}

export interface ImportGraph {
  edges: ImportGraphEdge[];
  externalImports: ExternalImport[];
  unresolvedImports: UnresolvedImport[];
  cycles: ImportCycle[];
  workspacePackages: WorkspacePackage[];
}

export interface ConceptEvidence {
  kind: ConceptEvidenceKind;
  filePath: string;
  value: string;
  term: string;
  score: number;
}

export interface Concept {
  id: string;
  title: string;
  summary: string;
  relatedNodeIds: string[];
  relatedFiles: string[];
  tags: string[];
  evidence: ConceptEvidence[];
}

export interface Invariant {
  id: string;
  title: string;
  description: string;
  nodeIds: string[];
  filePaths: string[];
  severity: "low" | "medium" | "high";
}

export interface ChangeRecord {
  id: string;
  timestamp: string;
  title: string;
  reason: string;
  affectedNodeIds: string[];
  filesChanged: string[];
  invariantsPreserved: string[];
  risk: "low" | "medium" | "high";
}

export interface AgentHealth {
  latestRun?: {
    file: string;
    timestamp?: string;
    task?: string;
    result?: "success" | "partial" | "failed" | "no-op" | "unknown";
  };
  latestEvaluation?: {
    file: string;
    timestamp?: string;
    issueCount?: number;
    staleFileCount?: number;
    missingFileCount?: number;
  };
  validation?: {
    issueCount: number;
    errorCount: number;
    warningCount: number;
  };
  automation?: {
    loopsToday?: number;
    maxLoopsToday?: number;
    failedLoopsToday?: number;
    maxFailedLoops?: number;
    maxMinutesToday?: number;
    maxDiffLines?: number;
    stopRequested?: boolean;
    currentMission?: string;
    completedMissions?: number;
    failedMissions?: number;
  };
  scope?: {
    file: string;
    prompt: string;
    status: "draft" | "needs-clarification" | "ready" | "clean" | "warning" | "blocked";
    requiresClarification?: boolean;
    affectedNodeCount?: number;
    allowedFileCount?: number;
    violationCount?: number;
    checkedAt?: string;
  };
}

export type WorkflowStageId = "analysis" | "planning" | "execution" | "review";
export type WorkflowStageStatus = "complete" | "pending" | "warning" | "blocked";
export type WorkflowReferenceKind =
  | "goal"
  | "mission"
  | "report"
  | "json"
  | "markdown"
  | "context-pack"
  | "scope"
  | "tree-node"
  | "file"
  | "concept"
  | "invariant"
  | "area"
  | "check";

export interface WorkflowReference {
  label: string;
  path: string;
  kind: WorkflowReferenceKind;
  targetId?: string;
}

export interface MissionPlanStageView {
  id: WorkflowStageId;
  title: string;
  status: WorkflowStageStatus;
  summary: string;
  actions: string[];
  contextPacks: WorkflowReference[];
  evidence: WorkflowReference[];
}

export interface MissionPlanItemView {
  id: string;
  title: string;
  priority?: string;
  risk?: string;
  dependsOn: string[];
  affectedAreas: string[];
  successChecks: string[];
  evidence: WorkflowReference[];
}

export interface GoalWorkspaceStats {
  affectedFileCount: number;
  affectedNodeCount: number;
  affectedConceptCount: number;
  invariantCount: number;
  plannedTaskCount: number;
  unresolvedItemCount: number;
  checkCount: number;
  failedCheckCount: number;
}

export interface GoalWorkspaceView {
  id: string;
  title: string;
  status: string;
  mode?: string;
  createdAt?: string;
  workspacePath: string;
  goalPath?: string;
  missionDirPath?: string;
  summary: string;
  stats: GoalWorkspaceStats;
  reports: WorkflowReference[];
  missionStages: MissionPlanStageView[];
  missions: MissionPlanItemView[];
  scopeReviewId?: string;
  coherenceReviewId?: string;
  score?: number;
}

export type ScopeSelectionKind = "concept" | "file" | "invariant" | "node" | "area" | "check";
export type ScopeSelectionStatus = "selected" | "excluded" | "questionable";
export type ScopeSelectionImpact = "low" | "medium" | "high";

export interface ScopeSelectionItem {
  id: string;
  label: string;
  kind: ScopeSelectionKind;
  status: ScopeSelectionStatus;
  impact: ScopeSelectionImpact;
  reason: string;
  evidence?: WorkflowReference;
}

export interface ScopeReviewStats {
  selectedCount: number;
  excludedCount: number;
  questionableCount: number;
  violationCount: number;
  affectedNodeCount: number;
  allowedFileCount: number;
}

export interface ScopeReviewView {
  id: string;
  status: string;
  file: string;
  prompt?: string;
  createdAt?: string;
  checkedAt?: string;
  workspaceId?: string;
  summary: string;
  stats: ScopeReviewStats;
  selections: ScopeSelectionItem[];
  violations: ScopeSelectionItem[];
  evidence: WorkflowReference[];
}

export interface CoherenceFindingView {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}

export interface CoherenceReviewView {
  id: string;
  status: string;
  file: string;
  workspaceId?: string;
  createdAt?: string;
  summary: string;
  findings: CoherenceFindingView[];
  evidence: WorkflowReference[];
}

export interface ContextPackView {
  id: string;
  target: string;
  file: string;
  createdAt?: string;
  stats: {
    nodes: number;
    files: number;
    concepts: number;
    invariants: number;
    changes: number;
    selectedDiagnostics?: number;
    excludedDiagnostics?: number;
    estimatedTokens?: number;
  };
}

export interface WorkflowViewState {
  goalWorkspaces: GoalWorkspaceView[];
  scopeReviews: ScopeReviewView[];
  coherenceReviews: CoherenceReviewView[];
  contextPacks: ContextPackView[];
}

export interface AbstractionTreeState {
  config: AtreeConfig;
  ontology: AbstractionOntologyLevel[];
  nodes: TreeNode[];
  files: FileSummary[];
  importGraph: ImportGraph;
  concepts: Concept[];
  invariants: Invariant[];
  changes: ChangeRecord[];
  agentHealth: AgentHealth;
  workflow?: WorkflowViewState;
}

export type ContextSelectionKind = "node" | "file" | "concept" | "invariant" | "change";

export interface ContextSelectionDiagnostic {
  kind: ContextSelectionKind;
  id: string;
  label: string;
  score: number;
  estimatedTokens: number;
  reasons: string[];
  excludedReason?: "hard-limit" | "token-budget";
}

export interface ContextPackDiagnostics {
  tokenEstimator: "approximate-json-chars-div-4";
  budgeted: boolean;
  estimatedTokens: number;
  maxTokens?: number;
  selected: ContextSelectionDiagnostic[];
  excludedNearby: ContextSelectionDiagnostic[];
}

export interface ContextPack {
  id: string;
  createdAt: string;
  target: string;
  projectSummary: string;
  relevantNodes: TreeNode[];
  relevantFiles: FileSummary[];
  relevantConcepts: Concept[];
  invariants: Invariant[];
  recentChanges: ChangeRecord[];
  agentInstructions: string[];
  diagnostics?: ContextPackDiagnostics;
}

export interface ValidationIssue {
  severity: "info" | "warning" | "error";
  message: string;
  nodeId?: string;
  filePath?: string;
  fieldPath?: string;
  recoveryHint?: string;
}
