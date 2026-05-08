import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Concept, ContextPack, FileSummary, ImportGraph, Invariant, TreeNode, ValidationIssue } from "./schema.js";
import { scanProject } from "./scanner.js";
import { validateAutomation } from "./automationValidation.js";
import { atreePath, loadAtreeMemory, readJson, writeJson } from "./workspace.js";
import { CONTEXT_OVER_BROAD_LIMITS } from "./contextLimits.js";
import { summarizeRunMarkdown } from "./runReports.js";

const LOOP_CONFIG_PATH = ".abstraction-tree/automation/loop-config.json";
const LOOP_RUNTIME_PATH = ".abstraction-tree/automation/loop-runtime.json";
const QUALITY_FIXTURE_PATH = ".abstraction-tree/evaluation-fixture.json";
const CHANGE_RECORD_REVIEW_THRESHOLD = 10;
const NOISY_CONCEPT_IDS = new Set([
  "app", "component", "config", "data", "default", "doc", "example", "file", "guide", "helper",
  "index", "item", "module", "note", "overview", "project", "readme", "record", "result", "root",
  "script", "section", "service", "src", "test", "type", "usage", "user", "util", "value"
]);

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
  quality: GeneratedMemoryQualityReport;
  issues: EvaluationIssue[];
}

export interface EvaluationIssue {
  severity: ValidationIssue["severity"];
  area: "tree" | "context" | "runs" | "changes" | "lessons" | "automation" | "quality";
  message: string;
  filePath?: string;
}

export interface GeneratedMemoryQualityFixture {
  expectedTreeNodeIds?: string[];
  expectedArchitectureNodeIds?: string[];
  expectedConceptIds?: string[];
  expectedInvariantIds?: string[];
  expectedContextPacks?: ExpectedContextPackQuality[];
  allowedNoisyConceptIds?: string[];
}

export interface ExpectedContextPackQuality {
  target: string;
  expectedTreeNodeIds?: string[];
  expectedFilePaths?: string[];
  expectedConceptIds?: string[];
  expectedInvariantIds?: string[];
}

export interface GeneratedMemoryQualityReport {
  fixture: {
    path?: string;
    expectedTreeNodeCount: number;
    missingExpectedTreeNodeCount: number;
    missingExpectedTreeNodeIds: string[];
    expectedArchitectureNodeCount: number;
    missingExpectedArchitectureNodeCount: number;
    missingExpectedArchitectureNodeIds: string[];
    expectedConceptCount: number;
    missingExpectedConceptCount: number;
    missingExpectedConceptIds: string[];
    expectedInvariantCount: number;
    missingExpectedInvariantCount: number;
    missingExpectedInvariantIds: string[];
  };
  concepts: {
    totalConceptCount: number;
    noisyConceptCount: number;
    noisyConceptIds: string[];
    conceptsWithoutEvidence: number;
    conceptsWithoutRelatedFiles: number;
  };
  imports: {
    unresolvedImportCount: number;
  };
  architecture: {
    architectureNodeCount: number;
    architectureCoverableFileCount: number;
    architectureCoveredFileCount: number;
    architectureCoveragePercent: number;
  };
  context: {
    evaluatedContextPackCount: number;
    expectedContextPackCount: number;
    passingExpectedContextPackCount: number;
    missingExpectedInclusionCount: number;
    missingExpectedInclusions: string[];
  };
}

