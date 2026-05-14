import { unlink } from "node:fs/promises";
import path from "node:path";
import type { ValidationIssue } from "./schema.js";
import { atreePath, loadChangeRecordObjects, type LoadedChangeRecordObject } from "./workspace.js";

export interface ChangeRecordReviewItem {
  id: string;
  filePath: string;
  timestamp?: string;
  title?: string;
  risk?: string;
  affectedNodeIds: string[];
  filesChanged: string[];
  consolidationCandidateReason?: "superseded-by-newer-scan";
}

export interface ChangeRecordReviewReport {
  totalChangeRecordCount: number;
  generatedScanRecordCount: number;
  semanticChangeRecordCount: number;
  eligibleGeneratedScanRecordCount: number;
  retainedGeneratedScanRecord?: ChangeRecordReviewItem;
  eligibleGeneratedScanRecords: ChangeRecordReviewItem[];
  issues: ValidationIssue[];
}

export interface ChangeRecordReviewSummary {
  totalChangeRecordCount: number;
  generatedScanRecordCount: number;
  semanticChangeRecordCount: number;
  eligibleGeneratedScanRecordCount: number;
  retainedGeneratedScanRecordId?: string;
  issueCount: number;
}

export interface PruneGeneratedScanRecordsResult {
  dryRun: boolean;
  retainedGeneratedScanRecordId?: string;
  deletedRecordCount: number;
  deletedRecordPaths: string[];
  eligibleGeneratedScanRecordCount: number;
  blockedByIssues: boolean;
  issues: ValidationIssue[];
}

export type ChangeRecordReviewInput = LoadedChangeRecordObject;

export async function reviewChangeRecords(projectRoot: string): Promise<ChangeRecordReviewReport> {
  const loaded = await loadChangeRecordObjects(projectRoot);
  return buildChangeRecordReviewReport(loaded.records, loaded.issues);
}

export function buildChangeRecordReviewReport(
  records: ChangeRecordReviewInput[],
  issues: ValidationIssue[] = []
): ChangeRecordReviewReport {
  const generatedScanRecords = records
    .filter(change => isGeneratedScanRecord(change.record))
    .sort(compareLoadedChangeRecords);
  const referencedChangeRecordPaths = changeRecordPathsReferencedBySemanticRecords(records);
  const retainedGeneratedScanRecord = generatedScanRecords.at(-1);
  const eligibleGeneratedScanRecords = generatedScanRecords
    .slice(0, -1)
    .filter(change => !referencedChangeRecordPaths.has(change.filePath))
    .map(change => reviewItem(change, "superseded-by-newer-scan"));

  return {
    totalChangeRecordCount: records.length,
    generatedScanRecordCount: generatedScanRecords.length,
    semanticChangeRecordCount: Math.max(0, records.length - generatedScanRecords.length),
    eligibleGeneratedScanRecordCount: eligibleGeneratedScanRecords.length,
    retainedGeneratedScanRecord: retainedGeneratedScanRecord ? reviewItem(retainedGeneratedScanRecord) : undefined,
    eligibleGeneratedScanRecords,
    issues
  };
}

export function buildChangeRecordReviewSummary(report: ChangeRecordReviewReport): ChangeRecordReviewSummary {
  return {
    totalChangeRecordCount: report.totalChangeRecordCount,
    generatedScanRecordCount: report.generatedScanRecordCount,
    semanticChangeRecordCount: report.semanticChangeRecordCount,
    eligibleGeneratedScanRecordCount: report.eligibleGeneratedScanRecordCount,
    retainedGeneratedScanRecordId: report.retainedGeneratedScanRecord?.id,
    issueCount: report.issues.length
  };
}

export function limitChangeRecordReviewReport(
  report: ChangeRecordReviewReport,
  limit?: number
): ChangeRecordReviewReport {
  if (limit === undefined) return report;
  return {
    ...report,
    eligibleGeneratedScanRecords: report.eligibleGeneratedScanRecords.slice(0, limit)
  };
}

export async function pruneGeneratedScanRecords(
  projectRoot: string,
  options: { dryRun?: boolean } = {}
): Promise<PruneGeneratedScanRecordsResult> {
  const root = path.resolve(projectRoot);
  const dryRun = options.dryRun !== false;
  const report = await reviewChangeRecords(root);
  const blockedByIssues = report.issues.some(issue => issue.severity === "error");
  const deletedRecordPaths = report.eligibleGeneratedScanRecords.map(record => record.filePath);

  if (!dryRun && !blockedByIssues) {
    for (const filePath of deletedRecordPaths) {
      await unlink(changeRecordAbsolutePath(root, filePath));
    }
  }

  return {
    dryRun,
    retainedGeneratedScanRecordId: report.retainedGeneratedScanRecord?.id,
    deletedRecordCount: dryRun || blockedByIssues ? 0 : deletedRecordPaths.length,
    deletedRecordPaths,
    eligibleGeneratedScanRecordCount: report.eligibleGeneratedScanRecordCount,
    blockedByIssues,
    issues: report.issues
  };
}

function reviewItem(
  change: ChangeRecordReviewInput,
  consolidationCandidateReason?: ChangeRecordReviewItem["consolidationCandidateReason"]
): ChangeRecordReviewItem {
  return {
    id: stringValue(change.record.id) ?? "",
    filePath: change.filePath,
    timestamp: stringValue(change.record.timestamp),
    title: stringValue(change.record.title),
    risk: stringValue(change.record.risk),
    affectedNodeIds: stringArray(change.record.affectedNodeIds),
    filesChanged: stringArray(change.record.filesChanged),
    consolidationCandidateReason
  };
}

function changeRecordAbsolutePath(projectRoot: string, relativeFilePath: string): string {
  const changesRoot = path.resolve(atreePath(projectRoot, "changes"));
  const absolutePath = path.resolve(projectRoot, relativeFilePath);
  if (!absolutePath.startsWith(`${changesRoot}${path.sep}`)) {
    throw new Error(`Refusing to prune change record outside .abstraction-tree/changes: ${relativeFilePath}`);
  }
  return absolutePath;
}

function compareLoadedChangeRecords(left: ChangeRecordReviewInput, right: ChangeRecordReviewInput): number {
  return changeSortKey(left).localeCompare(changeSortKey(right));
}

function changeSortKey(change: ChangeRecordReviewInput): string {
  return [
    stringValue(change.record.timestamp) ?? "",
    stringValue(change.record.id) ?? "",
    change.filePath
  ].join("\0");
}

function isGeneratedScanRecord(change: Record<string, unknown>): boolean {
  return typeof change.id === "string" && change.id.startsWith("scan.");
}

function changeRecordPathsReferencedBySemanticRecords(records: ChangeRecordReviewInput[]): Set<string> {
  return new Set(records
    .filter(change => !isGeneratedScanRecord(change.record))
    .flatMap(change => stringArray(change.record.filesChanged))
    .filter(filePath => filePath.startsWith(".abstraction-tree/changes/scan.") && filePath.endsWith(".json")));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
