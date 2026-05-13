import type { Concept, FileSummary, TreeNode } from "./schema.js";
import { buildDiffSummary, type DiffFileChange, type DiffSummary } from "./diffSummary.js";

export type ScopeContractStatus = "draft" | "needs-clarification" | "ready";
export type ScopeCheckStatus = "clean" | "warning" | "blocked";
export type ScopeViolationSeverity = "warning" | "error";

export interface ScopeContract {
  id: string;
  createdAt: string;
  prompt: string;
  intent: string;
  status: ScopeContractStatus;
  affectedNodeIds: string[];
  allowedFiles: string[];
  allowedAreas: string[];
  forbiddenAreas: string[];
  ambiguities: string[];
  requiresClarification: boolean;
  maxFilesChanged: number;
  maxDiffLines: number;
  allowGeneratedMemory: boolean;
  requiredChecks: string[];
  rationale: string[];
}

export interface ScopeBuildInput {
  prompt: string;
  nodes: TreeNode[];
  files: FileSummary[];
  concepts?: Concept[];
  createdAt?: Date;
}

export interface ScopeViolation {
  severity: ScopeViolationSeverity;
  kind:
    | "clarification-required"
    | "file-out-of-scope"
    | "dangerous-file"
    | "file-count"
    | "line-count"
    | "memory-without-source";
  message: string;
  filePath?: string;
}

export interface ScopeCheckInput {
  contract: ScopeContract;
  changes: DiffFileChange[];
}

export interface ScopeCheckReport {
  id: string;
  checkedAt: string;
  contractId: string;
  status: ScopeCheckStatus;
  prompt: string;
  changedFiles: string[];
  affectedNodeIds: string[];
  allowedFiles: string[];
  violations: ScopeViolation[];
  diffSummary: DiffSummary;
}

const allAreas = ["app", "automation", "ci", "core", "docs", "memory", "package", "scripts", "source", "tests"] as const;
const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "for",
  "from",
  "have",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with"
]);

export function buildScopeContract(input: ScopeBuildInput): ScopeContract {
  const createdAt = input.createdAt ?? new Date();
  const promptTokens = tokenize(input.prompt);
  const fileScores = scoreFiles(input.files, promptTokens);
  const nodeScores = scoreNodes(input.nodes, fileScores, promptTokens);
  const selectedNodes = topScored(nodeScores, 6);
  const affectedNodeIds = selectedNodes.length
    ? selectedNodes.map(score => score.id)
    : fallbackNodeIds(input.nodes);
  const allowedFiles = inferAllowedFiles(affectedNodeIds, input.nodes, input.files, fileScores, promptTokens);
  const allowedAreas = [...new Set(allowedFiles.flatMap(classifyScopeArea))].sort();
  const ambiguities = detectPromptAmbiguities(input.prompt, promptTokens);
  const requiresClarification = ambiguities.length > 0;

  return {
    id: scopeId(createdAt),
    createdAt: createdAt.toISOString(),
    prompt: input.prompt,
    intent: inferIntent(input.prompt),
    status: requiresClarification ? "needs-clarification" : "ready",
    affectedNodeIds,
    allowedFiles,
    allowedAreas,
    forbiddenAreas: allAreas.filter(area => !allowedAreas.includes(area) && area !== "memory"),
    ambiguities,
    requiresClarification,
    maxFilesChanged: Math.max(3, Math.min(12, allowedFiles.length + 2)),
    maxDiffLines: 600,
    allowGeneratedMemory: true,
    requiredChecks: inferRequiredChecks(allowedFiles),
    rationale: buildRationale(affectedNodeIds, allowedFiles, selectedNodes, fileScores)
  };
}

