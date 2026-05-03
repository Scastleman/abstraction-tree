import type { AbstractionOntologyLevel, FileSummary, TreeNode, ValidationIssue } from "./schema.js";

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

    if (fileSignature(stored) !== fileSignature(current)) {
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

function fileSignature(file: FileSummary): string {
  return JSON.stringify({
    language: file.language,
    sizeBytes: file.sizeBytes,
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
