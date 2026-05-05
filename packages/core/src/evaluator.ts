import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FileSummary, TreeNode, ValidationIssue } from "./schema.js";
import { scanProject } from "./scanner.js";
import { validateAutomation } from "./automationValidation.js";
import { atreePath, writeJson } from "./workspace.js";

const LOOP_CONFIG_PATH = ".abstraction-tree/automation/loop-config.json";
const LOOP_RUNTIME_PATH = ".abstraction-tree/automation/loop-runtime.json";
const OVER_BROAD_FILE_THRESHOLD = 40;
const OVER_BROAD_CONCEPT_THRESHOLD = 20;
const OVER_BROAD_NODE_THRESHOLD = 25;

export interface EvaluationReport {
  timestamp: string;
  tree: {
    nodeCount: number;
    orphanNodeCount: number;
    nodesWithoutSummaries: number;
    filesWithoutOwners: number;
  };
  context: {
    lastPackCount: number;
    averageFilesPerPack: number;
    averageConceptsPerPack: number;
    possibleOverBroadPacks: number;
  };
  drift: {
    staleFileCount: number;
    missingFileCount: number;
  };
  runs: {
    runReportCount: number;
    successCount: number;
    partialCount: number;
    failedCount: number;
    noOpCount: number;
  };
  lessons: {
    lessonCount: number;
    duplicateLessonCandidates: number;
  };
  automation: {
    runtimeStateIgnored: boolean;
    configValid: boolean;
  };
  issues: EvaluationIssue[];
}

export interface EvaluationIssue {
  severity: ValidationIssue["severity"];
  area: "tree" | "context" | "runs" | "lessons" | "automation";
  message: string;
  filePath?: string;
}

export interface EvaluateProjectOptions {
  now?: Date;
}

export interface WrittenEvaluationReport {
  report: EvaluationReport;
  filePath: string;
}

export async function evaluateProject(projectRoot: string, options: EvaluateProjectOptions = {}): Promise<EvaluationReport> {
  const now = options.now ?? new Date();
  const issues: EvaluationIssue[] = [];
  const nodes = await readJsonArray<TreeNode>(atreePath(projectRoot, "tree.json"), ".abstraction-tree/tree.json", "tree", issues);
  const files = await readJsonArray<FileSummary>(atreePath(projectRoot, "files.json"), ".abstraction-tree/files.json", "tree", issues);
  const contextPacks = await readJsonObjectsFromDir(atreePath(projectRoot, "context-packs"), ".abstraction-tree/context-packs", "context", issues);
  const runReports = await readMarkdownFiles(atreePath(projectRoot, "runs"), ".abstraction-tree/runs", "runs", issues);
  const lessons = await readMarkdownFiles(atreePath(projectRoot, "lessons"), ".abstraction-tree/lessons", "lessons", issues);
  const currentScan = await scanProject(projectRoot);
  const automationIssues = await validateAutomation(projectRoot);
  issues.push(...automationIssues.map(issue => ({
    severity: issue.severity,
    area: "automation" as const,
    message: issue.message,
    filePath: issue.filePath
  })));

  return {
    timestamp: now.toISOString(),
    tree: evaluateTree(nodes, files),
    context: evaluateContext(contextPacks),
    drift: evaluateDrift(files, currentScan.files, nodes),
    runs: evaluateRuns(runReports),
    lessons: evaluateLessons(lessons),
    automation: {
      runtimeStateIgnored: !automationIssues.some(issue => issue.filePath === LOOP_RUNTIME_PATH),
      configValid: !automationIssues.some(issue => issue.filePath === LOOP_CONFIG_PATH)
    },
    issues
  };
}

export async function writeEvaluationReport(projectRoot: string, options: EvaluateProjectOptions = {}): Promise<WrittenEvaluationReport> {
  const now = options.now ?? new Date();
  const report = await evaluateProject(projectRoot, { now });
  const filePath = atreePath(projectRoot, "evaluations", `${formatEvaluationTimestamp(now)}-evaluation.json`);
  await writeJson(filePath, report);
  return { report, filePath };
}

