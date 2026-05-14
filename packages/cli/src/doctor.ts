import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  atreePath,
  detectFileDrift,
  formatRuntimeValidationIssue,
  loadAtreeMemory,
  scanProject,
  validateAutomation,
  validateChanges,
  validateConcepts,
  validateInvariants,
  validateTree,
  type AtreeMemory,
  type AutomationValidationOptions,
  type ValidationIssue
} from "@abstraction-tree/core";

export type DoctorStatus = "ok" | "warning" | "error";

export interface DoctorIssueSummary {
  issueCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  summary: string;
  issues?: ValidationIssue[];
  details?: Record<string, unknown>;
}

export interface DoctorCounts {
  files: number;
  nodes: number;
  concepts: number;
  invariants: number;
  changes: number;
}

export interface DoctorReport {
  status: DoctorStatus;
  projectRoot: string;
  projectName: string;
  counts: DoctorCounts;
  checks: DoctorCheck[];
  nextSteps: string[];
}

export interface DoctorOptions extends AutomationValidationOptions {
  nodeVersion?: string;
  findVisualAppDist?: (projectRoot: string) => string | undefined;
}

const REQUIRED_MEMORY_FILES = [
  "files.json",
  "tree.json",
  "ontology.json",
  "concepts.json",
  "invariants.json"
] as const;

const MINIMUM_NODE_VERSION = "20.19.0";

export async function runDoctor(projectRoot: string, options: DoctorOptions = {}): Promise<DoctorReport> {
  const root = path.resolve(projectRoot);
  const configPath = atreePath(root, "config.json");
  const configExists = existsSync(configPath);
  const memory = await loadAtreeMemory(root);
  const counts = memoryCounts(memory);
  const missingRequiredMemory = REQUIRED_MEMORY_FILES.filter(fileName => !existsSync(atreePath(root, fileName)));
  const importGraphExists = existsSync(atreePath(root, "import-graph.json"));
  const scanHasRun = REQUIRED_MEMORY_FILES.some(fileName => existsSync(atreePath(root, fileName)));
  const runtimeIssues = memory.issues;
  const runtimeSummary = summarizeIssues(runtimeIssues);
  const configIssues = runtimeIssues.filter(issue => issue.filePath === ".abstraction-tree/config.json");
  const validationReady = configExists && !runtimeSummary.errorCount && missingRequiredMemory.length === 0;

  const nodeCheck = buildNodeVersionCheck(options.nodeVersion ?? process.versions.node);
  const configCheck = buildConfigCheck(configExists, configIssues);
  const memoryCheck = buildMemoryCheck(configExists, missingRequiredMemory, counts);
  const importGraphCheck = buildImportGraphCheck(scanHasRun, importGraphExists);
  const runtimeCheck = buildRuntimeSchemaCheck(runtimeIssues);
  const validationCheck = validationReady
    ? buildValidationCheck(await collectMemoryValidationIssues(root, memory))
    : buildValidationSkippedCheck(configExists, runtimeSummary, missingRequiredMemory);
  const contaminationCheck = configExists && !configIssues.some(issue => issue.severity === "error")
    ? await buildSelfDogfoodingMemoryCheck(root, memory)
    : skippedCheck("self-memory-contamination", "Self dogfooding memory", "not checked until config is valid");
  const automationCheck = configExists && !configIssues.some(issue => issue.severity === "error")
    ? buildAutomationCheck(await validateAutomation(root, { runGit: options.runGit }))
    : skippedCheck("automation", "Automation runtime boundary", "not checked until config is valid");
  const visualCheck = buildVisualAppCheck(root, configExists, memory, options.findVisualAppDist ?? findVisualAppDist);

  const checks = [
    nodeCheck,
    configCheck,
    memoryCheck,
    importGraphCheck,
    runtimeCheck,
    validationCheck,
    contaminationCheck,
    automationCheck,
    visualCheck
  ];
  const status = checks.reduce<DoctorStatus>((current, check) => maxStatus(current, check.status), "ok");
  const projectName = configExists && !configIssues.some(issue => issue.severity === "error")
    ? memory.config.projectName
    : path.basename(root);

  return {
    status,
    projectRoot: root,
    projectName,
    counts,
    checks,
    nextSteps: await suggestNextSteps(root, {
      configExists,
      configHasErrors: configCheck.status === "error",
      runtimeHasErrors: runtimeCheck.status === "error",
      missingRequiredMemory,
      importGraphMissingAfterScan: scanHasRun && !importGraphExists,
      validationHasIssues: validationCheck.status !== "ok" || contaminationCheck.status !== "ok",
      visualAppMissing: Boolean(visualCheck.details?.required) && !visualCheck.details?.available
    })
  };
}

