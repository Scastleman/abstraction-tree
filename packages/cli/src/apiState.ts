import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertRuntimeSchema,
  atreePath,
  readChangeRecords,
  readConcepts,
  readConfig,
  readFileSummaries,
  readImportGraph,
  readInvariants,
  readOntology,
  readJson,
  readTreeNodes,
  summarizeRunMarkdown,
  type AbstractionTreeState,
  type AgentHealth,
  type ValidationIssue,
  validateApiStateSchema
} from "@abstraction-tree/core";
import { latestScopeSummary } from "./scopeCommand.js";

export type ApiState = AbstractionTreeState;
export type AgentHealthLoader = (root: string) => Promise<AgentHealth>;
export type ValidationIssuesLoader = (root: string) => Promise<ValidationIssue[]>;

export async function loadApiState(
  root: string,
  loadAgentHealth: AgentHealthLoader = loadApiAgentHealth
): Promise<ApiState> {
  const [
    config,
    ontology,
    nodes,
    files,
    importGraph,
    concepts,
    invariants,
    changes,
    agentHealth
  ] = await Promise.all([
    readConfig(root),
    readOntology(root),
    readTreeNodes(root),
    readFileSummaries(root),
    readImportGraph(root),
    readConcepts(root),
    readInvariants(root),
    readChangeRecords(root),
    loadAgentHealth(root)
  ]);

  const state: ApiState = {
    config,
    ontology,
    nodes,
    files,
    importGraph,
    concepts,
    invariants,
    changes,
    agentHealth
  };
  assertRuntimeSchema(validateApiStateSchema(state));
  return state;
}

export async function loadApiAgentHealth(
  root: string,
  loadValidationIssues?: ValidationIssuesLoader
): Promise<AgentHealth> {
  const issues = loadValidationIssues ? await loadValidationIssues(root).catch(() => undefined) : undefined;
  return {
    latestRun: await loadLatestRun(root),
    latestEvaluation: await loadLatestEvaluation(root),
    validation: issues ? {
      issueCount: issues.length,
      errorCount: issues.filter(issue => issue.severity === "error").length,
      warningCount: issues.filter(issue => issue.severity === "warning").length
    } : undefined,
    automation: await loadAutomationHealth(root),
    scope: await loadScopeHealth(root)
  };
}

async function loadScopeHealth(root: string): Promise<AgentHealth["scope"]> {
  const latest = await latestScopeSummary(root).catch(() => undefined);
  if (!latest) return undefined;
  const report = latest.report;
  return {
    file: report ? `.abstraction-tree/scopes/${report.id}.json` : latest.file,
    prompt: latest.contract.prompt,
    status: report?.status ?? latest.contract.status,
    requiresClarification: latest.contract.requiresClarification,
    affectedNodeCount: latest.contract.affectedNodeIds.length,
    allowedFileCount: latest.contract.allowedFiles.length,
    violationCount: report?.violations.length,
    checkedAt: report?.checkedAt
  };
}

async function loadLatestRun(root: string): Promise<AgentHealth["latestRun"]> {
  const latest = await latestNamedFile(atreePath(root, "runs"), name => name.endsWith("-agent-run.md"));
  if (!latest) return undefined;
  const text = await readFile(latest.path, "utf8").catch(() => "");
  const summary = summarizeRunMarkdown(text);
  return {
    file: `.abstraction-tree/runs/${latest.name}`,
    timestamp: timestampFromName(latest.name),
    task: summary.task,
    result: summary.result ?? "unknown"
  };
}

async function loadLatestEvaluation(root: string): Promise<AgentHealth["latestEvaluation"]> {
  const latest = await latestNamedFile(atreePath(root, "evaluations"), name => name.endsWith("-evaluation.json"));
  if (!latest) return undefined;
  const report = objectRecord(await readJson<Record<string, unknown>>(latest.path, {})) ?? {};
  const drift = objectRecord(report.drift);
  const issues = Array.isArray(report.issues) ? report.issues : undefined;
  return {
    file: `.abstraction-tree/evaluations/${latest.name}`,
    timestamp: stringField(report, "timestamp") ?? timestampFromName(latest.name),
    issueCount: issues?.length,
    staleFileCount: numberField(drift, "staleFileCount"),
    missingFileCount: numberField(drift, "missingFileCount")
  };
}

async function loadAutomationHealth(root: string): Promise<AgentHealth["automation"]> {
  const configPath = atreePath(root, "automation", "loop-config.json");
  const runtimePath = atreePath(root, "automation", "loop-runtime.json");
  const missionsPath = atreePath(root, "automation", "mission-runtime.json");
  if (![configPath, runtimePath, missionsPath].some(existsSync)) return undefined;

  const config = objectRecord(await readJson<Record<string, unknown>>(configPath, {})) ?? {};
  const runtime = objectRecord(await readJson<Record<string, unknown>>(runtimePath, {})) ?? {};
  const missions = objectRecord(await readJson<Record<string, unknown>>(missionsPath, {})) ?? {};
  const completed = Array.isArray(missions.completed) ? missions.completed.length : undefined;
  const failed = Array.isArray(missions.failed) ? missions.failed.length : undefined;

  return {
    loopsToday: numberField(runtime, "loops_today"),
    maxLoopsToday: numberField(config, "max_loops_today"),
    failedLoopsToday: numberField(runtime, "failed_loops_today"),
    maxFailedLoops: numberField(config, "max_failed_loops"),
    maxMinutesToday: numberField(config, "max_minutes_today"),
    maxDiffLines: numberField(config, "max_diff_lines"),
    stopRequested: booleanField(runtime, "stop_requested") ?? booleanField(missions, "stop_requested"),
    currentMission: stringField(missions, "current"),
    completedMissions: completed,
    failedMissions: failed
  };
}

async function latestNamedFile(dir: string, accepts: (name: string) => boolean): Promise<{ name: string; path: string } | undefined> {
  if (!existsSync(dir)) return undefined;
  const names = (await readdir(dir).catch(() => [])).filter(accepts).sort();
  const name = names.at(-1);
  return name ? { name, path: path.join(dir, name) } : undefined;
}

function stringField(value: unknown, field: string): string | undefined {
  const record = objectRecord(value);
  const fieldValue = record?.[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : undefined;
}

function numberField(value: unknown, field: string): number | undefined {
  const record = objectRecord(value);
  const fieldValue = record?.[field];
  return typeof fieldValue === "number" && Number.isFinite(fieldValue) ? fieldValue : undefined;
}

function booleanField(value: unknown, field: string): boolean | undefined {
  const record = objectRecord(value);
  const fieldValue = record?.[field];
  return typeof fieldValue === "boolean" ? fieldValue : undefined;
}

function timestampFromName(name: string): string | undefined {
  const match = name.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
