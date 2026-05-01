export interface AbstractionOntologyLevel {
  id: string;
  name: string;
  description: string;
  rank: number;
  signals: string[];
  confidence: number;
}

export interface FileSummary {
  path: string;
  language: string;
  lines: number;
  imports: string[];
  symbols: string[];
  isTest: boolean;
  summary: string;
  ownedByNodeIds: string[];
}

export interface TreeNode {
  id: string;
  name?: string;
  title: string;
  abstractionLevel?: string;
  level: string;
  summary: string;
  children: string[];
  parent?: string;
  parentId?: string;
  sourceFiles?: string[];
  ownedFiles: string[];
  responsibilities?: string[];
  dependencies?: string[];
  dependsOn: string[];
  changeLog?: string[];
  invariants: string[];
  confidence: number;
}

export interface Concept { id: string; title: string; summary: string; relatedFiles: string[]; tags: string[]; }
export interface Invariant { id: string; title: string; description: string; severity: string; }
export interface ChangeRecord { id: string; timestamp: string; title: string; reason: string; risk: string; filesChanged: string[]; affectedNodeIds: string[]; }
export interface State { config: { projectName: string }; ontology: AbstractionOntologyLevel[]; nodes: TreeNode[]; files: FileSummary[]; concepts: Concept[]; invariants: Invariant[]; changes: ChangeRecord[]; }