export interface EvaluateGeneratedMemoryQualityInput {
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  invariants: Invariant[];
  importGraph: ImportGraph;
  contextPacks: ContextPack[];
  fixture?: GeneratedMemoryQualityFixture;
  fixturePath?: string;
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
  const memory = await loadAtreeMemory(projectRoot);
  const nodes = memory.nodes;
  const files = memory.files;
  const contextPacks = memory.contextPacks as unknown as Record<string, unknown>[];
  const runReports = await readMarkdownFiles(atreePath(projectRoot, "runs"), ".abstraction-tree/runs", "runs", issues);
  const changes = memory.changes as unknown as Record<string, unknown>[];
  const lessons = await readMarkdownFiles(atreePath(projectRoot, "lessons"), ".abstraction-tree/lessons", "lessons", issues);
  const qualityFixture = await readQualityFixture(projectRoot, issues);
  const currentScan = await scanProject(projectRoot);
  const automationIssues = await validateAutomation(projectRoot);
  const changeEvaluation = evaluateChanges(changes);
  const quality = evaluateGeneratedMemoryQuality({
    nodes,
    files,
    concepts: memory.concepts,
    invariants: memory.invariants,
    importGraph: memory.importGraph,
    contextPacks: memory.contextPacks,
    fixture: qualityFixture,
    ...(qualityFixture ? { fixturePath: QUALITY_FIXTURE_PATH } : {})
  });
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
  issues.push(...memory.issues.map(issue => ({
    severity: issue.severity,
    area: runtimeIssueArea(issue.filePath),
    message: runtimeIssueMessage(issue),
    filePath: issue.filePath
  })));
  issues.push(...qualityIssues(quality));

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
    quality,
    issues
  };
}

