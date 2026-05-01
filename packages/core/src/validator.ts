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
