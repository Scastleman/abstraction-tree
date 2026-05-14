import type { TreeNode } from "./schema.js";

export type TreeExportFormat = "mermaid" | "dot";

export function formatTreeExport(nodes: TreeNode[], format: TreeExportFormat): string {
  return format === "dot" ? formatTreeDot(nodes) : formatTreeMermaid(nodes);
}

export function formatTreeMermaid(nodes: TreeNode[]): string {
  const ids = nodeIds(nodes);
  const lines = ["flowchart TD"];

  for (const [nodeId, diagramId] of ids) {
    const node = nodes.find(candidate => candidate.id === nodeId);
    if (!node) continue;
    lines.push(`  ${diagramId}["${escapeMermaidLabel(labelFor(node))}"]`);
  }

  for (const node of nodes) {
    const parentId = node.parent ?? node.parentId;
    if (!parentId) continue;
    const parentDiagramId = ids.get(parentId);
    const childDiagramId = ids.get(node.id);
    if (!parentDiagramId || !childDiagramId) continue;
    lines.push(`  ${parentDiagramId} --> ${childDiagramId}`);
  }

  return `${lines.join("\n")}\n`;
}

export function formatTreeDot(nodes: TreeNode[]): string {
  const lines = [
    "digraph AbstractionTree {",
    "  rankdir=TB;",
    "  node [shape=box, style=\"rounded\"];"
  ];

  for (const node of nodes) {
    lines.push(`  "${escapeDot(node.id)}" [label="${escapeDot(labelFor(node))}"];`);
  }

  for (const node of nodes) {
    const parentId = node.parent ?? node.parentId;
    if (!parentId || !nodes.some(candidate => candidate.id === parentId)) continue;
    lines.push(`  "${escapeDot(parentId)}" -> "${escapeDot(node.id)}";`);
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function nodeIds(nodes: TreeNode[]): Map<string, string> {
  return new Map(nodes.map((node, index) => [node.id, `n${index}`]));
}

function labelFor(node: TreeNode): string {
  return node.name || node.title || node.id;
}

function escapeMermaidLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function escapeDot(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
