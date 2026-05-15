export interface DiffFileChange {
  path: string;
  status?: string;
  addedLines?: number;
  deletedLines?: number;
  untracked?: boolean;
}

export interface DiffSummaryOptions {
  maxDiffLines?: number;
  maxFiles?: number;
  broadAreaCount?: number;
}

export interface DiffSummaryFile {
  path: string;
  status: string;
  addedLines: number;
  deletedLines: number;
  areas: string[];
  dangerousReasons: string[];
  untracked: boolean;
}

export interface DangerousFileChange {
  path: string;
  reasons: string[];
}

export interface OverreachSignal {
  kind:
    | "file-count"
    | "line-count"
    | "broad-areas"
    | "generated-only-change"
    | "docs-only-change"
    | "package-metadata-change"
    | "implementation-without-test"
    | "source-changed-memory-not-refreshed"
    | "cross-subsystem-change"
    | "source-app-docs-automation";
  message: string;
}

export interface DiffSummary {
  changedFileCount: number;
  addedLines: number;
  deletedLines: number;
  changedLines: number;
  changedSourceFiles: number;
  changedTestFiles: number;
  changedDocsFiles: number;
  changedMemoryFiles: number;
  changedGeneratedMemoryFiles: number;
  changedAutomationFiles: number;
  changedPackageFiles: number;
  changedCiFiles: number;
  changedAppFiles: number;
  changedAreas: string[];
  dangerousFileChanges: DangerousFileChange[];
  overreach: OverreachSignal[];
  thresholds: {
    maxDiffLines: number;
    maxFiles: number;
    broadAreaCount: number;
  };
  files: DiffSummaryFile[];
}

export interface GitDiffOutputs {
  numstat: string;
  nameStatus?: string;
  untrackedFiles?: string;
  untrackedLineCounts?: Record<string, number>;
}

const DEFAULT_MAX_DIFF_LINES = 1000;
const DEFAULT_MAX_FILES = 25;
const DEFAULT_BROAD_AREA_COUNT = 4;

const sourceExtensions = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".cts",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".mjs",
  ".mts",
  ".php",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".swift",
  ".ts",
  ".tsx"
]);

const docExtensions = new Set([".adoc", ".md", ".mdx", ".rst", ".txt"]);
const lockfileNames = new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pipfile.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock"
]);
const packageFileNames = new Set([
  "package.json",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb"
]);
const packageManagerConfigNames = new Set([
  ".node-version",
  ".npmrc",
  ".nvmrc",
  ".pnpmrc",
  ".yarnrc",
  ".yarnrc.yml",
  "pnpm-workspace.yaml"
]);

export function buildDiffSummary(changes: DiffFileChange[], options: DiffSummaryOptions = {}): DiffSummary {
  const maxDiffLines = integerOrDefault(options.maxDiffLines, DEFAULT_MAX_DIFF_LINES);
  const maxFiles = integerOrDefault(options.maxFiles, DEFAULT_MAX_FILES);
  const broadAreaCount = integerOrDefault(options.broadAreaCount, DEFAULT_BROAD_AREA_COUNT);
  const files = changes
    .map(change => summarizeFile(change))
    .sort((a, b) => a.path.localeCompare(b.path));
  const changedAreas = [...new Set(files.flatMap(file => file.areas))].sort();
  const changedLines = files.reduce((sum, file) => sum + file.addedLines + file.deletedLines, 0);
  const dangerousFileChanges = files
    .filter(file => file.dangerousReasons.length > 0)
    .map(file => ({ path: file.path, reasons: file.dangerousReasons }));

  const summary: DiffSummary = {
    changedFileCount: files.length,
    addedLines: files.reduce((sum, file) => sum + file.addedLines, 0),
    deletedLines: files.reduce((sum, file) => sum + file.deletedLines, 0),
    changedLines,
    changedSourceFiles: countFilesInArea(files, "source"),
    changedTestFiles: countFilesInArea(files, "tests"),
    changedDocsFiles: countFilesInArea(files, "docs"),
    changedMemoryFiles: countFilesInArea(files, "memory"),
    changedGeneratedMemoryFiles: countFilesInArea(files, "generated-memory"),
    changedAutomationFiles: countFilesInArea(files, "automation"),
    changedPackageFiles: countFilesInArea(files, "package"),
    changedCiFiles: countFilesInArea(files, "ci"),
    changedAppFiles: countFilesInArea(files, "app"),
    changedAreas,
    dangerousFileChanges,
    overreach: [],
    thresholds: {
      maxDiffLines,
      maxFiles,
      broadAreaCount
    },
    files
  };

  summary.overreach = detectOverreach(summary);
  return summary;
}