export async function collectValidationIssues(root: string): Promise<ValidationIssue[]> {
  const memory = await loadAtreeMemory(root);
  if (memory.issues.some(issue => issue.severity === "error")) return memory.issues;

  return [
    ...memory.issues,
    ...(await validateAutomation(root)),
    ...(await collectMemoryValidationIssues(root, memory))
  ];
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    "Abstraction Tree doctor",
    "",
    `Project: ${report.projectName}`,
    ...report.checks.map(check => `${check.label}: ${check.summary}`),
    `Next step: ${report.nextSteps.join(", ")}`
  ];

  const issuePreview = report.checks
    .flatMap(check => check.issues ?? [])
    .filter(issue => issue.severity === "error" || issue.severity === "warning")
    .slice(0, 5);
  if (issuePreview.length) {
    lines.push("", "Issue preview:", ...issuePreview.map(issue => `- ${formatRuntimeValidationIssue(issue)}`));
  }

  return `${lines.join("\n")}\n`;
}

export function doctorExitCode(report: DoctorReport, strict: boolean): number {
  if (report.status === "error") return 1;
  if (strict && report.status === "warning") return 1;
  return 0;
}

export function findVisualAppDist(projectRoot = process.cwd()): string | undefined {
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(projectRoot, "packages/app/dist"),
    path.resolve(projectRoot, "node_modules/@abstraction-tree/app/dist"),
    path.resolve(cliDir, "../../app/dist"),
    path.resolve(cliDir, "../../../app/dist"),
    path.resolve(cliDir, "../../@abstraction-tree/app/dist")
  ];
  return candidates.find(existsSync);
}

async function collectMemoryValidationIssues(root: string, memory: AtreeMemory): Promise<ValidationIssue[]> {
  const { ontology, nodes, files, concepts, invariants, changes } = memory;
  const existingConceptFilePaths = concepts
    .flatMap(concept => concept.relatedFiles ?? [])
    .filter(filePath => existsSync(path.resolve(root, filePath)));
  const existingInvariantFilePaths = invariants
    .flatMap(invariant => invariant.filePaths ?? [])
    .filter(filePath => existsSync(path.resolve(root, filePath)));
  const existingChangeFilePaths = changes
    .flatMap(change => change.filesChanged)
    .filter(filePath => existsSync(path.resolve(root, filePath)));
  const currentScan = await scanProject(root);

  return [
    ...validateTree(nodes, files, ontology),
    ...validateConcepts(concepts, nodes, files, existingConceptFilePaths),
    ...validateInvariants(invariants, nodes, files, existingInvariantFilePaths),
    ...validateChanges(changes, nodes, files, invariants, existingChangeFilePaths),
    ...detectFileDrift(files, currentScan.files, nodes)
  ];
}

function buildNodeVersionCheck(nodeVersion: string): DoctorCheck {
  const satisfies = compareVersions(nodeVersion, MINIMUM_NODE_VERSION) >= 0;
  return {
    id: "node-version",
    label: "Node",
    status: satisfies ? "ok" : "error",
    summary: satisfies
      ? `ok (${nodeVersion} satisfies >=${MINIMUM_NODE_VERSION})`
      : `unsupported (${nodeVersion}; requires >=${MINIMUM_NODE_VERSION})`,
    details: {
      version: nodeVersion,
      required: `>=${MINIMUM_NODE_VERSION}`,
      satisfies
    }
  };
}

function buildConfigCheck(configExists: boolean, issues: ValidationIssue[]): DoctorCheck {
  if (!configExists) {
    return {
      id: "config",
      label: "Config",
      status: "error",
      summary: "missing .abstraction-tree/config.json"
    };
  }

  const summary = summarizeIssues(issues);
  return {
    id: "config",
    label: "Config",
    status: statusFromSummary(summary),
    summary: summary.issueCount ? issueSummaryText(summary) : "ok",
    issues,
    details: { ...summary }
  };
}

