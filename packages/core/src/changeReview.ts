import type { ValidationIssue } from "./schema.js";
import { loadChangeRecordObjects, type LoadedChangeRecordObject } from "./workspace.js";

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
  const retainedGeneratedScanRecord = generatedScanRecords.at(-1);
  const eligibleGeneratedScanRecords = generatedScanRecords
    .slice(0, -1)
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
