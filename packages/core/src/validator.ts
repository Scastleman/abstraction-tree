import type { FileSummary, TreeNode, ValidationIssue } from "./schema.js";

export function validateTree(nodes: TreeNode[], files: FileSummary[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filePaths = new Set(files.map(f => f.path));
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const n of nodes) {
    for (const child of n.children) {
      if (!nodeIds.has(child)) issues.push({ severity: "error", nodeId: n.id, message: `Node references missing child ${child}.` });
    }
    for (const f of n.ownedFiles) {
      if (!filePaths.has(f)) issues.push({ severity: "warning", nodeId: n.id, filePath: f, message: `Node owns file that no longer exists: ${f}.` });
    }
  }

  for (const f of files) {
    if (!f.ownedByNodeIds.length) {
      issues.push({ severity: "warning", filePath: f.path, message: "File is not owned by any tree node." });
    }
  }

  if (!nodes.find(n => n.id === "project.intent")) {
    issues.push({ severity: "error", message: "Tree has no project.intent root node." });
  }

  return issues;
}
