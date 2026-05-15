import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  ATREE_BUILT_IN_PROFILE_NAMES,
  type AbstractionOntologyLevel,
  type AtreeBuiltInProfile,
  type AtreeBuiltInProfileName,
  type AtreeConfigOverride,
  type AtreeConfig,
  type ChangeRecord,
  type Concept,
  type ContextPack,
  type FileSummary,
  type ImportGraph,
  type InstallMode,
  type Invariant,
  type TreeNode,
  type ValidationIssue
} from "./schema.js";
import { emptyImportGraph } from "./importGraph.js";
import {
  assertRuntimeSchema,
  CURRENT_ATREE_SCHEMA_VERSION,
  invalidJsonIssue,
  migrateAtreeConfig,
  validateAtreeConfigOverrideSchema,
  validateAtreeConfigSchema,
  validateRuntimeSchema,
  RuntimeSchemaValidationError,
  type RuntimeSchemaKind
} from "./runtimeSchema.js";

export const ATREE_DIR = ".abstraction-tree";
export const ATREE_ROOT_CONFIG = "atree.config.json";

export const BUILT_IN_ATREE_PROFILES: AtreeBuiltInProfile[] = [{
  name: "node-monorepo",
  title: "Node Monorepo",
  summary: "Heuristic defaults for npm, pnpm, yarn, or bun workspaces with multiple packages or apps.",
  config: {
    ignored: [".turbo", ".turbo/**", ".next", ".next/**", "out", "out/**", "storybook-static", "storybook-static/**"],
    subsystemPatterns: [{
      id: "subsystem.node.workspace.packages",
      title: "Workspace Packages",
      summary: "Workspace packages, apps, and shared libraries in a JavaScript or TypeScript monorepo.",
      paths: ["packages/**", "apps/**", "libs/**", "libraries/**"],
      priority: 90,
      weight: 0.1,
      responsibilities: ["Own package-local source, package manifests, and workspace package boundaries."]
    }, {
      id: "subsystem.node.tooling",
      title: "Node Tooling",
      summary: "Root package, workspace, TypeScript, bundler, lint, and CI tooling files.",
      paths: ["package.json", "package-lock.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "yarn.lock", "bun.lock", "bun.lockb", "tsconfig*.json", "turbo.json", "vite.config.*", "vitest.config.*", "eslint.config.*", ".github/workflows/**"],
      priority: 70,
      weight: 0.08,
      responsibilities: ["Own workspace scripts, build tooling, dependency metadata, and JavaScript quality gates."]
    }, {
      id: "subsystem.node.tests",
      title: "Node Test Suites",
      paths: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "**/*.test.js", "**/*.spec.js", "__tests__/**", "tests/**"],
      priority: 60,
      weight: 0.08,
      responsibilities: ["Own JavaScript and TypeScript test fixtures, specs, and regression coverage."]
    }],
    domainVocabulary: [{
      concept: "workspace package",
      synonyms: ["workspace", "package", "monorepo", "workspaces"],
      weight: 3
    }, {
      concept: "tooling",
      synonyms: ["lint", "typecheck", "bundle", "script"],
      weight: 2
    }],
    conceptSignalWeights: { path: 3, symbol: 4, export: 5, doc: 1 },
    missionPlanning: {
      buildPatterns: ["package.json", "packages/*/package.json", "apps/*/package.json", "tsconfig*.json", "vite.config.*"],
      testPatterns: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "tests/**"],
      docsPatterns: ["README.md", "docs/**"]
    }
  }
}, {
  name: "react-app",
  title: "React App",
  summary: "Heuristic defaults for React or Vite-style frontend applications.",
  config: {
    ignored: [".next", ".next/**", "out", "out/**", "storybook-static", "storybook-static/**"],
    subsystemPatterns: [{
      id: "subsystem.react.ui",
      title: "React UI Components",
      paths: ["src/components/**", "src/pages/**", "src/routes/**", "src/app/**", "app/**", "pages/**"],
      fileNames: ["*.tsx", "*.jsx"],
      priority: 90,
      weight: 0.12,
      responsibilities: ["Own React views, routes, page composition, and reusable UI components."]
    }, {
      id: "subsystem.react.state",
      title: "Frontend State and Hooks",
      paths: ["src/hooks/**", "src/state/**", "src/store/**", "src/context/**"],
      fileNames: ["use*.ts", "use*.tsx", "*.store.ts", "*.context.tsx"],
      priority: 75,
      weight: 0.08,
      responsibilities: ["Own client-side state, hooks, context providers, and data-fetching adapters."]
    }, {
      id: "subsystem.react.assets.styles",
      title: "Assets and Styling",
      paths: ["src/assets/**", "src/styles/**", "public/**", "src/**/*.css", "src/**/*.scss"],
      priority: 55,
      weight: 0.06,
      responsibilities: ["Own frontend assets, global styles, and component styling surfaces."]
    }],
    domainVocabulary: [{
      concept: "component",
      synonyms: ["tsx", "jsx", "view", "page", "route"],
      weight: 3
    }, {
      concept: "client state",
      synonyms: ["hook", "store", "context", "provider"],
      weight: 3
    }],
    conceptSignalWeights: { path: 3, symbol: 5, export: 5, doc: 1 },
    missionPlanning: {
      buildPatterns: ["package.json", "vite.config.*", "next.config.*", "tsconfig*.json"],
      testPatterns: ["src/**/*.test.tsx", "src/**/*.spec.tsx", "tests/**"],
      docsPatterns: ["README.md", "docs/**", "storybook/**"]
    }
  }
}, {
  name: "python-package",
  title: "Python Package",
  summary: "Heuristic defaults for Python libraries and CLI packages.",
  config: {
    ignored: [".venv", ".venv/**", "venv", "venv/**", "__pycache__", "**/__pycache__/**", ".pytest_cache", ".pytest_cache/**", "htmlcov", "htmlcov/**"],
    subsystemPatterns: [{
      id: "subsystem.python.package",
      title: "Python Package Source",
      paths: ["src/*.py", "src/**/*.py", "*.py"],
      priority: 90,
      weight: 0.1,
      responsibilities: ["Own importable Python package modules and public package API surfaces."]
    }, {
      id: "subsystem.python.cli",
      title: "Python CLI Entrypoints",
      paths: ["src/**/cli.py", "src/**/__main__.py", "*/cli.py", "*/__main__.py"],
      symbols: ["main", "cli", "Command"],
      priority: 80,
      weight: 0.1,
      responsibilities: ["Own command-line entrypoints, option parsing, and console script behavior."]
    }, {
      id: "subsystem.python.tests",
      title: "Python Tests",
      paths: ["tests/**", "test_*.py", "**/test_*.py", "**/*_test.py"],
      priority: 65,
      weight: 0.08,
      responsibilities: ["Own pytest, unittest, and package regression coverage."]
    }, {
      id: "subsystem.python.packaging",
      title: "Python Packaging",
      paths: ["pyproject.toml", "setup.py", "setup.cfg", "tox.ini", "pytest.ini"],
      priority: 60,
      weight: 0.06,
      responsibilities: ["Own package metadata, test runner configuration, and Python build configuration."]
    }],
    domainVocabulary: [{
      concept: "package api",
      synonyms: ["module", "package", "__init__", "public api"],
      weight: 3
    }, {
      concept: "python cli",
      synonyms: ["argparse", "click", "typer", "console script"],
      weight: 3
    }],
    conceptSignalWeights: { path: 3, symbol: 4, export: 4, doc: 1 },
    missionPlanning: {
      buildPatterns: ["pyproject.toml", "setup.py", "setup.cfg"],
      testPatterns: ["tests/**", "test_*.py", "**/test_*.py", "**/*_test.py"],
      docsPatterns: ["README.md", "docs/**", "*.rst"]
    }
  }
}, {
  name: "rust-cli",
  title: "Rust CLI",
  summary: "Heuristic defaults for Cargo-based command-line tools.",
  config: {
    ignored: ["target", "target/**"],
    subsystemPatterns: [{
      id: "subsystem.rust.cli",
      title: "Rust CLI Surface",
      paths: ["src/main.rs", "src/bin/**", "src/cli.rs", "src/args.rs", "src/commands/**"],
      symbols: ["main", "Args", "Cli", "Options", "Parser", "Subcommand"],
      priority: 95,
      weight: 0.12,
      responsibilities: ["Own binary entrypoints, argument parsing, subcommands, and CLI user contracts."]
    }, {
      id: "subsystem.rust.core",
      title: "Rust Core Crate Logic",
      paths: ["src/lib.rs", "src/*.rs", "src/**/*.rs"],
      priority: 75,
      weight: 0.08,
      responsibilities: ["Own reusable crate modules, domain logic, traversal, and library APIs."]
    }, {
      id: "subsystem.rust.tests",
      title: "Rust Tests and Benchmarks",
      paths: ["tests/**", "benches/**", "**/*_test.rs"],
      priority: 65,
      weight: 0.08,
      responsibilities: ["Own integration tests, benchmarks, and Rust regression coverage."]
    }, {
      id: "subsystem.rust.packaging",
      title: "Cargo Packaging",
      paths: ["Cargo.toml", "Cargo.lock"],
      priority: 60,
      weight: 0.06,
      responsibilities: ["Own Cargo package metadata, binary declarations, features, and dependency lockfiles."]
    }],
    domainVocabulary: [{
      concept: "cli arguments",
      synonyms: ["args", "clap", "options", "subcommand", "parser"],
      weight: 4
    }, {
      concept: "crate",
      synonyms: ["cargo", "binary", "lib", "module"],
      weight: 3
    }],
    conceptSignalWeights: { path: 3, symbol: 4, export: 4, doc: 1 },
    missionPlanning: {
      buildPatterns: ["Cargo.toml", "Cargo.lock", "src/**/*.rs"],
      testPatterns: ["tests/**", "benches/**", "**/*_test.rs"],
      docsPatterns: ["README.md", "docs/**"],
      buildCommands: ["cargo build"],
      testCommands: ["cargo test"]
    }
  }
}, {
  name: "go-service",
  title: "Go Service",
  summary: "Heuristic defaults for Go API services and command binaries.",
  config: {
    ignored: ["bin", "bin/**", "vendor", "vendor/**"],
    subsystemPatterns: [{
      id: "subsystem.go.commands",
      title: "Go Commands",
      paths: ["cmd/**", "main.go", "*/main.go"],
      priority: 90,
      weight: 0.1,
      responsibilities: ["Own service and CLI entrypoints under Go command packages."]
    }, {
      id: "subsystem.go.api",
      title: "Go API Boundary",
      paths: ["internal/handler/**", "internal/handlers/**", "internal/http/**", "internal/api/**", "pkg/api/**"],
      symbols: ["Handler", "ServeHTTP", "Router"],
      priority: 85,
      weight: 0.1,
      responsibilities: ["Own HTTP handlers, routers, middleware, and request/response boundaries."]
    }, {
      id: "subsystem.go.service.logic",
      title: "Go Service Logic",
      paths: ["internal/service/**", "internal/services/**", "internal/domain/**", "internal/usecase/**", "pkg/**"],
      priority: 75,
      weight: 0.08,
      responsibilities: ["Own service-layer logic, domain behavior, and reusable Go packages."]
    }, {
      id: "subsystem.go.tests",
      title: "Go Tests",
      paths: ["**/*_test.go", "test/**", "tests/**"],
      priority: 65,
      weight: 0.08,
      responsibilities: ["Own Go unit, integration, and service regression coverage."]
    }],
    domainVocabulary: [{
      concept: "service api",
      synonyms: ["handler", "router", "middleware", "endpoint"],
      weight: 3
    }, {
      concept: "go module",
      synonyms: ["go.mod", "package", "cmd", "internal"],
      weight: 3
    }],
    conceptSignalWeights: { path: 3, symbol: 4, export: 4, doc: 1 },
    missionPlanning: {
      buildPatterns: ["go.mod", "go.sum", "cmd/**", "internal/**", "pkg/**"],
      testPatterns: ["**/*_test.go"],
      docsPatterns: ["README.md", "docs/**"],
      buildCommands: ["go build ./..."],
      testCommands: ["go test ./..."]
    }
  }
}, {
  name: "docs-book",
  title: "Documentation Book",
  summary: "Heuristic defaults for mdBook-style or chapter-oriented documentation repositories.",
  config: {
    ignored: ["book", "book/**", "target", "target/**", "site", "site/**"],
    subsystemPatterns: [{
      id: "subsystem.docs.book.structure",
      title: "Book Structure",
      paths: ["book.toml", "mdbook.yml", "mdbook.yaml", "src/SUMMARY.md", "SUMMARY.md"],
      priority: 95,
      weight: 0.12,
      responsibilities: ["Own book table of contents, book metadata, and chapter ordering."]
    }, {
      id: "subsystem.docs.book.chapters",
      title: "Chapter Content",
      paths: ["src/*.md", "src/**/*.md", "chapters/**", "docs/**", "*.md", "*.rst"],
      priority: 85,
      weight: 0.1,
      responsibilities: ["Own prose chapters, appendices, reference pages, and tutorial content."]
    }, {
      id: "subsystem.docs.book.listings",
      title: "Listings and Examples",
      paths: ["listings/**", "examples/**", "code/**", "samples/**"],
      priority: 70,
      weight: 0.08,
      responsibilities: ["Own runnable listings, sample projects, and example code referenced by the book."]
    }, {
      id: "subsystem.docs.book.quality",
      title: "Editorial Quality",
      paths: ["scripts/**", "tools/**", ".github/workflows/**", "vale.ini", ".vale.ini", "lychee.toml", "cspell.json", "markdownlint.json"],
      priority: 60,
      weight: 0.06,
      responsibilities: ["Own docs build scripts, link checks, spell checks, and publishing quality gates."]
    }],
    domainVocabulary: [{
      concept: "chapter",
      synonyms: ["summary", "appendix", "listing", "book section"],
      weight: 4
    }, {
      concept: "editorial quality",
      synonyms: ["linkcheck", "spellcheck", "markdownlint", "vale", "lychee"],
      weight: 3
    }],
    conceptSignalWeights: { path: 4, symbol: 3, export: 3, doc: 2 },
    missionPlanning: {
      buildPatterns: ["book.toml", "mdbook.yml", "mdbook.yaml", "src/SUMMARY.md"],
      testPatterns: ["listings/**", "examples/**", "scripts/**"],
      docsPatterns: ["src/**", "chapters/**", "docs/**", "*.md", "*.rst"],
      docsCommands: ["mdbook build"],
      testCommands: ["mdbook test"]
    }
  }
}, {
  name: "mixed-fullstack",
  title: "Mixed Fullstack",
  summary: "Heuristic defaults for repositories with frontend, backend, shared code, and operational checks.",
  config: {
    ignored: [".next", ".next/**", "dist", "dist/**", "build", "build/**", "coverage", "coverage/**"],
    subsystemPatterns: [{
      id: "subsystem.fullstack.frontend",
      title: "Frontend App",
      paths: ["frontend/**", "client/**", "web/**", "apps/web/**", "src/components/**", "src/pages/**"],
      priority: 90,
      weight: 0.1,
      responsibilities: ["Own browser UI, frontend routing, client-side state, and user-facing assets."]
    }, {
      id: "subsystem.fullstack.backend",
      title: "Backend Service",
      paths: ["backend/**", "server/**", "api/**", "apps/api/**", "src/api/**", "src/server/**"],
      priority: 88,
      weight: 0.1,
      responsibilities: ["Own API routes, server runtime, request handling, and backend orchestration."]
    }, {
      id: "subsystem.fullstack.shared",
      title: "Shared Contracts",
      paths: ["shared/**", "common/**", "packages/shared/**", "src/types/**", "src/schema/**"],
      priority: 78,
      weight: 0.08,
      responsibilities: ["Own shared types, API contracts, validation schemas, and cross-tier utilities."]
    }, {
      id: "subsystem.fullstack.data",
      title: "Data and Persistence",
      paths: ["db/**", "database/**", "migrations/**", "prisma/**", "src/models/**", "src/repositories/**"],
      priority: 72,
      weight: 0.08,
      responsibilities: ["Own database schema, migrations, models, and persistence boundaries."]
    }, {
      id: "subsystem.fullstack.tests",
      title: "Fullstack Tests",
      paths: ["tests/**", "e2e/**", "**/*.test.ts", "**/*.spec.ts", "**/*_test.go", "**/test_*.py"],
      priority: 65,
      weight: 0.08,
      responsibilities: ["Own unit, integration, and end-to-end regression coverage across tiers."]
    }],
    domainVocabulary: [{
      concept: "api contract",
      synonyms: ["schema", "dto", "validation", "endpoint", "route"],
      weight: 3
    }, {
      concept: "frontend backend boundary",
      synonyms: ["client", "server", "fullstack", "shared"],
      weight: 3
    }],
    conceptSignalWeights: { path: 3, symbol: 4, export: 5, doc: 1 },
    missionPlanning: {
      buildPatterns: ["package.json", "go.mod", "pyproject.toml", "Dockerfile", "docker-compose.yml"],
      testPatterns: ["tests/**", "e2e/**", "**/*.test.ts", "**/*.spec.ts", "**/*_test.go", "**/test_*.py"],
      docsPatterns: ["README.md", "docs/**"]
    }
  }
}];

export function builtInAtreeProfileNames(): AtreeBuiltInProfileName[] {
  return [...ATREE_BUILT_IN_PROFILE_NAMES];
}

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
      ...existing.visualApp,
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

export interface EffectiveConfigOptions {
  configPath?: string;
  customConfig?: boolean;
  globalConfigPath?: string;
  profile?: AtreeBuiltInProfileName | string;
}

export async function readEffectiveConfig(projectRoot: string, options: EffectiveConfigOptions = {}): Promise<AtreeConfig> {
  let config = await readConfig(projectRoot);
  if (options.profile) config = mergeAtreeConfigOverride(config, configOverrideForProfile(options.profile));
  if (options.customConfig === false) return config;

  const globalConfigPath = options.globalConfigPath ?? path.join(homedir(), ATREE_DIR, "config.json");
  const globalOverride = await readConfigOverrideFile(projectRoot, globalConfigPath, { required: false });
  if (globalOverride) config = mergeAtreeConfigOverride(config, globalOverride);

  const localConfigPath = options.configPath
    ? resolveConfigPath(projectRoot, options.configPath)
    : path.join(projectRoot, ATREE_ROOT_CONFIG);
  const localOverride = await readConfigOverrideFile(projectRoot, localConfigPath, { required: Boolean(options.configPath) });
  if (localOverride) config = mergeAtreeConfigOverride(config, localOverride);

  return config;
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

async function readConfigOverrideFile(
  projectRoot: string,
  filePath: string,
  options: { required: boolean }
): Promise<AtreeConfigOverride | undefined> {
  const absolutePath = path.resolve(filePath);
  const relativePath = configPathLabel(projectRoot, absolutePath);
  if (!existsSync(absolutePath)) {
    if (!options.required) return undefined;
    throw new RuntimeSchemaValidationError([{
      severity: "error",
      filePath: relativePath,
      fieldPath: "$",
      message: `${relativePath} does not exist.`,
      recoveryHint: "Pass an existing JSON file to `atree scan --config`, or omit --config to use the project root atree.config.json."
    }]);
  }

  let value: unknown;
  try {
    value = await readJson<unknown>(absolutePath, undefined);
  } catch {
    throw new RuntimeSchemaValidationError([invalidJsonIssue(relativePath, "Fix the custom Abstraction Tree config JSON.")]);
  }

  const issues = validateAtreeConfigOverrideSchema(value, relativePath);
  if (issues.some(issue => issue.severity === "error")) {
    throw new RuntimeSchemaValidationError(issues);
  }

  return value as AtreeConfigOverride;
}

function mergeAtreeConfigOverride(base: AtreeConfig, override: AtreeConfigOverride): AtreeConfig {
  const {
    version: _version,
    createdAt: _createdAt,
    ignored,
    importAliases,
    subsystemPatterns,
    domainVocabulary,
    conceptSignalWeights,
    missionPlanning,
    visualApp,
    ...rest
  } = override;

  const merged: AtreeConfig = {
    ...base,
    ...rest,
    version: base.version,
    createdAt: base.createdAt,
    ignored: ignored ? uniqueStrings([...base.ignored, ...ignored]) : base.ignored,
    visualApp: visualApp ? { ...base.visualApp, ...visualApp } : base.visualApp
  };

  if (missionPlanning) merged.missionPlanning = { ...base.missionPlanning, ...missionPlanning };
  if (importAliases) merged.importAliases = [...(base.importAliases ?? []), ...importAliases];
  if (subsystemPatterns) merged.subsystemPatterns = mergeConfigItems(base.subsystemPatterns, subsystemPatterns, "id");
  if (domainVocabulary) merged.domainVocabulary = mergeDomainVocabulary(base.domainVocabulary, domainVocabulary);
  if (conceptSignalWeights) merged.conceptSignalWeights = { ...base.conceptSignalWeights, ...conceptSignalWeights };

  return merged;
}

function configOverrideForProfile(profileName: string): AtreeConfigOverride {
  const normalizedProfileName = profileName.trim();
  const profile = BUILT_IN_ATREE_PROFILES.find(candidate => candidate.name === normalizedProfileName);
  if (profile) return profile.config;

  throw new RuntimeSchemaValidationError([{
    severity: "error",
    filePath: "atree scan --profile",
    fieldPath: "$.profile",
    message: `Unknown built-in profile ${normalizedProfileName || "(empty)"}. Supported profiles: ${ATREE_BUILT_IN_PROFILE_NAMES.join(", ")}.`,
    recoveryHint: "Choose one supported profile name, or omit --profile to keep default scan behavior."
  }]);
}

function mergeConfigItems<T extends object>(base: T[] | undefined, override: T[], key: keyof T): T[] {
  const merged = new Map<string, T>();
  for (const item of base ?? []) merged.set(String(item[key]), item);
  for (const item of override) {
    const itemKey = String(item[key]);
    merged.set(itemKey, { ...(merged.get(itemKey) ?? {}), ...item });
  }
  return [...merged.values()];
}

function mergeDomainVocabulary(
  base: AtreeConfig["domainVocabulary"] | undefined,
  override: NonNullable<AtreeConfig["domainVocabulary"]>
): NonNullable<AtreeConfig["domainVocabulary"]> {
  const merged = new Map<string, NonNullable<AtreeConfig["domainVocabulary"]>[number]>();
  for (const item of base ?? []) merged.set(item.concept.toLowerCase(), item);
  for (const item of override) {
    const key = item.concept.toLowerCase();
    const existing = merged.get(key);
    merged.set(key, existing ? {
      ...existing,
      ...item,
      synonyms: uniqueStrings([...(existing.synonyms ?? []), ...item.synonyms])
    } : item);
  }
  return [...merged.values()];
}

function resolveConfigPath(projectRoot: string, input: string): string {
  const expanded = input === "~" || input.startsWith("~/") || input.startsWith("~\\")
    ? path.join(homedir(), input.slice(2))
    : input;
  return path.resolve(projectRoot, expanded);
}

function configPathLabel(projectRoot: string, absolutePath: string): string {
  const relative = path.relative(projectRoot, absolutePath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return normalizePath(relative || ".");
  }
  return normalizePath(absolutePath);
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizePath(input: string): string {
  return input.replaceAll(path.sep, "/");
}