export function formatEvaluationTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}-${hour}${minute}`;
}

function evaluateTree(nodes: TreeNode[], files: FileSummary[]): EvaluationReport["tree"] {
  return {
    nodeCount: nodes.length,
    orphanNodeCount: orphanNodeCount(nodes),
    nodesWithoutSummaries: nodes.filter(node => !nonEmptyString(node.summary)).length,
    filesWithoutOwners: files.filter(file => !Array.isArray(file.ownedByNodeIds) || file.ownedByNodeIds.length === 0).length
  };
}

function evaluateContext(packs: Record<string, unknown>[]): EvaluationReport["context"] {
  const fileCounts = packs.map(pack => arrayLength(pack.relevantFiles));
  const conceptCounts = packs.map(pack => arrayLength(pack.relevantConcepts));
  const overBroadCount = packs.filter(pack =>
    arrayLength(pack.relevantFiles) >= OVER_BROAD_FILE_THRESHOLD ||
    arrayLength(pack.relevantConcepts) >= OVER_BROAD_CONCEPT_THRESHOLD ||
    arrayLength(pack.relevantNodes) >= OVER_BROAD_NODE_THRESHOLD
  ).length;

  return {
    lastPackCount: packs.length,
    averageFilesPerPack: average(fileCounts),
    averageConceptsPerPack: average(conceptCounts),
    possibleOverBroadPacks: overBroadCount
  };
}

function evaluateDrift(storedFiles: FileSummary[], currentFiles: FileSummary[], nodes: TreeNode[]): EvaluationReport["drift"] {
  const currentByPath = new Map(currentFiles.map(file => [file.path, file]));
  const missingPaths = new Set<string>();
  const stalePaths = new Set<string>();

  for (const stored of storedFiles) {
    const current = currentByPath.get(stored.path);
    if (!current) {
      missingPaths.add(stored.path);
    } else if (hasFileDrift(stored, current)) {
      stalePaths.add(stored.path);
    }
  }

  for (const node of nodes) {
    for (const filePath of nodeFiles(node)) {
      if (!currentByPath.has(filePath)) missingPaths.add(filePath);
    }
  }

  return {
    staleFileCount: stalePaths.size,
    missingFileCount: missingPaths.size
  };
}

function evaluateRuns(reports: MarkdownFile[]): EvaluationReport["runs"] {
  const results = reports.map(report => parseRunResult(report.text));
  return {
    runReportCount: reports.length,
    successCount: results.filter(result => result === "success").length,
    partialCount: results.filter(result => result === "partial").length,
    failedCount: results.filter(result => result === "failed").length,
    noOpCount: results.filter(result => result === "no-op").length
  };
}

function evaluateLessons(lessons: MarkdownFile[]): EvaluationReport["lessons"] {
  const counts = new Map<string, number>();
  for (const lesson of lessons) {
    const fingerprint = lessonFingerprint(lesson.text);
    if (!fingerprint) continue;
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }

  return {
    lessonCount: lessons.length,
    duplicateLessonCandidates: [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  };
}

async function readJsonArray<T>(
  filePath: string,
  relativePath: string,
  area: EvaluationIssue["area"],
  issues: EvaluationIssue[]
): Promise<T[]> {
  if (!existsSync(filePath)) return [];
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (Array.isArray(value)) return value as T[];
    issues.push({
      severity: "warning",
      area,
      filePath: relativePath,
      message: `${relativePath} must be a JSON array.`
    });
  } catch {
    issues.push({
      severity: "warning",
      area,
      filePath: relativePath,
      message: `${relativePath} is not valid JSON.`
    });
  }
  return [];
}

async function readJsonObjectsFromDir(
  dirPath: string,
  relativeDir: string,
  area: EvaluationIssue["area"],
  issues: EvaluationIssue[]
): Promise<Record<string, unknown>[]> {
  if (!existsSync(dirPath)) return [];
  const names = await readdir(dirPath).catch(() => {
    issues.push({
      severity: "warning",
      area,
      filePath: relativeDir,
      message: `${relativeDir} could not be read.`
    });
    return [];
  });
  const objects: Record<string, unknown>[] = [];

  for (const name of names.filter(name => name.endsWith(".json")).sort()) {
    const filePath = path.join(dirPath, name);
    const relativePath = `${relativeDir}/${name}`;
    try {
      const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      if (objectRecord(value)) objects.push(value);
      else {
        issues.push({
          severity: "warning",
          area,
          filePath: relativePath,
          message: `${relativePath} must be a JSON object.`
        });
      }
    } catch {
      issues.push({
        severity: "warning",
        area,
        filePath: relativePath,
        message: `${relativePath} is not valid JSON.`
      });
    }
  }

  return objects;
}

interface MarkdownFile {
  name: string;
  text: string;
}

async function readMarkdownFiles(
  dirPath: string,
  relativeDir: string,
  area: EvaluationIssue["area"],
  issues: EvaluationIssue[]
): Promise<MarkdownFile[]> {
  if (!existsSync(dirPath)) return [];
  const names = await readdir(dirPath).catch(() => {
    issues.push({
      severity: "warning",
      area,
      filePath: relativeDir,
      message: `${relativeDir} could not be read.`
    });
    return [];
  });
  const files: MarkdownFile[] = [];

  for (const name of names.filter(name => name.endsWith(".md")).sort()) {
    const filePath = path.join(dirPath, name);
    const relativePath = `${relativeDir}/${name}`;
    try {
      files.push({ name, text: await readFile(filePath, "utf8") });
    } catch {
      issues.push({
        severity: "warning",
        area,
        filePath: relativePath,
        message: `${relativePath} could not be read.`
      });
    }
  }

  return files;
}

function orphanNodeCount(nodes: TreeNode[]): number {
  const nodeIds = new Set(nodes.map(node => node.id).filter(Boolean));
  const roots = nodes.filter(node => !nodeParent(node)).sort((a, b) => a.id.localeCompare(b.id));
  const canonicalRoot = roots[0]?.id;
  let count = Math.max(0, roots.length - 1);

  for (const node of nodes) {
    const parent = nodeParent(node);
    if (parent && !nodeIds.has(parent)) count += 1;
  }

  if (canonicalRoot) return count;
  return nodes.length ? count + 1 : count;
}

function hasFileDrift(stored: FileSummary, current: FileSummary): boolean {
  if (stored.contentHash && current.contentHash) return stored.contentHash !== current.contentHash;
  return fileSignature(stored) !== fileSignature(current);
}

function fileSignature(file: FileSummary): string {
  return JSON.stringify({
    language: file.language,
    lines: file.lines,
    imports: normalized(file.imports),
    exports: normalized(file.exports),
    symbols: normalized(file.symbols),
    isTest: file.isTest
  });
}

function parseRunResult(text: string): "success" | "partial" | "failed" | "no-op" | undefined {
  const resultSection = text.match(/^## Result\s+([\s\S]*?)(?=^## |\s*$)/m)?.[1] ?? "";
  const firstValue = resultSection.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.toLowerCase();
  if (!firstValue) return undefined;
  if (firstValue.startsWith("success")) return "success";
  if (firstValue.startsWith("partial")) return "partial";
  if (firstValue.startsWith("failed") || firstValue.startsWith("failure")) return "failed";
  if (firstValue.startsWith("no-op") || firstValue.startsWith("noop") || firstValue.startsWith("no op")) return "no-op";
  return undefined;
}

function lessonFingerprint(text: string): string {
  return text
    .replace(/^#+\s*lesson\s*$/gim, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#:[\]()-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function nodeParent(node: TreeNode): string | undefined {
  return node.parent ?? node.parentId;
}

function nodeFiles(node: TreeNode): string[] {
  const sourceFiles = Array.isArray(node.sourceFiles) ? node.sourceFiles : [];
  return sourceFiles.length ? sourceFiles : Array.isArray(node.ownedFiles) ? node.ownedFiles : [];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function normalized(values: string[] = []): string[] {
  return [...values].sort();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