function buildMemoryCheck(configExists: boolean, missingRequiredMemory: string[], counts: DoctorCounts): DoctorCheck {
  if (!configExists) {
    return {
      id: "memory-files",
      label: "Memory",
      status: "warning",
      summary: "not initialized"
    };
  }

  return {
    id: "memory-files",
    label: "Memory",
    status: missingRequiredMemory.length ? "warning" : "ok",
    summary: missingRequiredMemory.length
      ? `missing ${missingRequiredMemory.join(", ")}`
      : `ok (${counts.files} files, ${counts.nodes} nodes, ${counts.concepts} concepts, ${counts.invariants} invariants, ${counts.changes} changes)`,
    details: {
      required: [...REQUIRED_MEMORY_FILES],
      missing: missingRequiredMemory,
      counts
    }
  };
}

function buildImportGraphCheck(scanHasRun: boolean, importGraphExists: boolean): DoctorCheck {
  if (!scanHasRun) {
    return {
      id: "import-graph",
      label: "Import graph",
      status: "ok",
      summary: "not required until scan runs"
    };
  }

  return {
    id: "import-graph",
    label: "Import graph",
    status: importGraphExists ? "ok" : "warning",
    summary: importGraphExists ? "ok" : "missing .abstraction-tree/import-graph.json"
  };
}

function buildRuntimeSchemaCheck(issues: ValidationIssue[]): DoctorCheck {
  const summary = summarizeIssues(issues);
  return {
    id: "runtime-schema",
    label: "Runtime schema",
    status: statusFromSummary(summary),
    summary: summary.issueCount ? issueSummaryText(summary) : "ok",
    issues,
    details: { ...summary }
  };
}

function buildValidationCheck(issues: ValidationIssue[]): DoctorCheck {
  const summary = summarizeIssues(issues);
  return {
    id: "validation",
    label: "Validation",
    status: statusFromSummary(summary),
    summary: summary.issueCount ? issueSummaryText(summary) : "ok",
    issues,
    details: { ...summary }
  };
}

function buildValidationSkippedCheck(
  configExists: boolean,
  runtimeSummary: DoctorIssueSummary,
  missingRequiredMemory: string[]
): DoctorCheck {
  const summary = !configExists
    ? "not checked until atree init runs"
    : runtimeSummary.errorCount
      ? "not checked until runtime schema errors are fixed"
      : `not checked until memory is complete (${missingRequiredMemory.join(", ")})`;
  return {
    id: "validation",
    label: "Validation",
    status: "warning",
    summary
  };
}

async function buildSelfDogfoodingMemoryCheck(root: string, memory: AtreeMemory): Promise<DoctorCheck> {
  const packageName = await readPackageName(root);
  const isThisRepositoryPackage = new Set([
    "abstraction-tree-monorepo",
    "abstraction-tree",
    "@abstraction-tree/core",
    "@abstraction-tree/cli",
    "@abstraction-tree/app"
  ]).has(packageName);
  if (isThisRepositoryPackage) {
    return {
      id: "self-memory-contamination",
      label: "Self dogfooding memory",
      status: "ok",
      summary: "ok for Abstraction Tree package"
    };
  }

  const markerFiles = new Set(memory.files.map(file => file.path));
  const markerNodeIds = new Set(memory.nodes.map(node => node.id));
  const hardMarkers = [
    memory.config.projectName === "abstraction-tree" ? "config projectName is abstraction-tree" : "",
    markerFiles.has("packages/core/src/treeBuilder.ts") ? "contains Abstraction Tree core source file ownership" : "",
    existsSync(atreePath(root, "automation", "codex-loop-prompt.md")) ? "contains Abstraction Tree automation prompt" : ""
  ].filter(Boolean);
  const weakMarkers = [
    markerNodeIds.has("subsystem.goal.mission.automation") ? "contains Abstraction Tree goal/mission subsystem node" : "",
    markerNodeIds.has("subsystem.cli.local.api") ? "contains Abstraction Tree CLI/local API subsystem node" : "",
    existsSync(atreePath(root, "runs")) ? "contains committed run reports" : "",
    existsSync(atreePath(root, "lessons")) ? "contains committed lessons" : "",
    existsSync(atreePath(root, "evaluations")) ? "contains committed evaluations" : ""
  ].filter(Boolean);

  if (!hardMarkers.length && weakMarkers.length < 2) {
    return {
      id: "self-memory-contamination",
      label: "Self dogfooding memory",
      status: "ok",
      summary: "not detected"
    };
  }

  return {
    id: "self-memory-contamination",
    label: "Self dogfooding memory",
    status: "warning",
    summary: "possible Abstraction Tree dogfooding memory detected",
    issues: [{
      severity: "warning",
      filePath: ".abstraction-tree",
      fieldPath: "$",
      message: "This workspace appears to contain Abstraction Tree's own dogfooding memory instead of project-local memory.",
      recoveryHint: "Remove stale generated memory from .abstraction-tree, run `atree init`, then run `atree scan` in this project."
    }],
    details: {
      packageName,
      markers: [...hardMarkers, ...weakMarkers]
    }
  };
}

