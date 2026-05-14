import type { TreeNode } from "./schema.js";

export type TreeDiagramFormat = "mermaid" | "dot";
export type TreeDiagramDirection = "TD" | "TB" | "BT" | "LR" | "RL";

export interface TreeDiagramOptions {
  direction?: TreeDiagramDirection;
  includeSummaries?: boolean;
  maxSummaryLength?: number;
}

interface TreeEdge {
  from: string;
  to: string;
}

export function formatTreeDiagram(
  nodes: TreeNode[],
  format: TreeDiagramFormat,
  options: TreeDiagramOptions = {}
): string {
  return format === "dot"
    ? formatTreeAsDot(nodes, options)
    : formatTreeAsMermaid(nodes, options);
}

export function formatTreeAsMermaid(nodes: TreeNode[], options: TreeDiagramOptions = {}): string {
  const direction = options.direction ?? "TD";
  const nodeIds = diagramNodeIds(nodes);
  const lines = [`flowchart ${direction}`];

  if (!nodes.length) {
    lines.push("  empty[\"No tree nodes\"]");
    return `${lines.join("\n")}\n`;
  }

  for (const node of nodes) {
    lines.push(`  ${nodeIds.get(node.id)}["${mermaidLabel(node, options)}"]`);
  }

  for (const edge of treeEdges(nodes)) {
    lines.push(`  ${nodeIds.get(edge.from)} --> ${nodeIds.get(edge.to)}`);
  }

  return `${lines.join("\n")}\n`;
}

export function formatTreeAsDot(nodes: TreeNode[], options: TreeDiagramOptions = {}): string {
  const direction = options.direction === "TD" ? "TB" : options.direction ?? "TB";
  const nodeIds = diagramNodeIds(nodes);
  const lines = [
    "digraph AbstractionTree {",
    `  rankdir=${direction};`,
    "  node [shape=box, style=\"rounded\", fontname=\"Arial\"];"
  ];

  if (!nodes.length) {
    lines.push("  empty [label=\"No tree nodes\"];");
    lines.push("}");
    return `${lines.join("\n")}\n`;
  }

  for (const node of nodes) {
    lines.push(`  ${nodeIds.get(node.id)} [label="${dotLabel(node, options)}"];`);
  }

  for (const edge of treeEdges(nodes)) {
    lines.push(`  ${nodeIds.get(edge.from)} -> ${nodeIds.get(edge.to)};`);
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function diagramNodeIds(nodes: TreeNode[]): Map<string, string> {
  return new Map(nodes.map((node, index) => [node.id, `n${index}`]));
}

function treeEdges(nodes: TreeNode[]): TreeEdge[] {
  const nodeIds = new Set(nodes.map(node => node.id));
  const edgeKeys = new Set<string>();
  const edges: TreeEdge[] = [];

  const addEdge = (from: string | undefined, to: string | undefined) => {
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) return;
    const key = `${from}\0${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };

  for (const node of nodes) {
    for (const childId of node.children) addEdge(node.id, childId);
  }

  for (const node of nodes) addEdge(node.parent ?? node.parentId, node.id);

  return edges;
}

function mermaidLabel(node: TreeNode, options: TreeDiagramOptions): string {
  return labelParts(node, options)
    .map(escapeMermaidText)
    .join("<br/>");
}

function dotLabel(node: TreeNode, options: TreeDiagramOptions): string {
  return labelParts(node, options)
    .map(escapeDotText)
    .join("\\n");
}

function labelParts(node: TreeNode, options: TreeDiagramOptions): string[] {
  const title = normalizeLabelText(node.title || node.name || node.id);
  if (!options.includeSummaries) return [title];

  const summary = truncateSummary(normalizeLabelText(node.summary), options.maxSummaryLength ?? 96);
  return summary && summary !== title ? [title, summary] : [title];
}

function truncateSummary(summary: string, maxLength: number): string {
  if (summary.length <= maxLength) return summary;
  if (maxLength <= 3) return summary.slice(0, maxLength);
  return `${summary.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeLabelText(input: string): string {
  return input.replace(/\s+/gu, " ").trim();
}

function escapeMermaidText(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;");
}

function escapeDotText(input: string): string {
  return input
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"");
}
