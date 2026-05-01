import type { AbstractionOntologyLevel, FileSummary, TreeNode, ValidationIssue } from "./schema.js";

export function validateTree(nodes: TreeNode[], files: FileSummary[], ontology: AbstractionOntologyLevel[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filePaths = new Set(files.map(f => f.path));
  const nodeIds = new Set(nodes.map(n => n.id));
  const ontologyIds = new Set(ontology.map(level => level.id));

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
    for (const child of n.children ?? []) {
      if (!nodeIds.has(child)) issues.push({ severity: "error", nodeId: n.id, message: `Node references missing child ${child}.` });
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
