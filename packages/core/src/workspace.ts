import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  AbstractionOntologyLevel,
  AtreeConfig,
  ChangeRecord,
  Concept,
  ContextPack,
  FileSummary,
  ImportGraph,
  InstallMode,
  Invariant,
  TreeNode,
  ValidationIssue
} from "./schema.js";
import { emptyImportGraph } from "./importGraph.js";
import {
  assertRuntimeSchema,
  CURRENT_ATREE_SCHEMA_VERSION,
  invalidJsonIssue,
  migrateAtreeConfig,
  validateAtreeConfigSchema,
  validateRuntimeSchema,
  type RuntimeSchemaKind
} from "./runtimeSchema.js";

export const ATREE_DIR = ".abstraction-tree";

export function atreePath(projectRoot: string, ...parts: string[]) {
  return path.join(projectRoot, ATREE_DIR, ...parts);
}

export function defaultConfig(projectRoot: string, installMode: InstallMode = "core", projectName?: string): AtreeConfig {
  return {
    version: CURRENT_ATREE_SCHEMA_VERSION,
    projectName: projectName ?? path.basename(projectRoot),
    createdAt: new Date().toISOString(),
    sourceRoot: ".",
    ignored: ["node_modules", "dist", "dist-ts", "build", ".git", ".abstraction-tree", "coverage"],
    respectGitignore: false,
    treeBuilder: "deterministic",
    installMode,
    visualApp: {
      enabled: installMode === "full",
      defaultPort: 4317
    }
  };
}

export async function ensureWorkspace(projectRoot: string, options?: { projectName?: string; installMode?: InstallMode }) {
  await mkdir(atreePath(projectRoot), { recursive: true });
  await mkdir(atreePath(projectRoot, "changes"), { recursive: true });
  await mkdir(atreePath(projectRoot, "context-packs"), { recursive: true });
  await mkdir(atreePath(projectRoot, "proposals"), { recursive: true });
  await mkdir(atreePath(projectRoot, "scopes"), { recursive: true });
  await mkdir(atreePath(projectRoot, "goals"), { recursive: true });

  const configPath = atreePath(projectRoot, "config.json");
  if (!existsSync(configPath)) {
    await writeJson(configPath, defaultConfig(projectRoot, options?.installMode ?? "core", options?.projectName));
    return;
  }

  const existing = await readConfig(projectRoot);
  const merged: AtreeConfig = {
    ...defaultConfig(projectRoot, options?.installMode ?? existing.installMode ?? "core", existing.projectName),
    ...existing,
    installMode: options?.installMode ?? existing.installMode ?? "core",
    visualApp: {
      enabled: options?.installMode ? options.installMode === "full" : existing.visualApp?.enabled ?? false,
      defaultPort: existing.visualApp?.defaultPort ?? 4317
    }
  };
  await writeJson(configPath, merged);
}

export async function setInstallMode(projectRoot: string, installMode: InstallMode) {
  await ensureWorkspace(projectRoot, { installMode });
  const config = await readConfig(projectRoot);
  await writeJson(atreePath(projectRoot, "config.json"), {
    ...config,
    installMode,
    visualApp: {
      ...config.visualApp,
      enabled: installMode === "full"
    }
  });
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(stripJsonBom(raw)) as T;
}

function stripJsonBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