export function buildDiffChangesFromGitOutput(outputs: GitDiffOutputs): DiffFileChange[] {
  const byPath = new Map<string, DiffFileChange>();

  for (const entry of parseGitNumstat(outputs.numstat)) {
    byPath.set(entry.path, entry);
  }

  for (const entry of parseGitNameStatus(outputs.nameStatus ?? "")) {
    const existing = byPath.get(entry.path);
    byPath.set(entry.path, {
      ...existing,
      path: entry.path,
      status: entry.status
    });
  }

  for (const filePath of parsePathLines(outputs.untrackedFiles ?? "")) {
    const normalizedPath = normalizePath(filePath);
    byPath.set(normalizedPath, {
      path: normalizedPath,
      status: "A",
      addedLines: outputs.untrackedLineCounts?.[normalizedPath] ?? 0,
      deletedLines: 0,
      untracked: true
    });
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function formatDiffSummary(summary: DiffSummary, options: { base?: string; includeFiles?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push("# Diff Summary Since Last Commit");
  lines.push("");
  lines.push(`Base: ${options.base ?? "unknown"}`);
  lines.push("");
  lines.push("## Totals");
  lines.push(`Changed files: ${summary.changedFileCount}`);
  lines.push(`Lines: +${summary.addedLines} / -${summary.deletedLines} / ${summary.changedLines} total`);
  lines.push(`Source files: ${summary.changedSourceFiles}`);
  lines.push(`Test files: ${summary.changedTestFiles}`);
  lines.push(`Docs files: ${summary.changedDocsFiles}`);
  lines.push(`Memory files: ${summary.changedMemoryFiles}`);
  lines.push(`Generated memory files: ${summary.changedGeneratedMemoryFiles}`);
  lines.push(`Automation files: ${summary.changedAutomationFiles}`);
  lines.push(`Package files: ${summary.changedPackageFiles}`);
  lines.push(`CI files: ${summary.changedCiFiles}`);
  lines.push(`App files: ${summary.changedAppFiles}`);
  lines.push(`Areas: ${summary.changedAreas.length ? summary.changedAreas.join(", ") : "none"}`);
  lines.push("");
  lines.push("## Dangerous Changes");
  if (summary.dangerousFileChanges.length) {
    for (const change of summary.dangerousFileChanges) {
      lines.push(`- ${change.path} (${change.reasons.join(", ")})`);
    }
  } else {
    lines.push("None detected.");
  }
  lines.push("");
  lines.push("## Possible Overreach");
  if (summary.overreach.length) {
    for (const signal of summary.overreach) {
      lines.push(`- [${signal.kind}] ${signal.message}`);
    }
  } else {
    lines.push("None detected.");
  }

  if (options.includeFiles !== false) {
    lines.push("");
    lines.push("## Files");
    if (summary.files.length) {
      for (const file of summary.files) {
        const areas = file.areas.length ? ` [${file.areas.join(", ")}]` : "";
        lines.push(`- ${file.status} ${file.path} (+${file.addedLines}/-${file.deletedLines})${areas}`);
      }
    } else {
      lines.push("No changed files.");
    }
  }

  return `${lines.join("\n")}\n`;
}

function summarizeFile(change: DiffFileChange): DiffSummaryFile {
  const normalizedPath = normalizePath(change.path);
  const areas = classifyPath(normalizedPath);
  const dangerousReasons = dangerousReasonsForPath(normalizedPath);
  return {
    path: normalizedPath,
    status: change.status ?? (change.untracked ? "A" : "M"),
    addedLines: nonNegativeNumber(change.addedLines),
    deletedLines: nonNegativeNumber(change.deletedLines),
    areas,
    dangerousReasons,
    untracked: change.untracked === true
  };
}

function parseGitNumstat(output: string): DiffFileChange[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const [addedRaw, deletedRaw, ...pathParts] = line.split("\t");
      const filePath = normalizePath(pathParts.join("\t"));
      return {
        path: filePath,
        addedLines: numericGitStat(addedRaw),
        deletedLines: numericGitStat(deletedRaw)
      };
    })
    .filter(change => change.path.length > 0);
}

function parseGitNameStatus(output: string): DiffFileChange[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const [statusRaw, ...pathParts] = line.split("\t");
      const normalizedStatus = normalizeStatus(statusRaw);
      const filePath = normalizePath(pathParts[pathParts.length - 1] ?? "");
      return { path: filePath, status: normalizedStatus };
    })
    .filter(change => change.path.length > 0);
}

