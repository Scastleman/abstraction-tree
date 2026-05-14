import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  atreePath,
  loadAtreeMemory,
  type AtreeMemory
} from "@abstraction-tree/core";

export interface ServeProjectSummary {
  projectRoot: string;
  projectName: string;
  memory: {
    files: number;
    nodes: number;
    concepts: number;
    invariants: number;
    changes: number;
  };
  missingMemoryFiles: string[];
  runtimeIssueCount: number;
  runtimeErrorCount: number;
  runtimeWarningCount: number;
  isAbstractionTreeDevelopmentRepo: boolean;
}

const REQUIRED_MEMORY_FILES = [
  "files.json",
  "tree.json",
  "ontology.json",
  "concepts.json",
  "invariants.json"
] as const;

const ABSTRACTION_TREE_PACKAGE_NAMES = new Set([
  "abstraction-tree-monorepo",
  "abstraction-tree",
  "@abstraction-tree/core",
  "@abstraction-tree/cli",
  "@abstraction-tree/app"
]);

export async function buildServeProjectSummary(projectRoot: string): Promise<ServeProjectSummary> {
  const root = path.resolve(projectRoot);
  const memory = await loadAtreeMemory(root);
  const missingMemoryFiles = REQUIRED_MEMORY_FILES.filter(fileName => !existsSync(atreePath(root, fileName)));
  const packageName = await readPackageName(root);

  return {
    projectRoot: root,
    projectName: memory.config.projectName,
    memory: memoryCounts(memory),
    missingMemoryFiles,
    runtimeIssueCount: memory.issues.length,
    runtimeErrorCount: memory.issues.filter(issue => issue.severity === "error").length,
    runtimeWarningCount: memory.issues.filter(issue => issue.severity === "warning").length,
    isAbstractionTreeDevelopmentRepo: ABSTRACTION_TREE_PACKAGE_NAMES.has(packageName)
  };
}

export function formatServeProjectSummary(summary: ServeProjectSummary): string {
  const lines = [
    `Serving project: ${summary.projectName}`,
    `Project root: ${summary.projectRoot}`,
    `Memory: ${summary.memory.files} files, ${summary.memory.nodes} nodes, ${summary.memory.concepts} concepts, ${summary.memory.invariants} invariants, ${summary.memory.changes} changes`
  ];

  if (summary.missingMemoryFiles.length) {
    lines.push(`Warning: missing memory files (${summary.missingMemoryFiles.join(", ")}). Run \`atree scan --project "${summary.projectRoot}"\` before relying on the map.`);
  }

  if (summary.runtimeIssueCount) {
    lines.push(`Warning: memory schema reported ${summary.runtimeIssueCount} issue(s): ${summary.runtimeErrorCount} error(s), ${summary.runtimeWarningCount} warning(s).`);
  }

  if (summary.isAbstractionTreeDevelopmentRepo) {
    lines.push("Warning: this is the Abstraction Tree development repo. Its committed .abstraction-tree data is dogfooding memory; pass the consumer project's --project path when adopting Abstraction Tree elsewhere.");
  }

  return `${lines.join("\n")}\n`;
}

async function readPackageName(root: string): Promise<string> {
  const packagePath = path.join(root, "package.json");
  if (!existsSync(packagePath)) return "";

  try {
    const value = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
    return objectRecord(value)?.name ?? "";
  } catch {
    return "";
  }
}

function memoryCounts(memory: AtreeMemory): ServeProjectSummary["memory"] {
  return {
    files: memory.files.length,
    nodes: memory.nodes.length,
    concepts: memory.concepts.length,
    invariants: memory.invariants.length,
    changes: memory.changes.length
  };
}

function objectRecord(value: unknown): { name?: string } | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as { name?: string };
}
