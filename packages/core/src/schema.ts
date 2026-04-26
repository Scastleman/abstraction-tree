export type AbstractionLevel =
  | "intent"
  | "domain"
  | "architecture"
  | "module"
  | "component"
  | "file"
  | "symbol";

export type InstallMode = "core" | "full";

export interface AtreeConfig {
  version: string;
  projectName: string;
  createdAt: string;
  sourceRoot: string;
  ignored: string[];
  treeBuilder: "deterministic" | "llm";
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
  title: string;
  level: AbstractionLevel;
  summary: string;
  children: string[];
  parentId?: string;
  ownedFiles: string[];
  dependsOn: string[];
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