function parsePathLines(output: string): string[] {
  return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function classifyPath(filePath: string): string[] {
  const lowerPath = filePath.toLowerCase();
  const areas = new Set<string>();
  const basename = pathBasename(lowerPath);
  const extension = pathExtension(basename);

  if (isTestPath(lowerPath)) areas.add("tests");
  if (isSourcePath(lowerPath, extension)) areas.add("source");
  if (isDocsPath(lowerPath, basename, extension)) areas.add("docs");
  if (lowerPath.startsWith(".abstraction-tree/")) areas.add("memory");
  if (isGeneratedMemoryPath(lowerPath)) areas.add("generated-memory");
  if (isAutomationPath(lowerPath)) areas.add("automation");
  if (isPackagePath(lowerPath, basename)) areas.add("package");
  if (isCiPath(lowerPath, basename)) areas.add("ci");
  if (lowerPath.startsWith("packages/app/")) areas.add("app");

  return [...areas].sort();
}

function dangerousReasonsForPath(filePath: string): string[] {
  const lowerPath = filePath.toLowerCase();
  const basename = pathBasename(lowerPath);
  const reasons: string[] = [];

  if (basename === ".env" || basename.startsWith(".env.")) reasons.push("environment file");
  if (looksLikeSecretPath(lowerPath, basename)) reasons.push("secret-like path");
  if (lockfileNames.has(basename)) reasons.push("lockfile");
  if (lowerPath.startsWith(".github/workflows/")) reasons.push("github workflow");
  if (packageManagerConfigNames.has(basename) || lowerPath.startsWith(".yarn/")) reasons.push("package manager config");

  return reasons;
}

function detectOverreach(summary: DiffSummary): OverreachSignal[] {
  const signals: OverreachSignal[] = [];
  if (summary.changedFileCount > summary.thresholds.maxFiles) {
    signals.push({
      kind: "file-count",
      message: `Too many files changed: ${summary.changedFileCount} exceeds ${summary.thresholds.maxFiles}.`
    });
  }
  if (summary.changedLines > summary.thresholds.maxDiffLines) {
    signals.push({
      kind: "line-count",
      message: `Too many changed lines: ${summary.changedLines} exceeds ${summary.thresholds.maxDiffLines}.`
    });
  }
  if (summary.changedAreas.length >= summary.thresholds.broadAreaCount) {
    signals.push({
      kind: "broad-areas",
      message: `Unrelated areas may be mixed: ${summary.changedAreas.join(", ")}.`
    });
  }
  if (summary.changedFileCount > 0 && summary.changedGeneratedMemoryFiles === summary.changedFileCount) {
    signals.push({
      kind: "generated-only-change",
      message: "Only generated abstraction memory changed; verify this was an intentional refresh."
    });
  }
  if (summary.changedFileCount > 0 && summary.changedDocsFiles === summary.changedFileCount) {
    signals.push({
      kind: "docs-only-change",
      message: "Only documentation changed; verify no implementation or test update was expected."
    });
  }
  if (summary.changedPackageFiles > 0) {
    signals.push({
      kind: "package-metadata-change",
      message: "Package metadata or lockfiles changed; review dependency, script, and install impact."
    });
  }
  const implementationChangedWithoutReviewCompanion = summary.changedSourceFiles > 0 && summary.changedTestFiles === 0 && summary.changedDocsFiles === 0;
  if (implementationChangedWithoutReviewCompanion) {
    signals.push({
      kind: "implementation-without-test",
      message: "Implementation files changed without test files in the same diff."
    });
  }
  if (implementationChangedWithoutReviewCompanion && summary.changedGeneratedMemoryFiles === 0) {
    signals.push({
      kind: "source-changed-memory-not-refreshed",
      message: "Source files changed without tests or generated abstraction memory refresh evidence."
    });
  }
  const subsystems = changedImplementationSubsystems(summary.files);
  if (subsystems.length > 1) {
    signals.push({
      kind: "cross-subsystem-change",
      message: `Implementation changes span multiple subsystems: ${subsystems.join(", ")}.`
    });
  }
  if (hasAllAreas(summary, ["source", "app", "docs", "automation"])) {
    signals.push({
      kind: "source-app-docs-automation",
      message: "Source, app, docs, and automation files all changed together."
    });
  }
  return signals;
}

function changedImplementationSubsystems(files: DiffSummaryFile[]): string[] {
  const subsystems = new Set<string>();
  for (const file of files) {
    if (!file.areas.includes("source")) continue;
    if (file.areas.includes("tests") || file.areas.includes("memory") || file.areas.includes("docs")) continue;
    const subsystem = implementationSubsystemForPath(file.path);
    if (subsystem) subsystems.add(subsystem);
  }
  return [...subsystems].sort();
}

function implementationSubsystemForPath(filePath: string): string | undefined {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.startsWith("packages/core/")) return "core";
  if (lowerPath.startsWith("packages/cli/")) return "cli";
  if (lowerPath.startsWith("packages/app/")) return "app";
  if (lowerPath.startsWith("packages/full/")) return "full-package";
  if (lowerPath.startsWith("scripts/")) return "scripts";
  if (lowerPath.startsWith("examples/")) return "examples";
  if (lowerPath.startsWith("adapters/")) return "adapters";
  if (lowerPath.startsWith("backend/") || lowerPath.startsWith("server/") || lowerPath.startsWith("api/")) return "backend";
  if (lowerPath.startsWith("frontend/") || lowerPath.startsWith("client/") || lowerPath.startsWith("web/")) return "frontend";
  return "root";
}