export function evaluateGeneratedMemoryQuality(input: EvaluateGeneratedMemoryQualityInput): GeneratedMemoryQualityReport {
  const fixture = input.fixture;
  const nodeIds = new Set(input.nodes.map(node => node.id));
  const conceptIds = new Set(input.concepts.map(concept => concept.id));
  const invariantIds = new Set(input.invariants.map(invariant => invariant.id));
  const expectedTreeNodeIds = uniqueSorted(fixture?.expectedTreeNodeIds ?? []);
  const expectedArchitectureNodeIds = uniqueSorted(fixture?.expectedArchitectureNodeIds ?? []);
  const expectedConceptIds = uniqueSorted(fixture?.expectedConceptIds ?? []);
  const expectedInvariantIds = uniqueSorted(fixture?.expectedInvariantIds ?? []);
  const allowedNoisyConceptIds = new Set(fixture?.allowedNoisyConceptIds ?? []);
  const noisyConcepts = input.concepts
    .filter(concept => !allowedNoisyConceptIds.has(concept.id) && noisyConceptReasons(concept).length > 0)
    .map(concept => concept.id)
    .sort();
  const architecture = evaluateArchitectureCoverage(input.nodes, input.files);
  const context = evaluateExpectedContextPacks(input.contextPacks, fixture?.expectedContextPacks ?? []);

  return {
    fixture: {
      ...(input.fixturePath ? { path: input.fixturePath } : {}),
      expectedTreeNodeCount: expectedTreeNodeIds.length,
      missingExpectedTreeNodeCount: missingValues(expectedTreeNodeIds, nodeIds).length,
      missingExpectedTreeNodeIds: missingValues(expectedTreeNodeIds, nodeIds),
      expectedArchitectureNodeCount: expectedArchitectureNodeIds.length,
      missingExpectedArchitectureNodeCount: missingValues(expectedArchitectureNodeIds, nodeIds).length,
      missingExpectedArchitectureNodeIds: missingValues(expectedArchitectureNodeIds, nodeIds),
      expectedConceptCount: expectedConceptIds.length,
      missingExpectedConceptCount: missingValues(expectedConceptIds, conceptIds).length,
      missingExpectedConceptIds: missingValues(expectedConceptIds, conceptIds),
      expectedInvariantCount: expectedInvariantIds.length,
      missingExpectedInvariantCount: missingValues(expectedInvariantIds, invariantIds).length,
      missingExpectedInvariantIds: missingValues(expectedInvariantIds, invariantIds)
    },
    concepts: {
      totalConceptCount: input.concepts.length,
      noisyConceptCount: noisyConcepts.length,
      noisyConceptIds: noisyConcepts.slice(0, 20),
      conceptsWithoutEvidence: input.concepts.filter(concept => !arrayLength(concept.evidence)).length,
      conceptsWithoutRelatedFiles: input.concepts.filter(concept => !arrayLength(concept.relatedFiles)).length
    },
    imports: {
      unresolvedImportCount: input.importGraph.unresolvedImports.length
    },
    architecture,
    context
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

async function readQualityFixture(projectRoot: string, issues: EvaluationIssue[]): Promise<GeneratedMemoryQualityFixture | undefined> {
  const filePath = atreePath(projectRoot, "evaluation-fixture.json");
  if (!existsSync(filePath)) return undefined;

  let value: unknown;
  try {
    value = await readJson<unknown>(filePath, undefined);
  } catch {
    issues.push({
      severity: "warning",
      area: "quality",
      filePath: QUALITY_FIXTURE_PATH,
      message: `${QUALITY_FIXTURE_PATH} could not be parsed; generated-memory fixture expectations were skipped.`
    });
    return undefined;
  }

  return normalizeQualityFixture(value, issues);
}

function normalizeQualityFixture(value: unknown, issues: EvaluationIssue[]): GeneratedMemoryQualityFixture | undefined {
  const record = objectRecord(value);
  if (!record) {
    issues.push({
      severity: "warning",
      area: "quality",
      filePath: QUALITY_FIXTURE_PATH,
      message: `${QUALITY_FIXTURE_PATH} must be a JSON object; generated-memory fixture expectations were skipped.`
    });
    return undefined;
  }

  return {
    ...optionalStringArrayField(record, "expectedTreeNodeIds", issues),
    ...optionalStringArrayField(record, "expectedArchitectureNodeIds", issues),
    ...optionalStringArrayField(record, "expectedConceptIds", issues),
    ...optionalStringArrayField(record, "expectedInvariantIds", issues),
    ...optionalStringArrayField(record, "allowedNoisyConceptIds", issues),
    ...optionalContextPackExpectations(record, issues)
  };
}

function optionalStringArrayField(
  record: Record<string, unknown>,
  field: keyof GeneratedMemoryQualityFixture,
  issues: EvaluationIssue[]
): Partial<GeneratedMemoryQualityFixture> {
  if (!(field in record)) return {};
  const value = record[field];
  if (Array.isArray(value) && value.every(item => typeof item === "string")) {
    return { [field]: uniqueSorted(value) };
  }
  fixtureFieldIssue(field, "Expected an array of strings.", issues);
  return {};
}

function optionalContextPackExpectations(
  record: Record<string, unknown>,
  issues: EvaluationIssue[]
): Partial<GeneratedMemoryQualityFixture> {
  if (!("expectedContextPacks" in record)) return {};
  const value = record.expectedContextPacks;
  if (!Array.isArray(value)) {
    fixtureFieldIssue("expectedContextPacks", "Expected an array of context-pack expectation objects.", issues);
    return {};
  }

  const expectedContextPacks = value
    .map((item, index) => normalizeContextPackExpectation(item, index, issues))
    .filter((item): item is ExpectedContextPackQuality => Boolean(item));
  return { expectedContextPacks };
}

function normalizeContextPackExpectation(
  value: unknown,
  index: number,
  issues: EvaluationIssue[]
): ExpectedContextPackQuality | undefined {
  const record = objectRecord(value);
  if (!record || typeof record.target !== "string" || !record.target.trim()) {
    issues.push({
      severity: "warning",
      area: "quality",
      filePath: QUALITY_FIXTURE_PATH,
      message: `expectedContextPacks[${index}] must be an object with a non-empty target string.`
    });
    return undefined;
  }

  return {
    target: record.target,
    ...optionalContextStringArray(record, "expectedTreeNodeIds", index, issues),
    ...optionalContextStringArray(record, "expectedFilePaths", index, issues),
    ...optionalContextStringArray(record, "expectedConceptIds", index, issues),
    ...optionalContextStringArray(record, "expectedInvariantIds", index, issues)
  };
}

function optionalContextStringArray(
  record: Record<string, unknown>,
  field: keyof ExpectedContextPackQuality,
  index: number,
  issues: EvaluationIssue[]
): Partial<ExpectedContextPackQuality> {
  if (!(field in record)) return {};
  const value = record[field];
  if (Array.isArray(value) && value.every(item => typeof item === "string")) {
    return { [field]: uniqueSorted(value) };
  }
  issues.push({
    severity: "warning",
    area: "quality",
    filePath: QUALITY_FIXTURE_PATH,
    message: `expectedContextPacks[${index}].${field} must be an array of strings.`
  });
  return {};
}

function fixtureFieldIssue(field: string, message: string, issues: EvaluationIssue[]): void {
  issues.push({
    severity: "warning",
    area: "quality",
    filePath: QUALITY_FIXTURE_PATH,
    message: `${QUALITY_FIXTURE_PATH} ${field}: ${message}`
  });
}

function qualityIssues(quality: GeneratedMemoryQualityReport): EvaluationIssue[] {
  const issues: EvaluationIssue[] = [];
  const fixturePath = quality.fixture.path;

  if (quality.fixture.missingExpectedTreeNodeCount) {
    issues.push({
      severity: "error",
      area: "quality",
      filePath: fixturePath,
      message: `Generated memory is missing expected tree nodes: ${quality.fixture.missingExpectedTreeNodeIds.join(", ")}.`
    });
  }
  if (quality.fixture.missingExpectedArchitectureNodeCount) {
    issues.push({
      severity: "error",
      area: "quality",
      filePath: fixturePath,
      message: `Generated memory is missing expected architecture nodes: ${quality.fixture.missingExpectedArchitectureNodeIds.join(", ")}.`
    });
  }
  if (quality.fixture.missingExpectedConceptCount) {
    issues.push({
      severity: "error",
      area: "quality",
      filePath: fixturePath,
      message: `Generated memory is missing expected concepts: ${quality.fixture.missingExpectedConceptIds.join(", ")}.`
    });
  }
  if (quality.fixture.missingExpectedInvariantCount) {
    issues.push({
      severity: "error",
      area: "quality",
      filePath: fixturePath,
      message: `Generated memory is missing expected invariants: ${quality.fixture.missingExpectedInvariantIds.join(", ")}.`
    });
  }
  if (quality.context.missingExpectedInclusionCount) {
    issues.push({
      severity: "error",
      area: "quality",
      filePath: fixturePath,
      message: `Generated context packs are missing expected inclusions: ${quality.context.missingExpectedInclusions.join("; ")}.`
    });
  }
  if (quality.concepts.noisyConceptCount) {
    issues.push({
      severity: "warning",
      area: "quality",
      filePath: ".abstraction-tree/concepts.json",
      message: `Generated concepts include ${quality.concepts.noisyConceptCount} noisy concept candidate(s): ${quality.concepts.noisyConceptIds.join(", ")}.`
    });
  }
  if (quality.imports.unresolvedImportCount) {
    issues.push({
      severity: "warning",
      area: "quality",
      filePath: ".abstraction-tree/import-graph.json",
      message: `Import graph has ${quality.imports.unresolvedImportCount} unresolved import(s); architecture and context coverage may be incomplete.`
    });
  }

  return issues;
}

function evaluateArchitectureCoverage(nodes: TreeNode[], files: FileSummary[]): GeneratedMemoryQualityReport["architecture"] {
  const architectureNodes = nodes.filter(isArchitectureNode);
  const architectureFiles = new Set(architectureNodes.flatMap(nodeFiles));
  const coverableFiles = files.filter(isArchitectureCoverableFile);
  const coveredFileCount = coverableFiles.filter(file => architectureFiles.has(file.path)).length;

  return {
    architectureNodeCount: architectureNodes.length,
    architectureCoverableFileCount: coverableFiles.length,
    architectureCoveredFileCount: coveredFileCount,
    architectureCoveragePercent: percentage(coveredFileCount, coverableFiles.length)
  };
}

function evaluateExpectedContextPacks(
  packs: ContextPack[],
  expectedPacks: ExpectedContextPackQuality[]
): GeneratedMemoryQualityReport["context"] {
  const missingExpectedInclusions: string[] = [];
  let passingExpectedContextPackCount = 0;

  for (const expected of expectedPacks) {
    const candidates = packs.filter(pack => normalizeTarget(pack.target) === normalizeTarget(expected.target));
    if (!candidates.length) {
      missingExpectedInclusions.push(`target "${expected.target}" has no generated context pack`);
      continue;
    }

    const bestMissing = candidates
      .map(pack => missingContextInclusions(pack, expected))
      .sort((a, b) => a.length - b.length)[0] ?? [];
    if (!bestMissing.length) {
      passingExpectedContextPackCount += 1;
      continue;
    }
    missingExpectedInclusions.push(...bestMissing);
  }

  return {
    evaluatedContextPackCount: packs.length,
    expectedContextPackCount: expectedPacks.length,
    passingExpectedContextPackCount,
    missingExpectedInclusionCount: missingExpectedInclusions.length,
    missingExpectedInclusions: missingExpectedInclusions.slice(0, 20)
  };
}

function missingContextInclusions(pack: ContextPack, expected: ExpectedContextPackQuality): string[] {
  return [
    ...missingContextValues(pack.target, "node", expected.expectedTreeNodeIds ?? [], pack.relevantNodes.map(node => node.id)),
    ...missingContextValues(pack.target, "file", expected.expectedFilePaths ?? [], pack.relevantFiles.map(file => file.path)),
    ...missingContextValues(pack.target, "concept", expected.expectedConceptIds ?? [], pack.relevantConcepts.map(concept => concept.id)),
    ...missingContextValues(pack.target, "invariant", expected.expectedInvariantIds ?? [], pack.invariants.map(invariant => invariant.id))
  ];
}

function missingContextValues(target: string, label: string, expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return expected
    .filter(value => !actualSet.has(value))
    .map(value => `target "${target}" missing ${label} ${value}`);
}

function noisyConceptReasons(concept: Concept): string[] {
  const reasons: string[] = [];
  const normalizedId = concept.id.toLowerCase().replace(/[^a-z0-9]+/g, ".");
  if (NOISY_CONCEPT_IDS.has(normalizedId)) reasons.push("generic concept id");
  if (!arrayLength(concept.relatedFiles)) reasons.push("no related files");
  if (!arrayLength(concept.evidence)) reasons.push("no evidence");
  return reasons;
}

function missingValues(expected: string[], actual: Set<string>): string[] {
  return expected.filter(value => !actual.has(value));
}

function isArchitectureNode(node: TreeNode): boolean {
  return node.id.startsWith("architecture.") || nodeParent(node) === "project.architecture";
}

function isArchitectureCoverableFile(file: FileSummary): boolean {
  return !file.isTest && !file.path.startsWith(".abstraction-tree/");
}

function normalizeTarget(value: string): string {
  return value.trim().toLowerCase();
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function percentage(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
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

function runtimeIssueArea(filePath?: string): EvaluationIssue["area"] {
  if (filePath?.includes("/context-packs")) return "context";
  if (filePath?.includes("/changes")) return "changes";
  if (filePath?.includes("/runs")) return "runs";
  if (filePath?.includes("/automation")) return "automation";
  return "tree";
}

function runtimeIssueMessage(issue: ValidationIssue): string {
  const location = [issue.filePath, issue.fieldPath].filter(Boolean).join(" ");
  const hint = issue.recoveryHint ? ` Hint: ${issue.recoveryHint}` : "";
  return `${location ? `${location}: ` : ""}${issue.message}${hint}`;
}