export async function writeJson(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function readConfig(projectRoot: string): Promise<AtreeConfig> {
  return readRequiredMemoryJson<AtreeConfig>(
    atreePath(projectRoot, "config.json"),
    ".abstraction-tree/config.json",
    defaultConfig(projectRoot),
    "config",
    value => migrateAtreeConfig(value)
  );
}

export interface MemoryLoadResult<T> {
  data: T;
  issues: ValidationIssue[];
}

export interface LoadedChangeRecordObject {
  filePath: string;
  record: Record<string, unknown>;
}

export interface ChangeRecordObjectLoadResult {
  records: LoadedChangeRecordObject[];
  issues: ValidationIssue[];
}

export interface AtreeMemory {
  config: AtreeConfig;
  files: FileSummary[];
  importGraph: ImportGraph;
  ontology: AbstractionOntologyLevel[];
  nodes: TreeNode[];
  concepts: Concept[];
  invariants: Invariant[];
  changes: ChangeRecord[];
  contextPacks: ContextPack[];
  evaluations: Record<string, unknown>[];
  issues: ValidationIssue[];
}

export async function loadAtreeMemory(projectRoot: string): Promise<AtreeMemory> {
  const config = await loadConfig(projectRoot);
  if (config.issues.some(issue => issue.severity === "error")) {
    return emptyMemory(projectRoot, config.data, config.issues);
  }

  const [files, importGraph, ontology, nodes, concepts, invariants, changes, contextPacks, evaluations] = await Promise.all([
    loadMemoryJson<FileSummary[]>(atreePath(projectRoot, "files.json"), ".abstraction-tree/files.json", [], "files"),
    loadMemoryJson<ImportGraph>(atreePath(projectRoot, "import-graph.json"), ".abstraction-tree/import-graph.json", emptyImportGraph(), "import-graph"),
    loadMemoryJson<AbstractionOntologyLevel[]>(atreePath(projectRoot, "ontology.json"), ".abstraction-tree/ontology.json", [], "ontology"),
    loadMemoryJson<TreeNode[]>(atreePath(projectRoot, "tree.json"), ".abstraction-tree/tree.json", [], "tree"),
    loadMemoryJson<Concept[]>(atreePath(projectRoot, "concepts.json"), ".abstraction-tree/concepts.json", [], "concepts"),
    loadMemoryJson<Invariant[]>(atreePath(projectRoot, "invariants.json"), ".abstraction-tree/invariants.json", [], "invariants"),
    loadChangeRecords(projectRoot),
    loadMemoryDir<ContextPack>(atreePath(projectRoot, "context-packs"), ".abstraction-tree/context-packs", "context-pack"),
    loadMemoryDir<Record<string, unknown>>(atreePath(projectRoot, "evaluations"), ".abstraction-tree/evaluations", "evaluation")
  ]);

  return {
    config: config.data,
    files: files.data,
    importGraph: importGraph.data,
    ontology: ontology.data,
    nodes: nodes.data,
    concepts: concepts.data,
    invariants: invariants.data,
    changes: changes.data,
    contextPacks: contextPacks.data,
    evaluations: evaluations.data,
    issues: [
      ...config.issues,
      ...files.issues,
      ...importGraph.issues,
      ...ontology.issues,
      ...nodes.issues,
      ...concepts.issues,
      ...invariants.issues,
      ...changes.issues,
      ...contextPacks.issues,
      ...evaluations.issues
    ]
  };
}

export async function readFileSummaries(projectRoot: string): Promise<FileSummary[]> {
  return readRequiredMemoryJson<FileSummary[]>(atreePath(projectRoot, "files.json"), ".abstraction-tree/files.json", [], "files");
}

export async function readImportGraph(projectRoot: string): Promise<ImportGraph> {
  return readRequiredMemoryJson<ImportGraph>(atreePath(projectRoot, "import-graph.json"), ".abstraction-tree/import-graph.json", emptyImportGraph(), "import-graph");
}

export async function readOntology(projectRoot: string): Promise<AbstractionOntologyLevel[]> {
  return readRequiredMemoryJson<AbstractionOntologyLevel[]>(atreePath(projectRoot, "ontology.json"), ".abstraction-tree/ontology.json", [], "ontology");
}

export async function readTreeNodes(projectRoot: string): Promise<TreeNode[]> {
  return readRequiredMemoryJson<TreeNode[]>(atreePath(projectRoot, "tree.json"), ".abstraction-tree/tree.json", [], "tree");
}

export async function readConcepts(projectRoot: string): Promise<Concept[]> {
  return readRequiredMemoryJson<Concept[]>(atreePath(projectRoot, "concepts.json"), ".abstraction-tree/concepts.json", [], "concepts");
}

export async function readInvariants(projectRoot: string): Promise<Invariant[]> {
  return readRequiredMemoryJson<Invariant[]>(atreePath(projectRoot, "invariants.json"), ".abstraction-tree/invariants.json", [], "invariants");
}

export async function readChangeRecords(projectRoot: string): Promise<ChangeRecord[]> {
  const result = await loadChangeRecords(projectRoot);
  return result.data;
}

export async function loadChangeRecords(projectRoot: string): Promise<MemoryLoadResult<ChangeRecord[]>> {
  const loaded = await loadChangeRecordObjects(projectRoot);
  const invalidRecordPaths = new Set<string>();
  for (const issue of loaded.issues) {
    if (issue.severity === "error" && issue.filePath?.startsWith(".abstraction-tree/changes/")) {
      invalidRecordPaths.add(issue.filePath);
    }
  }
  return {
    data: loaded.records
      .filter(change => !invalidRecordPaths.has(change.filePath))
      .map(change => change.record as unknown as ChangeRecord),
    issues: loaded.issues
  };
}

export async function loadChangeRecordObjects(projectRoot: string): Promise<ChangeRecordObjectLoadResult> {
  const dirPath = atreePath(projectRoot, "changes");
  const relativeDir = ".abstraction-tree/changes";
  const kind: RuntimeSchemaKind = "change";
  if (!existsSync(dirPath)) return { records: [], issues: [] };

  const names = await readdir(dirPath).catch(() => undefined);
  if (!names) {
    return {
      records: [],
      issues: [{
        severity: "error",
        filePath: relativeDir,
        fieldPath: "$",
        message: `${relativeDir} could not be read.`,
        recoveryHint: "Check filesystem permissions for the .abstraction-tree directory."
      }]
    };
  }

  const records: LoadedChangeRecordObject[] = [];
  const issues: ValidationIssue[] = [];
  for (const name of names.filter(candidate => candidate.endsWith(".json")).sort()) {
    const filePath = `${relativeDir}/${name}`;
    let value: unknown;
    try {
      value = await readJson<unknown>(path.join(dirPath, name), undefined);
    } catch {
      issues.push(invalidJsonIssue(filePath, recoveryHintForKind(kind)));
      continue;
    }

    issues.push(...validateRuntimeSchema(kind, value, filePath));
    const record = objectRecord(value);
    if (record) records.push({ filePath, record });
  }

  return { records, issues };
}

export async function readContextPacks(projectRoot: string): Promise<ContextPack[]> {
  const result = await loadMemoryDir<ContextPack>(atreePath(projectRoot, "context-packs"), ".abstraction-tree/context-packs", "context-pack");
  assertRuntimeSchema(result.issues);
  return result.data;
}

export async function readEvaluationReports(projectRoot: string): Promise<Record<string, unknown>[]> {
  const result = await loadMemoryDir<Record<string, unknown>>(atreePath(projectRoot, "evaluations"), ".abstraction-tree/evaluations", "evaluation");
  assertRuntimeSchema(result.issues);
  return result.data;
}

async function loadConfig(projectRoot: string): Promise<MemoryLoadResult<AtreeConfig>> {
  const fallback = defaultConfig(projectRoot);
  const result = await loadMemoryJson<AtreeConfig>(
    atreePath(projectRoot, "config.json"),
    ".abstraction-tree/config.json",
    fallback,
    "config"
  );
  if (result.issues.some(issue => issue.severity === "error")) return result;
  return { data: migrateAtreeConfig(result.data), issues: result.issues };
}

async function readRequiredMemoryJson<T>(
  filePath: string,
  relativePath: string,
  fallback: T,
  kind: RuntimeSchemaKind,
  migrate: (value: T) => T = value => value
): Promise<T> {
  const result = await loadMemoryJson<T>(filePath, relativePath, fallback, kind);
  assertRuntimeSchema(result.issues);
  return migrate(result.data);
}

async function loadMemoryJson<T>(
  filePath: string,
  relativePath: string,
  fallback: T,
  kind: RuntimeSchemaKind
): Promise<MemoryLoadResult<T>> {
  if (!existsSync(filePath)) return { data: fallback, issues: [] };

  let value: unknown;
  try {
    value = await readJson<unknown>(filePath, undefined);
  } catch {
    return { data: fallback, issues: [invalidJsonIssue(relativePath, recoveryHintForKind(kind))] };
  }

  const issues = kind === "config"
    ? validateAtreeConfigSchema(value, relativePath)
    : validateRuntimeSchema(kind, value, relativePath);
  return {
    data: issues.some(issue => issue.severity === "error") ? fallback : value as T,
    issues
  };
}

async function loadMemoryDir<T>(
  dirPath: string,
  relativeDir: string,
  kind: RuntimeSchemaKind
): Promise<MemoryLoadResult<T[]>> {
  if (!existsSync(dirPath)) return { data: [], issues: [] };

  const names = await readdir(dirPath).catch(() => undefined);
  if (!names) {
    return {
      data: [],
      issues: [{
        severity: "error",
        filePath: relativeDir,
        fieldPath: "$",
        message: `${relativeDir} could not be read.`,
        recoveryHint: "Check filesystem permissions for the .abstraction-tree directory."
      }]
    };
  }

  const data: T[] = [];
  const issues: ValidationIssue[] = [];
  for (const name of names.filter(candidate => candidate.endsWith(".json")).sort()) {
    const relativePath = `${relativeDir}/${name}`;
    const result = await loadMemoryJson<T | undefined>(
      path.join(dirPath, name),
      relativePath,
      undefined,
      kind
    );
    issues.push(...result.issues);
    if (!result.issues.some(issue => issue.severity === "error") && result.data !== undefined) {
      data.push(result.data);
    }
  }

  return { data, issues };
}

function emptyMemory(projectRoot: string, config: AtreeConfig, issues: ValidationIssue[]): AtreeMemory {
  return {
    config,
    files: [],
    importGraph: emptyImportGraph(),
    ontology: [],
    nodes: [],
    concepts: [],
    invariants: [],
    changes: [],
    contextPacks: [],
    evaluations: [],
    issues
  };
}

function recoveryHintForKind(kind: RuntimeSchemaKind): string {
  if (kind === "config") return "Fix .abstraction-tree/config.json or recreate it with `atree init`.";
  if (kind === "context-pack" || kind === "context-packs") return "Fix the JSON syntax or regenerate this context pack with `atree context`.";
  if (kind === "evaluation" || kind === "evaluations") return "Fix the JSON syntax or regenerate this evaluation report with `atree evaluate`.";
  if (kind === "change" || kind === "changes") return "Fix the JSON syntax or replace this file with a valid semantic change record.";
  return "Fix the JSON syntax or regenerate project memory with `atree scan`.";
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
