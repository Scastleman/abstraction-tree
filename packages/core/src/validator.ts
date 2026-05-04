import type { AbstractionOntologyLevel, ChangeRecord, Concept, FileSummary, Invariant, TreeNode, ValidationIssue } from "./schema.js";

export function validateTree(nodes: TreeNode[], files: FileSummary[], ontology: AbstractionOntologyLevel[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filePaths = new Set(files.map(f => f.path));
  const nodeIds = new Set(nodes.map(n => n.id));
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const ontologyIds = new Set(ontology.map(level => level.id));

  for (const id of findDuplicateNodeIds(nodes)) {
    issues.push({ severity: "error", nodeId: id, message: `Tree contains duplicate node id ${id}.` });
  }
  for (const path of findDuplicateFilePaths(files)) {
    issues.push({ severity: "error", filePath: path, message: `File memory contains duplicate path ${path}.` });
  }
  for (const id of findDuplicateOntologyLevelIds(ontology)) {
    issues.push({ severity: "error", message: `Ontology contains duplicate level id ${id}.` });
  }
  for (const name of findDuplicateOntologyLevelNames(ontology)) {
    issues.push({ severity: "error", message: `Ontology contains duplicate level name ${name}.` });
  }
  issues.push(...validateOntologyRankShape(ontology));
  issues.push(...validateOntologyConfidence(ontology));

  for (const n of nodes) {
    if (!n.id) issues.push({ severity: "error", message: "Node is missing id." });
    if (!nodeName(n)) issues.push({ severity: "error", nodeId: n.id, message: "Node is missing name/title." });
    if (!nodeLevel(n)) issues.push({ severity: "error", nodeId: n.id, message: "Node is missing abstraction level." });
    if (ontologyIds.size && !ontologyIds.has(nodeLevel(n))) {
      issues.push({ severity: "warning", nodeId: n.id, message: `Node uses abstraction level outside ontology: ${nodeLevel(n)}.` });
    }
    const parent = nodeParent(n);
    if (parent && !nodeIds.has(parent)) {
      issues.push({ severity: "error", nodeId: n.id, message: `Node references missing parent ${parent}.` });
    }
    if (parent && nodeById.has(parent) && !nodeById.get(parent)?.children.includes(n.id)) {
      issues.push({ severity: "error", nodeId: n.id, message: `Node parent/children mismatch: parent ${parent} does not list ${n.id} as a child.` });
    }
    for (const child of n.children ?? []) {
      if (!nodeIds.has(child)) issues.push({ severity: "error", nodeId: n.id, message: `Node references missing child ${child}.` });
      const childNode = nodeById.get(child);
      if (childNode && nodeParent(childNode) !== n.id) {
        issues.push({ severity: "error", nodeId: n.id, message: `Node parent/children mismatch: child ${child} declares parent ${nodeParent(childNode) ?? "none"}.` });
      }
    }
    for (const f of nodeFiles(n)) {
      if (!filePaths.has(f)) issues.push({ severity: "warning", nodeId: n.id, filePath: f, message: `Node owns file that no longer exists: ${f}.` });
    }
  }

  for (const f of files) {
    if (!f.ownedByNodeIds.length) {
      issues.push({ severity: "warning", filePath: f.path, message: "File is not owned by any tree node." });
    }
  }

  issues.push(...detectParentCycles(nodes, nodeById));

  const roots = nodes.filter(n => !nodeParent(n));
  if (nodes.length && roots.length !== 1) {
    issues.push({ severity: "error", message: `Tree must have exactly one root node; found ${roots.length}.` });
  }
  if (ontology.length) {
    const ranks = ontology.map(level => level.rank);
    if (new Set(ranks).size !== ranks.length) {
      issues.push({ severity: "error", message: "Ontology levels must have unique ranks." });
    }
    for (const level of ontology) {
      if (!level.id || !level.name) issues.push({ severity: "error", message: "Ontology level is missing id or name." });
    }
  }

  return issues;
}

export function detectFileDrift(storedFiles: FileSummary[], currentFiles: FileSummary[], nodes: TreeNode[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const storedByPath = new Map(storedFiles.map(f => [f.path, f]));
  const currentByPath = new Map(currentFiles.map(f => [f.path, f]));

  for (const current of currentFiles) {
    if (!storedByPath.has(current.path)) {
      issues.push({
        severity: "warning",
        filePath: current.path,
        message: "File is missing from abstraction memory. Run `atree scan` to add it."
      });
    }
  }

  for (const stored of storedFiles) {
    const current = currentByPath.get(stored.path);
    if (!current) {
      issues.push({
        severity: "warning",
        filePath: stored.path,
        message: "File exists in abstraction memory but is no longer present on disk."
      });
      continue;
    }

    if (hasFileDrift(stored, current)) {
      issues.push({
        severity: "warning",
        filePath: stored.path,
        message: "File changed since the last scan; summaries, symbols, or node ownership may be stale."
      });
    }
  }

  for (const node of nodes) {
    for (const filePath of nodeFiles(node)) {
      if (!currentByPath.has(filePath)) {
        issues.push({
          severity: "warning",
          nodeId: node.id,
          filePath,
          message: `Node owns file that is not present in the current source tree: ${filePath}.`
        });
      }
    }
  }

  return dedupeIssues(issues);
}

export function validateConcepts(
  concepts: Concept[],
  nodes?: TreeNode[],
  files?: FileSummary[],
  knownFilePaths: string[] = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = findDuplicateConceptIds(concepts).map(id => ({
    severity: "error",
    message: `Concept memory contains duplicate concept id ${id}.`
  }));

  const nodeIds = nodes ? new Set(nodes.map(node => node.id)) : undefined;
  const filePaths = files ? new Set([...files.map(file => file.path), ...knownFilePaths]) : undefined;

  for (const concept of concepts) {
    if (nodeIds) {
      for (const nodeId of concept.relatedNodeIds ?? []) {
        if (!nodeIds.has(nodeId)) {
          issues.push({
            severity: "error",
            nodeId,
            message: `Concept ${concept.id} references missing tree node ${nodeId}.`
          });
        }
      }
    }

    if (filePaths) {
      for (const filePath of concept.relatedFiles ?? []) {
        if (!filePaths.has(filePath)) {
          issues.push({
            severity: "error",
            filePath,
            message: `Concept ${concept.id} references missing file ${filePath}.`
          });
        }
      }
    }
  }

  return issues;
}

export function validateInvariants(
  invariants: Invariant[],
  nodes?: TreeNode[],
  files?: FileSummary[],
  knownFilePaths: string[] = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = findDuplicateInvariantIds(invariants).map(id => ({
    severity: "error",
    message: `Invariant memory contains duplicate invariant id ${id}.`
  }));

  const nodeIds = nodes ? new Set(nodes.map(node => node.id)) : undefined;
  const filePaths = files ? new Set([...files.map(file => file.path), ...knownFilePaths]) : undefined;

  for (const invariant of invariants) {
    if (nodeIds) {
      for (const nodeId of invariant.nodeIds ?? []) {
        if (!nodeIds.has(nodeId)) {
          issues.push({
            severity: "error",
            nodeId,
            message: `Invariant ${invariant.id} references missing tree node ${nodeId}.`
          });
        }
      }
    }

    if (filePaths) {
      for (const filePath of invariant.filePaths ?? []) {
        if (!filePaths.has(filePath)) {
          issues.push({
            severity: "error",
            filePath,
            message: `Invariant ${invariant.id} references missing file ${filePath}.`
          });
        }
      }
    }
  }

  if (nodes) {
    const invariantIds = new Set(invariants.map(invariant => invariant.id));
    for (const node of nodes) {
      for (const invariantId of node.invariants ?? []) {
        if (!invariantIds.has(invariantId)) {
          issues.push({
            severity: "error",
            nodeId: node.id,
            message: `Node ${node.id} references missing invariant ${invariantId}.`
          });
        }
      }
    }
  }

  return issues;
}

export function validateChanges(
  changes: unknown[],
  nodes?: TreeNode[],
  files?: FileSummary[],
  invariants?: Invariant[],
  knownFilePaths: string[] = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = findDuplicateChangeIds(changes).map(id => ({
    severity: "error",
    message: `Change records contain duplicate change id ${id}.`
  }));
  issues.push(...validateChangeRecordShapes(changes));

  const nodeIds = nodes ? new Set(nodes.map(node => node.id)) : undefined;
  const filePaths = files ? new Set([...files.map(file => file.path), ...knownFilePaths]) : undefined;
  const invariantIds = invariants ? new Set(invariants.map(invariant => invariant.id)) : undefined;

  for (const change of changes) {
    const record = objectRecord(change);
    if (!record) continue;
    const changeId = stringValue(record.id) ?? "(missing id)";

    if (nodeIds) {
      for (const nodeId of stringArrayValue(record.affectedNodeIds)) {
        if (!nodeIds.has(nodeId)) {
          issues.push({
            severity: "error",
            nodeId,
            message: `Change record ${changeId} references missing tree node ${nodeId}.`
          });
        }
      }
    }

    if (filePaths) {
      for (const filePath of stringArrayValue(record.filesChanged)) {
        if (!filePaths.has(filePath)) {
          issues.push({
            severity: "warning",
            filePath,
            message: `Change record ${changeId} references missing file ${filePath}.`
          });
        }
      }
    }

    if (invariantIds) {
      for (const invariantId of stringArrayValue(record.invariantsPreserved)) {
        if (!invariantIds.has(invariantId)) {
          issues.push({
            severity: "error",
            message: `Change record ${changeId} references missing invariant ${invariantId}.`
          });
        }
      }
    }
  }

  return issues;
}

function nodeName(node: TreeNode): string {
  return node.name ?? node.title;
}

function nodeLevel(node: TreeNode): string {
  return node.abstractionLevel ?? node.level;
}

function nodeParent(node: TreeNode): string | undefined {
  return node.parent ?? node.parentId;
}

function nodeFiles(node: TreeNode): string[] {
  return node.sourceFiles ?? node.ownedFiles ?? [];
}

function findDuplicateNodeIds(nodes: TreeNode[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const node of nodes) {
    if (!node.id) continue;
    if (seen.has(node.id)) duplicates.add(node.id);
    seen.add(node.id);
  }

  return [...duplicates].sort();
}

function findDuplicateFilePaths(files: FileSummary[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const file of files) {
    if (!file.path) continue;
    if (seen.has(file.path)) duplicates.add(file.path);
    seen.add(file.path);
  }

  return [...duplicates].sort();
}

function findDuplicateOntologyLevelIds(ontology: AbstractionOntologyLevel[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const level of ontology) {
    if (!level.id) continue;
    if (seen.has(level.id)) duplicates.add(level.id);
    seen.add(level.id);
  }

  return [...duplicates].sort();
}

function findDuplicateOntologyLevelNames(ontology: AbstractionOntologyLevel[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const level of ontology) {
    const name = level.name?.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = seen.get(key);
    if (existing) duplicates.add(existing);
    else seen.set(key, name);
  }

  return [...duplicates].sort();
}

function findDuplicateConceptIds(concepts: Concept[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const concept of concepts) {
    if (!concept.id) continue;
    if (seen.has(concept.id)) duplicates.add(concept.id);
    seen.add(concept.id);
  }

  return [...duplicates].sort();
}

function findDuplicateInvariantIds(invariants: Invariant[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const invariant of invariants) {
    if (!invariant.id) continue;
    if (seen.has(invariant.id)) duplicates.add(invariant.id);
    seen.add(invariant.id);
  }

  return [...duplicates].sort();
}

function findDuplicateChangeIds(changes: unknown[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const change of changes) {
    const record = objectRecord(change);
    const id = record ? stringValue(record.id) : undefined;
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  return [...duplicates].sort();
}

function validateChangeRecordShapes(changes: unknown[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const arrayFields = ["affectedNodeIds", "filesChanged", "invariantsPreserved"] as const;

  changes.forEach((change, index) => {
    const record = objectRecord(change);
    if (!record) {
      issues.push({
        severity: "error",
        message: `Change record at index ${index} must be an object.`
      });
      return;
    }

    const label = changeRecordLabel(record, index);
    if (!stringValue(record.id)) {
      issues.push({ severity: "error", message: `Change record at index ${index} is missing a non-empty id.` });
    }
    if (!isValidTimestamp(record.timestamp)) {
      issues.push({ severity: "error", message: `Change record ${label} must use a valid timestamp.` });
    }
    if (!stringValue(record.title)) {
      issues.push({ severity: "error", message: `Change record ${label} is missing a non-empty title.` });
    }
    if (!stringValue(record.reason)) {
      issues.push({ severity: "error", message: `Change record ${label} is missing a non-empty reason.` });
    }
    if (!["low", "medium", "high"].includes(String(record.risk))) {
      issues.push({ severity: "error", message: `Change record ${label} must use risk low, medium, or high.` });
    }

    for (const field of arrayFields) {
      const value = record[field];
      if (!Array.isArray(value)) {
        issues.push({ severity: "error", message: `Change record ${label} must use a string array for ${field}.` });
        continue;
      }
      if (value.some(item => typeof item !== "string")) {
        issues.push({ severity: "error", message: `Change record ${label} must contain only strings in ${field}.` });
      }
    }
  });

  return issues;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isValidTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function changeRecordLabel(record: Record<string, unknown>, index: number): string {
  return stringValue(record.id) ?? `at index ${index}`;
}

function validateOntologyRankShape(ontology: AbstractionOntologyLevel[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let hasInvalidRank = false;

  for (const level of ontology) {
    const rank = level.rank;
    if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 0) {
      hasInvalidRank = true;
      issues.push({
        severity: "error",
        message: `Ontology level ${ontologyLevelLabel(level)} must use a non-negative integer rank.`
      });
    }
  }

  if (hasInvalidRank) return issues;

  const ranks = ontology.map(level => level.rank);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
  if (uniqueRanks.length !== ontology.length) return issues;

  const isContiguousFromRoot = uniqueRanks.every((rank, index) => rank === index);
  if (!isContiguousFromRoot) {
    issues.push({
      severity: "error",
      message: `Ontology ranks must be contiguous from 0; found ranks ${uniqueRanks.join(", ")}.`
    });
  }

  return issues;
}

function ontologyLevelLabel(level: AbstractionOntologyLevel): string {
  return level.id || level.name || "(missing id)";
}

function validateOntologyConfidence(ontology: AbstractionOntologyLevel[]): ValidationIssue[] {
  return ontology.flatMap(level => {
    const confidence = level.confidence;
    if (typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1) {
      return [];
    }
    return [{
      severity: "error",
      message: `Ontology level ${ontologyLevelLabel(level)} must use a confidence between 0 and 1.`
    }];
  });
}

function detectParentCycles(nodes: TreeNode[], nodeById: Map<string, TreeNode>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const reported = new Set<string>();

  for (const start of nodes) {
    const seen = new Map<string, number>();
    const path: string[] = [];
    let current: TreeNode | undefined = start;

    while (current) {
      const cycleStart = seen.get(current.id);
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart);
        const key = cycleKey(cycle);
        if (!reported.has(key)) {
          reported.add(key);
          issues.push({
            severity: "error",
            nodeId: current.id,
            message: `Tree contains parent cycle: ${[...cycle, cycle[0]].join(" -> ")}.`
          });
        }
        break;
      }

      seen.set(current.id, path.length);
      path.push(current.id);
      const parent = nodeParent(current);
      current = parent ? nodeById.get(parent) : undefined;
    }
  }

  return issues;
}

function cycleKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

function hasFileDrift(stored: FileSummary, current: FileSummary): boolean {
  if (stored.contentHash && current.contentHash) {
    return stored.contentHash !== current.contentHash;
  }

  return legacyFileSignature(stored) !== legacyFileSignature(current);
}

function legacyFileSignature(file: FileSummary): string {
  return JSON.stringify({
    language: file.language,
    lines: file.lines,
    imports: normalized(file.imports),
    exports: normalized(file.exports),
    symbols: normalized(file.symbols),
    isTest: file.isTest
  });
}

function normalized(values: string[] = []): string[] {
  return [...values].sort();
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = [issue.severity, issue.nodeId ?? "", issue.filePath ?? "", issue.message].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
