import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FileSummary, TreeNode, ValidationIssue } from "./schema.js";
import { scanProject } from "./scanner.js";
import { validateAutomation } from "./automationValidation.js";
import { atreePath, readJson, writeJson } from "./workspace.js";
import { CONTEXT_OVER_BROAD_LIMITS } from "./contextLimits.js";
import { summarizeRunMarkdown } from "./runReports.js";

const LOOP_CONFIG_PATH = ".abstraction-tree/automation/loop-config.json";
const LOOP_RUNTIME_PATH = ".abstraction-tree/automation/loop-runtime.json";
const CHANGE_RECORD_REVIEW_THRESHOLD = 10;

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
  changes: {
    totalChangeRecordCount: number;
    generatedScanRecordCount: number;
    semanticChangeRecordCount: number;
    generatedScanReviewNeeded: boolean;
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
  area: "tree" | "context" | "runs" | "changes" | "lessons" | "automation";
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
  const changes = await readJsonObjectsFromDir(atreePath(projectRoot, "changes"), ".abstraction-tree/changes", "changes", issues);
  const lessons = await readMarkdownFiles(atreePath(projectRoot, "lessons"), ".abstraction-tree/lessons", "lessons", issues);
  const currentScan = await scanProject(projectRoot);
  const automationIssues = await validateAutomation(projectRoot);
  const changeEvaluation = evaluateChanges(changes);
  if (changeEvaluation.generatedScanReviewNeeded) {
    issues.push({
      severity: "warning",
      area: "changes",
      filePath: ".abstraction-tree/changes",
      message: `.abstraction-tree/changes contains ${changeEvaluation.generatedScanRecordCount} generated scan records and ${changeEvaluation.semanticChangeRecordCount} semantic records; review or consolidate scan records before the autopilot diff grows past guardrails.`
    });
  }
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
    changes: changeEvaluation,
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
    arrayLength(pack.relevantFiles) >= CONTEXT_OVER_BROAD_LIMITS.files ||
    arrayLength(pack.relevantConcepts) >= CONTEXT_OVER_BROAD_LIMITS.concepts ||
    arrayLength(pack.relevantNodes) >= CONTEXT_OVER_BROAD_LIMITS.nodes
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
  const results = reports.map(report => summarizeRunMarkdown(report.text).result);
  return {
    runReportCount: reports.length,
    successCount: results.filter(result => result === "success").length,
    partialCount: results.filter(result => result === "partial").length,
    failedCount: results.filter(result => result === "failed").length,
    noOpCount: results.filter(result => result === "no-op").length
  };
}

function evaluateChanges(changes: Record<string, unknown>[]): EvaluationReport["changes"] {
  const generatedScanRecordCount = changes.filter(isGeneratedScanRecord).length;
  const semanticChangeRecordCount = Math.max(0, changes.length - generatedScanRecordCount);
  return {
    totalChangeRecordCount: changes.length,
    generatedScanRecordCount,
    semanticChangeRecordCount,
    generatedScanReviewNeeded: generatedScanRecordCount > CHANGE_RECORD_REVIEW_THRESHOLD && generatedScanRecordCount > semanticChangeRecordCount
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
    const value = await readJson<unknown>(filePath, undefined);
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
      const value = await readJson<unknown>(filePath, undefined);
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

function isGeneratedScanRecord(change: Record<string, unknown>): boolean {
  return typeof change.id === "string" && change.id.startsWith("scan.");
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