function hasAllAreas(summary: DiffSummary, areas: string[]): boolean {
  return areas.every(area => summary.changedAreas.includes(area));
}

function countFilesInArea(files: DiffSummaryFile[], area: string): number {
  return files.filter(file => file.areas.includes(area)).length;
}

function isSourcePath(lowerPath: string, extension: string): boolean {
  if (!sourceExtensions.has(extension)) return false;
  if (isTestPath(lowerPath)) return false;
  return !lowerPath.startsWith(".abstraction-tree/");
}

function isTestPath(lowerPath: string): boolean {
  const basename = pathBasename(lowerPath);
  return (
    basename.includes(".test.") ||
    basename.includes(".spec.") ||
    lowerPath.includes("/__tests__/") ||
    lowerPath.includes("/test/") ||
    lowerPath.includes("/tests/")
  );
}

function isDocsPath(lowerPath: string, basename: string, extension: string): boolean {
  if (lowerPath.startsWith(".abstraction-tree/")) return false;
  return lowerPath.startsWith("docs/") || docExtensions.has(extension) || basename === "readme" || basename.startsWith("readme.");
}

function isGeneratedMemoryPath(lowerPath: string): boolean {
  if (!lowerPath.startsWith(".abstraction-tree/")) return false;
  return (
    lowerPath.startsWith(".abstraction-tree/changes/") ||
    lowerPath.startsWith(".abstraction-tree/context-packs/") ||
    lowerPath.startsWith(".abstraction-tree/evaluations/") ||
    lowerPath.startsWith(".abstraction-tree/lessons/") ||
    lowerPath.startsWith(".abstraction-tree/runs/") ||
    [
      ".abstraction-tree/concepts.json",
      ".abstraction-tree/files.json",
      ".abstraction-tree/invariants.json",
      ".abstraction-tree/ontology.json",
      ".abstraction-tree/tree.json"
    ].includes(lowerPath)
  );
}

function isAutomationPath(lowerPath: string): boolean {
  return lowerPath.startsWith("scripts/") || lowerPath.startsWith(".abstraction-tree/automation/");
}

function isPackagePath(lowerPath: string, basename: string): boolean {
  return packageFileNames.has(basename) || lowerPath.startsWith("packages/") && basename === "package.json";
}

function isCiPath(lowerPath: string, basename: string): boolean {
  return (
    lowerPath.startsWith(".github/workflows/") ||
    lowerPath.startsWith(".github/actions/") ||
    basename === ".gitlab-ci.yml" ||
    basename === "azure-pipelines.yml" ||
    basename === "circle.yml"
  );
}

function looksLikeSecretPath(lowerPath: string, basename: string): boolean {
  return (
    lowerPath.includes("secret") ||
    lowerPath.includes("credential") ||
    lowerPath.includes("token") ||
    basename.endsWith(".key") ||
    basename.endsWith(".pem") ||
    basename.endsWith(".p12") ||
    basename.endsWith(".pfx")
  );
}

function numericGitStat(value: string | undefined): number {
  if (!value || value === "-") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeStatus(status: string | undefined): string {
  if (!status) return "M";
  if (status.startsWith("R")) return "R";
  if (status.startsWith("C")) return "C";
  return status.slice(0, 1) || "M";
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").trim();
}

function pathBasename(filePath: string): string {
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

function pathExtension(basename: string): string {
  const index = basename.lastIndexOf(".");
  return index > 0 ? basename.slice(index) : "";
}

function nonNegativeNumber(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined && value > 0 ? value : 0;
}

function integerOrDefault(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value >= 0 ? value : fallback;
}
