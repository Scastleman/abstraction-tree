import type { TreeNode } from "./types.js";

export function nodeName(node: TreeNode): string {
  return node.name ?? node.title;
}

export function nodeLevel(node: TreeNode): string {
  return node.abstractionLevel ?? node.level;
}

export function nodeFiles(node?: TreeNode): string[] {
  const sourceFiles = Array.isArray(node?.sourceFiles) ? node.sourceFiles : [];
  return sourceFiles.length ? sourceFiles : Array.isArray(node?.ownedFiles) ? node.ownedFiles : [];
}

export function nodeDependencies(node: TreeNode): string[] {
  const dependencies = Array.isArray(node.dependencies) ? node.dependencies : [];
  return dependencies.length ? dependencies : Array.isArray(node.dependsOn) ? node.dependsOn : [];
}