function buildAutomationCheck(issues: ValidationIssue[]): DoctorCheck {
  const summary = summarizeIssues(issues);
  return {
    id: "automation",
    label: "Automation runtime boundary",
    status: statusFromSummary(summary),
    summary: summary.issueCount ? issueSummaryText(summary) : "ok",
    issues,
    details: { ...summary }
  };
}

function buildVisualAppCheck(
  root: string,
  configExists: boolean,
  memory: AtreeMemory,
  resolveVisualAppDist: (projectRoot: string) => string | undefined
): DoctorCheck {
  if (!configExists) {
    return skippedCheck("visual-app", "Visual app", "not checked until atree init runs");
  }

  const requiresVisualApp = memory.config.installMode === "full" || Boolean(memory.config.visualApp?.enabled);
  const dist = resolveVisualAppDist(root);
  if (requiresVisualApp) {
    return {
      id: "visual-app",
      label: "Visual app",
      status: dist ? "ok" : "warning",
      summary: dist ? `available (${dist})` : "unavailable, but installMode is full",
      details: {
        required: true,
        available: Boolean(dist),
        dist
      }
    };
  }

  return {
    id: "visual-app",
    label: "Visual app",
    status: "ok",
    summary: dist ? "available, but installMode is core" : "unavailable, but installMode is core",
    details: {
      required: false,
      available: Boolean(dist),
      dist
    }
  };
}

function skippedCheck(id: string, label: string, summary: string): DoctorCheck {
  return { id, label, status: "ok", summary };
}

function memoryCounts(memory: AtreeMemory): DoctorCounts {
  return {
    files: memory.files.length,
    nodes: memory.nodes.length,
    concepts: memory.concepts.length,
    invariants: memory.invariants.length,
    changes: memory.changes.length
  };
}

function summarizeIssues(issues: ValidationIssue[]): DoctorIssueSummary {
  return {
    issueCount: issues.length,
    errorCount: issues.filter(issue => issue.severity === "error").length,
    warningCount: issues.filter(issue => issue.severity === "warning").length,
    infoCount: issues.filter(issue => issue.severity === "info").length
  };
}

function statusFromSummary(summary: DoctorIssueSummary): DoctorStatus {
  if (summary.errorCount) return "error";
  if (summary.warningCount) return "warning";
  return "ok";
}

function issueSummaryText(summary: DoctorIssueSummary): string {
  return `${summary.issueCount} issue${summary.issueCount === 1 ? "" : "s"} (${summary.errorCount} errors, ${summary.warningCount} warnings)`;
}

function maxStatus(left: DoctorStatus, right: DoctorStatus): DoctorStatus {
  return statusRank(right) > statusRank(left) ? right : left;
}

function statusRank(status: DoctorStatus): number {
  if (status === "error") return 2;
  if (status === "warning") return 1;
  return 0;
}

async function suggestNextSteps(
  root: string,
  state: {
    configExists: boolean;
    configHasErrors: boolean;
    runtimeHasErrors: boolean;
    missingRequiredMemory: string[];
    importGraphMissingAfterScan: boolean;
    validationHasIssues: boolean;
    visualAppMissing: boolean;
  }
): Promise<string[]> {
  if (!state.configExists || state.configHasErrors) return ["atree init"];
  if (state.missingRequiredMemory.length || state.importGraphMissingAfterScan || state.runtimeHasErrors) return ["atree scan"];
  if (state.visualAppMissing) return ["npm run build"];
  if (state.validationHasIssues) return ["atree validate"];
  return [await hasPackageScript(root, "assessment:pack") ? "npm run assessment:pack" : "atree validate"];
}

async function hasPackageScript(root: string, scriptName: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(root, "package.json"), "utf8");
    const manifest = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    return typeof manifest.scripts?.[scriptName] === "string";
  } catch {
    return false;
  }
}

async function readPackageName(root: string): Promise<string> {
  try {
    const raw = await readFile(path.join(root, "package.json"), "utf8");
    const manifest = JSON.parse(raw) as { name?: unknown };
    return typeof manifest.name === "string" ? manifest.name : "";
  } catch {
    return "";
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function versionParts(value: string): number[] {
  return value.split(".").map(part => Number.parseInt(part, 10)).filter(Number.isFinite);
}
