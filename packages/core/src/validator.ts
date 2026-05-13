import { TREE_NODE_THIN_EXPLANATION_CHAR_THRESHOLD, type AbstractionOntologyLevel, type ChangeRecord, type Concept, type ContextPack, type FileSummary, type Invariant, type TreeNode, type ValidationIssue } from "./schema.js";

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
  issues.push(...validateNodeConfidence(nodes));
  issues.push(...validateNodeExplanations(nodes));

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
    if (!concept.evidence?.length) {
      issues.push({
        severity: "error",
        message: `Concept ${concept.id || "(missing id)"} is missing extraction evidence.`
      });
    }

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
      for (const filePath of uniqueStrings([
        ...(concept.relatedFiles ?? []),
        ...(concept.evidence ?? []).map(evidence => evidence.filePath)
      ])) {
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

export function validateContextPacks(
  packs: unknown[],
  nodes?: TreeNode[],
  files?: FileSummary[],
  concepts?: Concept[],
  invariants?: Invariant[],
  changes?: unknown[],
  knownFilePaths: string[] = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = findDuplicateContextPackIds(packs).map(id => ({
    severity: "error",
    message: `Context packs contain duplicate context pack id ${id}.`
  }));
  issues.push(...validateContextPackShapes(packs));

  const nodeIds = nodes ? new Set(nodes.map(node => node.id)) : undefined;
  const filePaths = files ? new Set([...files.map(file => file.path), ...knownFilePaths]) : undefined;
  const conceptIds = concepts ? new Set(concepts.map(concept => concept.id)) : undefined;
  const invariantIds = invariants ? new Set(invariants.map(invariant => invariant.id)) : undefined;
  const changeIds = changes ? new Set(changes.map(change => stringValue(objectRecord(change)?.id)).filter((id): id is string => Boolean(id))) : undefined;

  packs.forEach((pack, index) => {
    const record = objectRecord(pack);
    if (!record) return;
    const packId = contextPackLabel(record as Partial<ContextPack>, index);

    if (nodeIds) {
      for (const nodeRef of objectArrayValue(record.relevantNodes)) {
        const nodeId = stringValue(nodeRef.id);
        if (nodeId && !nodeIds.has(nodeId)) {
          issues.push({
            severity: "warning",
            nodeId,
            message: `Context pack ${packId} references missing tree node ${nodeId}.`
          });
        }

        if (filePaths) {
          for (const filePath of nodeFileRefs(nodeRef)) {
            if (!filePaths.has(filePath)) {
              issues.push({
                severity: "warning",
                nodeId,
                filePath,
                message: `Context pack ${packId} includes node ${nodeId ?? "(missing id)"} with missing file ${filePath}.`
              });
            }
          }
        }
      }
    }

    if (filePaths) {
      for (const fileRef of objectArrayValue(record.relevantFiles)) {
        const filePath = stringValue(fileRef.path);
        if (filePath && !filePaths.has(filePath)) {
          issues.push({
            severity: "warning",
            filePath,
            message: `Context pack ${packId} references missing file ${filePath}.`
          });
        }
      }
    }

    if (conceptIds) {
      for (const conceptRef of objectArrayValue(record.relevantConcepts)) {
        const conceptId = stringValue(conceptRef.id);
        if (conceptId && !conceptIds.has(conceptId)) {
          issues.push({
            severity: "warning",
            message: `Context pack ${packId} references missing concept ${conceptId}.`
          });
        }
      }
    }

    if (invariantIds) {
      for (const invariantRef of objectArrayValue(record.invariants)) {
        const invariantId = stringValue(invariantRef.id);
        if (invariantId && !invariantIds.has(invariantId)) {
          issues.push({
            severity: "warning",
            message: `Context pack ${packId} references missing invariant ${invariantId}.`
          });
        }
      }
    }

    if (changeIds) {
      for (const changeRef of objectArrayValue(record.recentChanges)) {
        const changeId = stringValue(changeRef.id);
        if (changeId && !changeIds.has(changeId)) {
          issues.push({
            severity: "warning",
            message: `Context pack ${packId} references missing change record ${changeId}.`
          });
        }
      }
    }
  });

  return dedupeIssues(issues);
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
  const sourceFiles = Array.isArray(node.sourceFiles) ? node.sourceFiles : [];
  return sourceFiles.length ? sourceFiles : Array.isArray(node.ownedFiles) ? node.ownedFiles : [];
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

function findDuplicateContextPackIds(packs: unknown[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const pack of packs) {
    const record = objectRecord(pack);
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

function validateContextPackShapes(packs: unknown[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const objectArrayFields = ["relevantNodes", "relevantFiles", "relevantConcepts", "invariants", "recentChanges"] as const;

  packs.forEach((pack, index) => {
    const record = objectRecord(pack);
    if (!record) {
      issues.push({
        severity: "error",
        message: `Context pack at index ${index} must be an object.`
      });
      return;
    }

    const label = contextPackLabel(record as Partial<ContextPack>, index);
    if (!stringValue(record.id)) {
      issues.push({ severity: "error", message: `Context pack at index ${index} is missing a non-empty id.` });
    }
    if (!isValidTimestamp(record.createdAt)) {
      issues.push({ severity: "error", message: `Context pack ${label} must use a valid createdAt timestamp.` });
    }
    if (!stringValue(record.target)) {
      issues.push({ severity: "error", message: `Context pack ${label} is missing a non-empty target.` });
    }
    if (!stringValue(record.projectSummary)) {
      issues.push({ severity: "error", message: `Context pack ${label} is missing a non-empty projectSummary.` });
    }

    for (const field of objectArrayFields) {
      const value = record[field];
      if (!Array.isArray(value)) {
        issues.push({ severity: "error", message: `Context pack ${label} must use an object array for ${field}.` });
        continue;
      }
      if (value.some(item => !objectRecord(item))) {
        issues.push({ severity: "error", message: `Context pack ${label} must contain only objects in ${field}.` });
      }
    }

    if (!Array.isArray(record.agentInstructions)) {
      issues.push({ severity: "error", message: `Context pack ${label} must use a string array for agentInstructions.` });
    } else if (record.agentInstructions.some(item => typeof item !== "string")) {
      issues.push({ severity: "error", message: `Context pack ${label} must contain only strings in agentInstructions.` });
    }
  });

  return issues;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function objectArrayValue(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Record<string, unknown>[] => {
    const record = objectRecord(item);
    return record ? [record] : [];
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isValidTimestamp(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function changeRecordLabel(record: Record<string, unknown>, index: number): string {
  return stringValue(record.id) ?? `at index ${index}`;
}

function contextPackLabel(record: Partial<ContextPack>, index: number): string {
  return stringValue(record.id) ?? `at index ${index}`;
}

function nodeFileRefs(record: Record<string, unknown>): string[] {
  const sourceFiles = stringArrayValue(record.sourceFiles);
  return sourceFiles.length ? sourceFiles : stringArrayValue(record.ownedFiles);
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

function validateNodeConfidence(nodes: TreeNode[]): ValidationIssue[] {
  return nodes.flatMap(node => {
    const confidence = node.confidence;
    if (typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1) {
      return [];
    }
    return [{
      severity: "error",
      nodeId: node.id,
      message: `Node ${node.id || "(missing id)"} must use a confidence between 0 and 1.`
    }];
  });
}

function validateNodeExplanations(nodes: TreeNode[]): ValidationIssue[] {
  return nodes.flatMap(node => {
    if (!requiresHumanReadableExplanation(node)) return [];
    const explanation = node.explanation?.trim() ?? "";
    if (!explanation) {
      return [{
        severity: "warning" as const,
        nodeId: node.id,
        fieldPath: "explanation",
        message: `High-level node ${node.id || "(missing id)"} is missing a human-readable explanation. Run \`atree scan\` to backfill explanations.`
      }];
    }
    if (explanation.length < TREE_NODE_THIN_EXPLANATION_CHAR_THRESHOLD) {
      return [{
        severity: "warning" as const,
        nodeId: node.id,
        fieldPath: "explanation",
        message: `High-level node ${node.id || "(missing id)"} has a thin explanation (${explanation.length} characters; expected at least ${TREE_NODE_THIN_EXPLANATION_CHAR_THRESHOLD}).`
      }];
    }
    return [];
  });
}

function requiresHumanReadableExplanation(node: TreeNode): boolean {
  const level = nodeLevel(node);
  return (
    node.id.startsWith("project.") ||
    node.id.startsWith("architecture.") ||
    node.id.startsWith("module.") ||
    level === "project-purpose" ||
    level === "system-architecture-layer" ||
    level === "package-module-layer"
  );
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
