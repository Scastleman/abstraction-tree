#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import {
  atreePath,
  buildContextPack,
  reviewChangeRecords,
  buildDeterministicTree,
  detectFileDrift,
  ensureWorkspace,
  writeEvaluationReport,
  readConfig,
  readJson,
  scanProject,
  setInstallMode,
  validateChanges,
  validateAutomation,
  validateConcepts,
  validateInvariants,
  validateTree,
  writeJson,
  type ChangeRecord,
  type AbstractionOntologyLevel,
  type Concept,
  type FileSummary,
  type InstallMode,
  type Invariant,
  type TreeNode,
  type ValidationIssue
} from "@abstraction-tree/core";
import { summarizeRunMarkdown, type RunResult } from "./agentHealth.js";

const program = new Command();
program.name("atree").description("Build and visualize an abstraction tree for a codebase.").version("0.1.0");

function projectPath(input?: string) {
  return path.resolve(input ?? process.cwd());
}

program.command("init")
  .description("Create .abstraction-tree workspace")
  .option("-p, --project <path>", "project root")
  .option("--core", "initialize in core-only mode")
  .option("--with-app", "initialize in full mode with the visual app enabled")
  .action(async opts => {
    const root = projectPath(opts.project);
    const mode: InstallMode = opts.withApp ? "full" : "core";
    await ensureWorkspace(root, { installMode: mode });
    console.log(`Initialized Abstraction Tree in ${atreePath(root)} (${mode} mode).`);
    if (mode === "core") {
      console.log("Core-only mode writes .abstraction-tree data and supports scan, validate, and context commands.");
      console.log("Install the full package or run `atree mode full` when you want to enable the visual app.");
    }
  });

program.command("mode")
  .description("Switch between core-only and full visual-app mode")
  .argument("<mode>", "core or full")
  .option("-p, --project <path>", "project root")
  .action(async (modeInput: string, opts) => {
    if (!["core", "full"].includes(modeInput)) {
      console.error("Mode must be either `core` or `full`.");
      process.exitCode = 1;
      return;
    }
    const mode = modeInput as InstallMode;
    const root = projectPath(opts.project);
    await setInstallMode(root, mode);
    console.log(`Abstraction Tree mode is now ${mode}.`);
  });

