export type AbstractionLevel = string;

export interface AbstractionOntologyLevel {
  id: AbstractionLevel;
  name: string;
  description: string;
  rank: number;
  signals: string[];
  confidence: number;
}

export type InstallMode = "core" | "full";

export interface AtreeConfig {
  version: string;
  projectName: string;
  createdAt: string;
  sourceRoot: string;
  ignored: string[];
  treeBuilder: "deterministic" | "llm";
  abstractionOntology?: AbstractionOntologyLevel[];
  installMode: InstallMode;
  visualApp: {
    enabled: boolean;
    defaultPort: number;
  };
}

export interface FileSummary {
  path: string;
  extension: string;
  language: string;
  parseStrategy?: "typescript-ast" | "regex";
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

export interface Concept {
  id: string;
  title: string;
  summary: string;
  relatedNodeIds: string[];
  relatedFiles: string[];
  tags: string[];
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
}

export interface ValidationIssue {
  severity: "info" | "warning" | "error";
  message: string;
  nodeId?: string;
  filePath?: string;
}