export function checkScope(input: ScopeCheckInput): ScopeCheckReport {
  const contract = normalizeContract(input.contract);
  const diffSummary = buildDiffSummary(input.changes, {
    maxDiffLines: contract.maxDiffLines,
    maxFiles: contract.maxFilesChanged
  });
  const allowedFiles = new Set(contract.allowedFiles.map(normalizeScopePath));
  const violations: ScopeViolation[] = [];
  const changedFiles = diffSummary.files.map(file => file.path);
  const nonMemoryFiles = diffSummary.files.filter(file => !isMemoryPath(file.path));

  if (contract.requiresClarification) {
    violations.push({
      severity: "warning",
      kind: "clarification-required",
      message: "Scope contract requested clarification before implementation."
    });
  }

  for (const file of diffSummary.files) {
    if (isGeneratedMemoryPath(file.path) && contract.allowGeneratedMemory) continue;
    if (!allowedFiles.has(file.path)) {
      violations.push({
        severity: "error",
        kind: "file-out-of-scope",
        filePath: file.path,
        message: `${file.path} changed outside the scope contract.`
      });
    }
  }

  if (diffSummary.changedMemoryFiles > 0 && nonMemoryFiles.length === 0) {
    violations.push({
      severity: "warning",
      kind: "memory-without-source",
      message: "Only abstraction memory changed; verify this was an intentional memory refresh."
    });
  }

  for (const dangerous of diffSummary.dangerousFileChanges) {
    violations.push({
      severity: "error",
      kind: "dangerous-file",
      filePath: dangerous.path,
      message: `${dangerous.path} changed a dangerous or sensitive file category: ${dangerous.reasons.join(", ")}.`
    });
  }

  if (diffSummary.changedFileCount > contract.maxFilesChanged) {
    violations.push({
      severity: "warning",
      kind: "file-count",
      message: `${diffSummary.changedFileCount} files changed; scope contract expected at most ${contract.maxFilesChanged}.`
    });
  }

  if (diffSummary.changedLines > contract.maxDiffLines) {
    violations.push({
      severity: "warning",
      kind: "line-count",
      message: `${diffSummary.changedLines} lines changed; scope contract expected at most ${contract.maxDiffLines}.`
    });
  }

  return {
    id: `${contract.id}-check`,
    checkedAt: new Date().toISOString(),
    contractId: contract.id,
    status: scopeStatus(violations),
    prompt: contract.prompt,
    changedFiles,
    affectedNodeIds: contract.affectedNodeIds,
    allowedFiles: contract.allowedFiles,
    violations,
    diffSummary
  };
}