program.command("scan")
  .description("Scan files and build the initial abstraction tree")
  .option("-p, --project <path>", "project root")
  .action(async opts => {
    const root = projectPath(opts.project);
    await ensureWorkspace(root);
    const config = await readConfig(root);
    const scan = await scanProject(root);
    const built = buildDeterministicTree(config.projectName, scan.files);
    await writeJson(atreePath(root, "files.json"), built.files);
    await writeJson(atreePath(root, "ontology.json"), built.ontology);
    await writeJson(atreePath(root, "tree.json"), built.nodes);
    await writeJson(atreePath(root, "concepts.json"), built.concepts);
    await writeJson(atreePath(root, "invariants.json"), built.invariants);
    const change: ChangeRecord = {
      id: `scan.${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: "Deterministic scan",
      reason: "Generated abstraction tree from project files, imports, symbols, tests, and folders.",
      affectedNodeIds: ["project.intent", "project.architecture", "project.code"],
      filesChanged: [".abstraction-tree/files.json", ".abstraction-tree/ontology.json", ".abstraction-tree/tree.json", ".abstraction-tree/concepts.json", ".abstraction-tree/invariants.json"],
      invariantsPreserved: ["invariant.tree-updated-after-change"],
      risk: "low"
    };
    await writeJson(atreePath(root, "changes", `${change.id}.json`), change);
    console.log(`Scanned ${built.files.length} files and built ${built.nodes.length} tree nodes.`);
  });

program.command("validate")
  .description("Validate tree/file alignment")
  .option("-p, --project <path>", "project root")
  .option("--strict", "treat warnings as validation failures")
  .action(async opts => {
    const root = projectPath(opts.project);
    const issues = await collectValidationIssues(root);
    if (!issues.length) {
      console.log("No validation issues found.");
      return;
    }
    for (const i of issues) console.log(`[${i.severity}] ${i.message}${i.filePath ? ` (${i.filePath})` : ""}`);
    process.exitCode = issues.some(i => i.severity === "error" || (opts.strict && i.severity === "warning")) ? 1 : 0;
  });

program.command("context")
  .description("Generate a compact context pack for an agent")
  .option("-p, --project <path>", "project root")
  .requiredOption("-t, --target <query>", "target feature, concept, or file")
  .action(async opts => {
    const root = projectPath(opts.project);
    const nodes = await readJson<TreeNode[]>(atreePath(root, "tree.json"), []);
    const files = await readJson<FileSummary[]>(atreePath(root, "files.json"), []);
    const concepts = await readJson<Concept[]>(atreePath(root, "concepts.json"), []);
    const invariants = await readJson<Invariant[]>(atreePath(root, "invariants.json"), []);
    const changes = validChangeRecords((await loadChanges(root)).records);
    const pack = buildContextPack({ target: opts.target, nodes, files, concepts, invariants, changes });
    const out = atreePath(root, "context-packs", `${pack.id}.json`);
    await writeJson(out, pack);
    console.log(JSON.stringify(pack, null, 2));
  });

program.command("evaluate")
  .description("Generate deterministic evaluation metrics")
  .option("-p, --project <path>", "project root")
  .action(async opts => {
    const root = projectPath(opts.project);
    const { report, filePath } = await writeEvaluationReport(root);
    console.log(`Wrote evaluation report to ${path.relative(root, filePath).replaceAll(path.sep, "/")}`);
    console.log(JSON.stringify(report, null, 2));
  });

const changesCommand = program.command("changes")
  .description("Inspect semantic change records");

changesCommand.command("review")
  .description("List generated scan change records eligible for consolidation")
  .option("-p, --project <path>", "project root")
  .action(async opts => {
    const root = projectPath(opts.project);
    const report = await reviewChangeRecords(root);
    console.log(JSON.stringify(report, null, 2));
  });

program.command("serve")
  .description("Serve the visual app locally")
  .option("-p, --project <path>", "project root")
  .option("--port <number>", "port; defaults to config visualApp.defaultPort or 4317")
  .action(async opts => {
    const root = projectPath(opts.project);
    const config = await readConfig(root);
    const port = Number(opts.port ?? config.visualApp?.defaultPort ?? 4317);
    const appDist = findVisualAppDist();
    if (!appDist) {
      console.error("The visual app is not installed or has not been built.");
      console.error("Use full mode with `npm install -D abstraction-tree`, or from the repo run `npm run build -w @abstraction-tree/app`.");
      console.error("Core commands still work: `atree scan`, `atree validate`, and `atree context`.");
      process.exitCode = 1;
      return;
    }
    if (config.installMode !== "full" || !config.visualApp?.enabled) {
      console.log("Visual app is available, but this project is in core mode. Enabling full mode for this workspace.");
      await setInstallMode(root, "full");
    }
    const serveStatic = sirv(appDist, { dev: true });
    const server = createServer(async (req, res) => {
      if (!req.url) return res.end();
      if (req.url.startsWith("/api/state")) {
        const state = {
          config: await readConfig(root),
          ontology: await readJson(atreePath(root, "ontology.json"), []),
          nodes: await readJson<TreeNode[]>(atreePath(root, "tree.json"), []),
          files: await readJson<FileSummary[]>(atreePath(root, "files.json"), []),
          concepts: await readJson<Concept[]>(atreePath(root, "concepts.json"), []),
          invariants: await readJson<Invariant[]>(atreePath(root, "invariants.json"), []),
          changes: validChangeRecords((await loadChanges(root)).records),
          agentHealth: await loadAgentHealth(root)
        };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(state));
        return;
      }
      serveStatic(req, res, () => fallback(res));
    });
    server.listen(port, () => console.log(`Abstraction Tree app: http://localhost:${port}`));
  });

async function collectValidationIssues(root: string): Promise<ValidationIssue[]> {
  const ontology = await readJson<AbstractionOntologyLevel[]>(atreePath(root, "ontology.json"), []);
  const nodes = await readJson<TreeNode[]>(atreePath(root, "tree.json"), []);
  const files = await readJson<FileSummary[]>(atreePath(root, "files.json"), []);
  const concepts = await readJson<Concept[]>(atreePath(root, "concepts.json"), []);
  const invariants = await readJson<Invariant[]>(atreePath(root, "invariants.json"), []);
  const loadedChanges = await loadChanges(root);
  const changes = loadedChanges.records;
  const existingConceptFilePaths = concepts
    .flatMap(concept => concept.relatedFiles ?? [])
    .filter(filePath => existsSync(path.resolve(root, filePath)));
  const existingInvariantFilePaths = invariants
    .flatMap(invariant => invariant.filePaths ?? [])
    .filter(filePath => existsSync(path.resolve(root, filePath)));
  const existingChangeFilePaths = changes
    .flatMap(change => stringArrayField(change, "filesChanged"))
    .filter(filePath => existsSync(path.resolve(root, filePath)));
  const currentScan = await scanProject(root);

  return [
    ...loadedChanges.issues,
    ...(await validateAutomation(root)),
    ...validateTree(nodes, files, ontology),
    ...validateConcepts(concepts, nodes, files, existingConceptFilePaths),
    ...validateInvariants(invariants, nodes, files, existingInvariantFilePaths),
    ...validateChanges(changes, nodes, files, invariants, existingChangeFilePaths),
    ...detectFileDrift(files, currentScan.files, nodes)
  ];
}

interface AgentHealth {
  latestRun?: {
    file: string;
    timestamp?: string;
    task?: string;
    result?: "success" | "partial" | "failed" | "no-op" | "unknown";
  };
  latestEvaluation?: {
    file: string;
    timestamp?: string;
    issueCount?: number;
    staleFileCount?: number;
    missingFileCount?: number;
  };
  validation?: {
    issueCount: number;
    errorCount: number;
    warningCount: number;
  };
  automation?: {
    loopsToday?: number;
    maxLoopsToday?: number;
    failedLoopsToday?: number;
    maxFailedLoops?: number;
    maxMinutesToday?: number;
    maxDiffLines?: number;
    stopRequested?: boolean;
    currentMission?: string;
    completedMissions?: number;
    failedMissions?: number;
  };
}

async function loadAgentHealth(root: string): Promise<AgentHealth> {
  const issues = await collectValidationIssues(root).catch(() => undefined);
  return {
    latestRun: await loadLatestRun(root),
    latestEvaluation: await loadLatestEvaluation(root),
    validation: issues ? {
      issueCount: issues.length,
      errorCount: issues.filter(issue => issue.severity === "error").length,
      warningCount: issues.filter(issue => issue.severity === "warning").length
    } : undefined,
    automation: await loadAutomationHealth(root)
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

function findVisualAppDist(): string | undefined {
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "packages/app/dist"),
    path.resolve(process.cwd(), "node_modules/@abstraction-tree/app/dist"),
    path.resolve(cliDir, "../../app/dist"),
    path.resolve(cliDir, "../../../app/dist"),
    path.resolve(cliDir, "../../@abstraction-tree/app/dist")
  ];
  return candidates.find(existsSync);
}

interface LoadedChanges {
  records: unknown[];
  issues: ValidationIssue[];
}

async function loadChanges(root: string): Promise<LoadedChanges> {
  const dir = atreePath(root, "changes");
  if (!existsSync(dir)) return { records: [], issues: [] };
  const fs = await import("node:fs/promises");
  const names = await fs.readdir(dir).catch(() => []);
  const records: unknown[] = [];
  const issues: ValidationIssue[] = [];
  for (const name of names.filter(n => n.endsWith(".json"))) {
    const filePath = path.join(dir, name);
    const raw = await readFile(filePath, "utf8").catch(() => "");
    if (!raw) continue;
    try {
      records.push(await readJson<unknown>(filePath, undefined));
    } catch {
      issues.push({
        severity: "error",
        filePath: path.relative(root, filePath).replaceAll(path.sep, "/"),
        message: `Change record ${name} is not valid JSON.`
      });
    }
  }
  return {
    records: records.sort((a, b) => changeSortKey(a).localeCompare(changeSortKey(b))),
    issues
  };
}

function changeSortKey(value: unknown): string {
  const record = objectRecord(value);
  return typeof record?.timestamp === "string" ? record.timestamp : "";
}

function validChangeRecords(values: unknown[]): ChangeRecord[] {
  return values.filter(isChangeRecord);
}

function isChangeRecord(value: unknown): value is ChangeRecord {
  const record = objectRecord(value);
  if (!record) return false;
  return (
    typeof record.id === "string" &&
    typeof record.timestamp === "string" &&
    typeof record.title === "string" &&
    typeof record.reason === "string" &&
    ["low", "medium", "high"].includes(String(record.risk)) &&
    stringArrayField(record, "affectedNodeIds").length === (Array.isArray(record.affectedNodeIds) ? record.affectedNodeIds.length : -1) &&
    stringArrayField(record, "filesChanged").length === (Array.isArray(record.filesChanged) ? record.filesChanged.length : -1) &&
    stringArrayField(record, "invariantsPreserved").length === (Array.isArray(record.invariantsPreserved) ? record.invariantsPreserved.length : -1)
  );
}

function stringArrayField(value: unknown, field: string): string[] {
  const record = objectRecord(value);
  const fieldValue = record?.[field];
  return Array.isArray(fieldValue) ? fieldValue.filter((item): item is string => typeof item === "string") : [];
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

function fallback(res: import("node:http").ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html");
  res.end(`<html><body><h1>Abstraction Tree</h1><p>The app bundle was found, but the requested route did not resolve.</p><p>API state is available at <a href="/api/state">/api/state</a>.</p></body></html>`);
}

program.parseAsync();