export function formatScopeContractMarkdown(contract: ScopeContract): string {
  const lines: string[] = [];
  lines.push("# Scope Contract");
  lines.push("");
  lines.push(`ID: ${contract.id}`);
  lines.push(`Status: ${contract.status}`);
  lines.push(`Prompt: ${contract.prompt}`);
  lines.push("");
  lines.push("## Intent");
  lines.push(contract.intent);
  lines.push("");
  lines.push("## Affected Nodes");
  pushList(lines, contract.affectedNodeIds);
  lines.push("");
  lines.push("## Allowed Files");
  pushList(lines, contract.allowedFiles);
  lines.push("");
  lines.push("## Allowed Areas");
  pushList(lines, contract.allowedAreas);
  lines.push("");
  lines.push("## Ambiguities");
  pushList(lines, contract.ambiguities.length ? contract.ambiguities : ["None detected."]);
  lines.push("");
  lines.push("## Limits");
  lines.push(`- Max files changed: ${contract.maxFilesChanged}`);
  lines.push(`- Max diff lines: ${contract.maxDiffLines}`);
  lines.push(`- Generated memory refresh allowed: ${contract.allowGeneratedMemory ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Required Checks");
  pushList(lines, contract.requiredChecks);
  lines.push("");
  lines.push("## Rationale");
  pushList(lines, contract.rationale);
  return `${lines.join("\n")}\n`;
}

export function formatScopeCheckMarkdown(report: ScopeCheckReport): string {
  const lines: string[] = [];
  lines.push("# Scope Check");
  lines.push("");
  lines.push(`Status: ${report.status}`);
  lines.push(`Scope: ${report.contractId}`);
  lines.push(`Prompt: ${report.prompt}`);
  lines.push("");
  lines.push("## Changed Files");
  pushList(lines, report.changedFiles.length ? report.changedFiles : ["No changed files."]);
  lines.push("");
  lines.push("## Violations");
  pushList(lines, report.violations.length ? report.violations.map(violation => `[${violation.severity}] ${violation.message}`) : ["None detected."]);
  lines.push("");
  lines.push("## Totals");
  lines.push(`- Changed files: ${report.diffSummary.changedFileCount}`);
  lines.push(`- Changed lines: ${report.diffSummary.changedLines}`);
  lines.push(`- Areas: ${report.diffSummary.changedAreas.join(", ") || "none"}`);
  return `${lines.join("\n")}\n`;
}

function scoreFiles(files: FileSummary[], promptTokens: string[]): ScoredItem[] {
  return files
    .map(file => {
      const haystack = tokenize([
        file.path,
        file.summary,
        file.language,
        ...file.symbols,
        ...file.exports
      ].join(" "));
      return {
        id: file.path,
        score: scoreTokenOverlap(promptTokens, haystack) + pathSpecificBoost(file.path, promptTokens)
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function scoreNodes(nodes: TreeNode[], fileScores: ScoredItem[], promptTokens: string[]): ScoredItem[] {
  const fileScoreMap = new Map(fileScores.map(score => [score.id, score.score]));
  return nodes
    .map(node => {
      const nodeFiles = [...node.sourceFiles, ...node.ownedFiles];
      const fileScore = nodeFiles
        .map(filePath => fileScoreMap.get(filePath) ?? 0)
        .filter(score => score > 0)
        .sort((left, right) => right - left)
        .slice(0, 4)
        .reduce((sum, score) => sum + score, 0);
      const haystack = tokenize([
        node.id,
        node.name,
        node.title,
        node.level,
        node.summary,
        ...node.responsibilities,
        ...nodeFiles
      ].join(" "));
      const directScore = scoreTokenOverlap(promptTokens, haystack);
      const breadthPenalty = nodeFiles.length > 20 ? Math.min(8, nodeFiles.length / 15) : 0;
      return {
        id: node.id,
        score: directScore + Math.min(fileScore, 8) - breadthPenalty
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function inferAllowedFiles(
  affectedNodeIds: string[],
  nodes: TreeNode[],
  files: FileSummary[],
  fileScores: ScoredItem[],
  promptTokens: string[]
): string[] {
  const byNode = new Map(nodes.map(node => [node.id, node]));
  const existing = new Set(files.map(file => file.path));
  const allowed = new Set<string>();

  for (const nodeId of affectedNodeIds) {
    const node = byNode.get(nodeId);
    const nodeFiles = [...(node?.sourceFiles ?? []), ...(node?.ownedFiles ?? [])];
    const allowedNodeFiles = nodeFiles.length <= 5
      ? nodeFiles
      : nodeFiles.filter(filePath => fileScores.some(score => score.id === filePath));
    for (const filePath of allowedNodeFiles) {
      if (existing.has(filePath)) allowed.add(filePath);
    }
  }

  for (const fileScore of topScored(fileScores, 8)) {
    allowed.add(fileScore.id);
  }

  if ([...allowed].some(filePath => filePath.startsWith("packages/app/"))) {
    addIfExists(allowed, existing, "packages/app/src/app.test.tsx");
    if (promptTokens.some(token => ["collapse", "collapsible", "dropdown", "style", "ui", "visual"].includes(token))) {
      addIfExists(allowed, existing, "packages/app/src/styles.css");
    }
  }

  for (const filePath of [...allowed]) {
    addNearbyTestFile(allowed, existing, filePath);
  }

  return limitAllowedFiles([...allowed], fileScores, 16);
}

function inferIntent(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) return "No prompt supplied.";
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function detectPromptAmbiguities(prompt: string, promptTokens: string[]): string[] {
  const ambiguities: string[] = [];
  const lower = prompt.toLowerCase();
  if (promptTokens.includes("dropdown") && (promptTokens.includes("tree") || promptTokens.includes("node"))) {
    ambiguities.push("`dropdown` could mean a separate select menu or collapsible disclosure inside the existing tree.");
  }
  if (/\b(it|this|that|thing)\b/u.test(lower) && promptTokens.length <= 5) {
    ambiguities.push("Prompt uses a short pronoun reference; the target may depend on recent conversation context.");
  }
  if (promptTokens.some(token => ["better", "improve", "optimize", "streamline"].includes(token)) && promptTokens.length <= 6) {
    ambiguities.push("Broad improvement wording needs a tighter acceptance criterion before implementation.");
  }
  return ambiguities;
}

function inferRequiredChecks(allowedFiles: string[]): string[] {
  const checks = new Set(["npm.cmd run build", "npm.cmd test", "npm.cmd run atree:validate"]);
  if (allowedFiles.some(file => file.startsWith("packages/app/"))) checks.add("npm.cmd run lint");
  if (allowedFiles.some(file => file.startsWith("packages/core/"))) checks.add("node packages/core/dist/*.test.js");
  if (allowedFiles.some(file => file.startsWith("packages/cli/"))) checks.add("node packages/cli/dist/*.test.js");
  return [...checks];
}

function buildRationale(
  affectedNodeIds: string[],
  allowedFiles: string[],
  selectedNodes: ScoredItem[],
  fileScores: ScoredItem[]
): string[] {
  const rationale = [
    `Selected ${affectedNodeIds.length} affected node(s) from prompt/tree term overlap.`,
    `Allowed ${allowedFiles.length} file(s) from affected node ownership, direct file matches, and nearby tests.`
  ];
  if (selectedNodes.length) rationale.push(`Highest node score: ${selectedNodes[0].id} (${selectedNodes[0].score.toFixed(1)}).`);
  if (fileScores.length) rationale.push(`Highest file score: ${fileScores[0].id} (${fileScores[0].score.toFixed(1)}).`);
  return rationale;
}

function limitAllowedFiles(allowedFiles: string[], fileScores: ScoredItem[], limit: number): string[] {
  if (allowedFiles.length <= limit) return sortedUnique(allowedFiles);
  const scoreMap = new Map(fileScores.map(score => [score.id, score.score]));
  return allowedFiles
    .sort((left, right) => (scoreMap.get(right) ?? 0) - (scoreMap.get(left) ?? 0) || left.localeCompare(right))
    .slice(0, limit)
    .sort();
}

function normalizeContract(contract: ScopeContract): ScopeContract {
  return {
    ...contract,
    affectedNodeIds: sortedUnique(contract.affectedNodeIds),
    allowedFiles: sortedUnique(contract.allowedFiles.map(normalizeScopePath)),
    allowedAreas: sortedUnique(contract.allowedAreas),
    forbiddenAreas: sortedUnique(contract.forbiddenAreas),
    ambiguities: sortedUnique(contract.ambiguities),
    requiredChecks: sortedUnique(contract.requiredChecks)
  };
}

function fallbackNodeIds(nodes: TreeNode[]): string[] {
  return [nodes.find(node => node.id === "project.intent")?.id ?? nodes[0]?.id].filter((id): id is string => Boolean(id));
}

function addNearbyTestFile(allowed: Set<string>, existing: Set<string>, filePath: string): void {
  const testPath = filePath.replace(/(\.[cm]?[jt]sx?)$/u, ".test$1");
  addIfExists(allowed, existing, testPath);
}

function addIfExists(allowed: Set<string>, existing: Set<string>, filePath: string): void {
  if (existing.has(filePath)) allowed.add(filePath);
}

function tokenize(text: string): string[] {
  return [...new Set(text
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(token => token.length > 1 && !stopWords.has(token)))];
}

function scoreTokenOverlap(needles: string[], haystack: string[]): number {
  let score = 0;
  const haystackSet = new Set(haystack);
  for (const token of needles) {
    if (haystackSet.has(token)) {
      score += 2;
      continue;
    }
    if (token.length > 3 && haystack.some(candidate => candidate.includes(token) || token.includes(candidate))) {
      score += 0.5;
    }
  }
  return score;
}

function pathSpecificBoost(filePath: string, promptTokens: string[]): number {
  const lowerPath = filePath.toLowerCase();
  let score = 0;
  if (promptTokens.includes("ui") && lowerPath.startsWith("packages/app/")) score += 3;
  if (promptTokens.includes("app") && lowerPath.startsWith("packages/app/")) score += 2;
  if (promptTokens.includes("tree") && lowerPath.includes("treelist")) score += 4;
  if (promptTokens.includes("node") && lowerPath.includes("node")) score += 2;
  if (promptTokens.includes("scope") && lowerPath.includes("scope")) score += 4;
  if (promptTokens.includes("cli") && lowerPath.startsWith("packages/cli/")) score += 3;
  if (promptTokens.includes("core") && lowerPath.startsWith("packages/core/")) score += 3;
  return score;
}

function topScored(items: ScoredItem[], limit: number): ScoredItem[] {
  return items.filter(item => item.score > 0).sort(scoreSort).slice(0, limit);
}

function scoreSort(left: ScoredItem, right: ScoredItem): number {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function scopeStatus(violations: ScopeViolation[]): ScopeCheckStatus {
  if (violations.some(violation => violation.severity === "error")) return "blocked";
  if (violations.some(violation => violation.severity === "warning")) return "warning";
  return "clean";
}

function classifyScopeArea(filePath: string): string[] {
  const path = normalizeScopePath(filePath);
  const areas = new Set<string>();
  if (path.startsWith("packages/app/")) areas.add("app");
  if (path.startsWith("packages/core/")) areas.add("core");
  if (path.startsWith("packages/cli/")) areas.add("source");
  if (path.startsWith("scripts/")) areas.add("scripts");
  if (path.startsWith(".abstraction-tree/")) areas.add("memory");
  if (path.startsWith(".github/")) areas.add("ci");
  if (path.startsWith("docs/") || path.endsWith(".md")) areas.add("docs");
  if (path.includes(".test.") || path.includes("/tests/")) areas.add("tests");
  if (path.endsWith("package.json") || path.endsWith("package-lock.json")) areas.add("package");
  if (path.startsWith(".abstraction-tree/automation/")) areas.add("automation");
  return [...areas];
}

function isMemoryPath(filePath: string): boolean {
  return normalizeScopePath(filePath).startsWith(".abstraction-tree/");
}

function isGeneratedMemoryPath(filePath: string): boolean {
  const normalized = normalizeScopePath(filePath);
  return normalized.startsWith(".abstraction-tree/") && !normalized.startsWith(".abstraction-tree/automation/");
}

function normalizeScopePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").trim();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function scopeId(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    `${pad(date.getHours())}${pad(date.getMinutes())}`,
    "scope"
  ].join("-");
}

function pushList(lines: string[], values: string[]): void {
  for (const value of values) lines.push(`- ${value}`);
}

interface ScoredItem {
  id: string;
  score: number;
}
