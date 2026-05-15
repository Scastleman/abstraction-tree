import type { Concept, FileSummary, TreeNode } from "./schema.js";
import { buildDiffSummary, type DiffFileChange, type DiffSummary } from "./diffSummary.js";
import { scorePromptEvidence, type PromptScoredEvidence } from "./promptRouter.js";

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
    | "memory-without-source"
    | "broad-areas"
    | "generated-only-change"
    | "docs-only-change"
    | "package-metadata-change"
    | "implementation-without-test"
    | "source-changed-memory-not-refreshed"
    | "cross-subsystem-change"
    | "source-app-docs-automation";
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
  const promptEvidence = scorePromptEvidence({
    prompt: input.prompt,
    nodes: input.nodes,
    files: input.files,
    concepts: input.concepts ?? []
  });
  const fileScores = mergeScoredItems(
    scoreFiles(input.files, promptTokens),
    promptEvidence.scoredFiles.map(item => ({ id: item.id, score: item.score + 6 }))
  );
  const nodeScores = mergeScoredItems(
    scoreNodes(input.nodes, fileScores, promptTokens),
    promptEvidence.scoredNodes.map(item => ({ id: item.id, score: item.score + 4 }))
  );
  const selectedNodes = topScored(nodeScores, 6);
  const affectedNodeIds = selectedNodes.length
    ? selectedNodes.map(score => score.id)
    : fallbackNodeIds(input.nodes);
  const allowedFileInference = inferAllowedFiles(
    affectedNodeIds,
    input.nodes,
    input.files,
    fileScores,
    promptTokens,
    promptEvidence.estimatedFiles,
    promptEvidence.scoredConcepts
  );
  const allowedFiles = allowedFileInference.allowedFiles;
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
    rationale: buildRationale(affectedNodeIds, allowedFiles, selectedNodes, fileScores, allowedFileInference)
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
  const violationKinds = new Set<ScopeViolation["kind"]>();
  const addViolation = (violation: ScopeViolation) => {
    violations.push(violation);
    violationKinds.add(violation.kind);
  };
  const changedFiles = diffSummary.files.map(file => file.path);
  const nonMemoryFiles = diffSummary.files.filter(file => !isMemoryPath(file.path));

  if (contract.requiresClarification) {
    addViolation({
      severity: "warning",
      kind: "clarification-required",
      message: "Scope contract requested clarification before implementation."
    });
  }

  for (const file of diffSummary.files) {
    if (isGeneratedMemoryPath(file.path) && contract.allowGeneratedMemory) continue;
    if (!allowedFiles.has(file.path)) {
      addViolation({
        severity: "error",
        kind: "file-out-of-scope",
        filePath: file.path,
        message: `${file.path} changed outside the scope contract.`
      });
    }
  }

  if (diffSummary.changedMemoryFiles > 0 && nonMemoryFiles.length === 0) {
    addViolation({
      severity: "warning",
      kind: diffSummary.changedGeneratedMemoryFiles === diffSummary.changedFileCount ? "generated-only-change" : "memory-without-source",
      message: diffSummary.changedGeneratedMemoryFiles === diffSummary.changedFileCount
        ? "Only generated abstraction memory changed; verify this was an intentional memory refresh."
        : "Only abstraction memory changed; verify this was an intentional memory refresh."
    });
  }

  for (const dangerous of diffSummary.dangerousFileChanges) {
    addViolation({
      severity: "error",
      kind: "dangerous-file",
      filePath: dangerous.path,
      message: `${dangerous.path} changed a dangerous or sensitive file category: ${dangerous.reasons.join(", ")}.`
    });
  }

  if (diffSummary.changedFileCount > contract.maxFilesChanged) {
    addViolation({
      severity: "warning",
      kind: "file-count",
      message: `${diffSummary.changedFileCount} files changed; scope contract expected at most ${contract.maxFilesChanged}.`
    });
  }

  if (diffSummary.changedLines > contract.maxDiffLines) {
    addViolation({
      severity: "warning",
      kind: "line-count",
      message: `${diffSummary.changedLines} lines changed; scope contract expected at most ${contract.maxDiffLines}.`
    });
  }

  for (const signal of diffSummary.overreach) {
    if (signal.kind === "file-count" || signal.kind === "line-count") continue;
    if (violationKinds.has(signal.kind)) continue;
    addViolation({
      severity: "warning",
      kind: signal.kind,
      message: signal.message
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
  pushList(lines, report.violations.length ? report.violations.map(violation => `[${violation.severity}/${violation.kind}] ${violation.message}`) : ["None detected."]);
  lines.push("");
  lines.push("## Risky Areas");
  pushList(lines, riskyAreaLines(report));
  lines.push("");
  lines.push("## Recommended Reviewer Checks");
  pushList(lines, recommendedReviewerChecks(report));
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
  promptTokens: string[],
  routeEstimatedFiles: string[],
  scoredConcepts: Array<PromptScoredEvidence<Concept>>
): AllowedFileInference {
  const byNode = new Map(nodes.map(node => [node.id, node]));
  const byFile = new Map(files.map(file => [normalizeScopePath(file.path), file]));
  const existing = new Set(byFile.keys());
  const candidates = new Set<string>();
  const evidenceByFile = new Map<string, Set<AllowedFileEvidenceKind>>();
  const promptScoreByFile = new Map(fileScores.map(score => [normalizeScopePath(score.id), score.score]));
  const scoreByFile = new Map(promptScoreByFile);
  const routeFiles = routeEstimatedFiles.map(normalizeScopePath);
  const routeFileSet = new Set(routeFiles);
  const addCandidate = (filePath: string, evidence: AllowedFileEvidenceKind, score = 0): void => {
    const normalized = normalizeScopePath(filePath);
    if (!existing.has(normalized)) return;
    candidates.add(normalized);
    const evidenceSet = evidenceByFile.get(normalized) ?? new Set<AllowedFileEvidenceKind>();
    evidenceSet.add(evidence);
    evidenceByFile.set(normalized, evidenceSet);
    scoreByFile.set(normalized, Math.max(scoreByFile.get(normalized) ?? 0, score));
  };

  for (const nodeId of affectedNodeIds) {
    const node = byNode.get(nodeId);
    const nodeFiles = sortedUnique([...(node?.sourceFiles ?? []), ...(node?.ownedFiles ?? [])].map(normalizeScopePath));
    const allowedNodeFiles = nodeFiles.length <= 5
      ? nodeFiles
      : nodeFiles.filter(filePath => promptScoreByFile.has(filePath) || routeFileSet.has(filePath));
    for (const filePath of allowedNodeFiles) {
      addCandidate(filePath, "selected-node", (promptScoreByFile.get(filePath) ?? 0) + 2);
    }
  }

  for (const fileScore of topScored(fileScores, 8)) {
    addCandidate(fileScore.id, "direct-prompt", fileScore.score + 3);
  }

  for (const filePath of routeFiles.slice(0, 8)) {
    addCandidate(filePath, "route", (promptScoreByFile.get(filePath) ?? 0) + 3);
  }

  for (const conceptFile of conceptRelatedFileCandidates(scoredConcepts, byFile, promptScoreByFile, promptTokens).slice(0, 8)) {
    addCandidate(conceptFile.id, "concept", conceptFile.score + 2);
  }

  if ([...candidates].some(filePath => filePath.startsWith("packages/app/"))) {
    addCandidate("packages/app/src/app.test.tsx", "nearby-test", 3);
    if (promptTokens.some(token => ["collapse", "collapsible", "dropdown", "style", "ui", "visual"].includes(token))) {
      addCandidate("packages/app/src/styles.css", "direct-prompt", (promptScoreByFile.get("packages/app/src/styles.css") ?? 0) + 2);
    }
  }

  for (const filePath of importNeighborCandidates([...candidates], files, existing).slice(0, 8)) {
    addCandidate(filePath, "import-neighbor", (promptScoreByFile.get(filePath) ?? 0) + 2);
  }

  for (const filePath of [...candidates]) {
    const baseScore = scoreByFile.get(filePath) ?? 0;
    for (const testPath of nearbyTestCandidates(filePath)) {
      addCandidate(testPath, "nearby-test", baseScore + 3);
    }
    for (const sourcePath of nearbySourceCandidates(filePath)) {
      addCandidate(sourcePath, "nearby-source", baseScore + 3);
    }
  }

  const candidateFiles = [...candidates];
  const allowedFiles = limitAllowedFiles(candidateFiles, scoreByFile, 16);
  return {
    allowedFiles,
    candidateCount: candidateFiles.length,
    excludedCandidateCount: Math.max(0, candidateFiles.length - allowedFiles.length),
    selectedNodeFileCount: countEvidence(allowedFiles, evidenceByFile, "selected-node"),
    directFileCount: countEvidence(allowedFiles, evidenceByFile, "direct-prompt"),
    routeFileCount: countEvidence(allowedFiles, evidenceByFile, "route"),
    conceptFileCount: countEvidence(allowedFiles, evidenceByFile, "concept"),
    importNeighborFileCount: countEvidence(allowedFiles, evidenceByFile, "import-neighbor"),
    nearbyTestFileCount: countEvidence(allowedFiles, evidenceByFile, "nearby-test"),
    nearbySourceFileCount: countEvidence(allowedFiles, evidenceByFile, "nearby-source")
  };
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
  fileScores: ScoredItem[],
  inference: AllowedFileInference
): string[] {
  const rationale = [
    `Selected ${affectedNodeIds.length} affected node(s) from prompt/tree term overlap.`,
    `Allowed ${allowedFiles.length} file(s) from selected node ownership, direct prompt matches, route evidence, concept evidence, import neighbors, and nearby source/test companions.`,
    `Grounding counts: ${inference.selectedNodeFileCount} node-owned, ${inference.directFileCount} direct, ${inference.routeFileCount} route, ${inference.conceptFileCount} concept, ${inference.importNeighborFileCount} import-neighbor, ${inference.nearbyTestFileCount} nearby test, ${inference.nearbySourceFileCount} nearby source.`
  ];
  if (selectedNodes.length) rationale.push(`Highest node score: ${selectedNodes[0].id} (${selectedNodes[0].score.toFixed(1)}).`);
  if (fileScores.length) rationale.push(`Highest file score: ${fileScores[0].id} (${fileScores[0].score.toFixed(1)}).`);
  if (inference.routeFileCount > 0) rationale.push(`Route evidence contributed ${inference.routeFileCount} allowed file(s).`);
  if (inference.conceptFileCount > 0) rationale.push(`Concept evidence contributed ${inference.conceptFileCount} allowed file(s).`);
  if (inference.importNeighborFileCount > 0) rationale.push(`Import graph evidence contributed ${inference.importNeighborFileCount} neighboring file(s).`);
  if (inference.excludedCandidateCount > 0) {
    rationale.push(`Excluded ${inference.excludedCandidateCount} lower-scored candidate file(s) to keep the contract reviewable.`);
  }
  return rationale;
}

function mergeScoredItems(primary: ScoredItem[], secondary: ScoredItem[]): ScoredItem[] {
  const merged = new Map<string, ScoredItem>();
  for (const item of [...primary, ...secondary]) {
    const existing = merged.get(item.id);
    merged.set(item.id, {
      id: item.id,
      score: (existing?.score ?? 0) + item.score
    });
  }
  return [...merged.values()].filter(item => item.score > 0).sort(scoreSort);
}

function limitAllowedFiles(allowedFiles: string[], scoreByFile: Map<string, number>, limit: number): string[] {
  if (allowedFiles.length <= limit) return sortedUnique(allowedFiles);
  return allowedFiles
    .sort((left, right) => (scoreByFile.get(right) ?? 0) - (scoreByFile.get(left) ?? 0) || left.localeCompare(right))
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

function conceptRelatedFileCandidates(
  scoredConcepts: Array<PromptScoredEvidence<Concept>>,
  byFile: Map<string, FileSummary>,
  promptScoreByFile: Map<string, number>,
  promptTokens: string[]
): ScoredItem[] {
  const candidates = new Map<string, number>();
  for (const conceptScore of scoredConcepts.slice(0, 4)) {
    const conceptDirectMatch = promptTokens.includes(conceptScore.item.id) ||
      conceptScore.item.tags.some(tag => tokenize(tag).some(token => promptTokens.includes(token)));
    const related = conceptScore.item.relatedFiles
      .map(filePath => normalizeScopePath(filePath))
      .filter(filePath => byFile.has(filePath))
      .map(filePath => ({
        id: filePath,
        score: (promptScoreByFile.get(filePath) ?? 0) + pathSpecificBoost(filePath, promptTokens) + (conceptDirectMatch ? 1 : 0)
      }))
      .filter(item => item.score > 0)
      .sort(scoreSort)
      .slice(0, 6);
    for (const item of related) {
      candidates.set(item.id, Math.max(candidates.get(item.id) ?? 0, item.score + conceptScore.score / 4));
    }
  }
  return [...candidates.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort(scoreSort);
}

function importNeighborCandidates(seedFiles: string[], files: FileSummary[], existing: Set<string>): string[] {
  const seeds = new Set(seedFiles.map(normalizeScopePath));
  const neighbors = new Set<string>();
  for (const file of files) {
    const from = normalizeScopePath(file.path);
    for (const specifier of file.imports) {
      const to = resolveLocalImport(from, specifier, existing);
      if (!to) continue;
      if (seeds.has(from)) neighbors.add(to);
      if (seeds.has(to)) neighbors.add(from);
    }
  }
  return [...neighbors].sort();
}

function resolveLocalImport(fromFile: string, specifier: string, existing: Set<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalizeRelativePath(`${scopeDirname(fromFile)}/${specifier}`);
  for (const candidate of importPathCandidates(base)) {
    if (existing.has(candidate)) return candidate;
  }
  return undefined;
}

function importPathCandidates(basePath: string): string[] {
  const candidates = [basePath];
  const extension = scopeExtension(basePath);
  if (extension === ".js") {
    candidates.push(replacePathExtension(basePath, ".ts"), replacePathExtension(basePath, ".tsx"), replacePathExtension(basePath, ".mts"), replacePathExtension(basePath, ".cts"));
  } else if (extension === ".jsx") {
    candidates.push(replacePathExtension(basePath, ".tsx"));
  } else if (!extension) {
    for (const candidateExtension of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts", ".json", ".css"]) {
      candidates.push(`${basePath}${candidateExtension}`);
    }
    for (const candidateExtension of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cts"]) {
      candidates.push(`${basePath}/index${candidateExtension}`);
    }
  }
  return sortedUnique(candidates.map(normalizeScopePath));
}

function nearbyTestCandidates(filePath: string): string[] {
  const normalized = normalizeScopePath(filePath);
  if (isTestLikePath(normalized)) return [];
  const extension = scopeExtension(normalized);
  if (!extension) return [];
  const base = normalized.slice(0, -extension.length);
  const dirname = scopeDirname(normalized);
  const basename = scopeBasename(normalized);
  return sortedUnique([
    `${base}.test${extension}`,
    `${base}.spec${extension}`,
    dirname ? `${dirname}/__tests__/${basename.slice(0, -extension.length)}.test${extension}` : ""
  ]);
}

function nearbySourceCandidates(filePath: string): string[] {
  const normalized = normalizeScopePath(filePath);
  const direct = normalized
    .replace(/\.test(\.[^.\/]+)$/u, "$1")
    .replace(/\.spec(\.[^.\/]+)$/u, "$1");
  const candidates = direct !== normalized ? [direct] : [];
  if (normalized.includes("/__tests__/")) {
    const withoutTestsDir = normalized.replace("/__tests__/", "/");
    candidates.push(
      withoutTestsDir
        .replace(/\.test(\.[^.\/]+)$/u, "$1")
        .replace(/\.spec(\.[^.\/]+)$/u, "$1")
    );
  }
  return sortedUnique(candidates);
}

function countEvidence(
  allowedFiles: string[],
  evidenceByFile: Map<string, Set<AllowedFileEvidenceKind>>,
  evidence: AllowedFileEvidenceKind
): number {
  return allowedFiles.filter(filePath => evidenceByFile.get(filePath)?.has(evidence)).length;
}

function isTestLikePath(filePath: string): boolean {
  return filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("/__tests__/") || filePath.includes("/tests/");
}

function scopeDirname(filePath: string): string {
  return normalizeScopePath(filePath).split("/").slice(0, -1).join("/");
}

function scopeBasename(filePath: string): string {
  return normalizeScopePath(filePath).split("/").filter(Boolean).at(-1) ?? filePath;
}

function scopeExtension(filePath: string): string {
  const basename = scopeBasename(filePath);
  const index = basename.lastIndexOf(".");
  return index > 0 ? basename.slice(index) : "";
}

function replacePathExtension(filePath: string, extension: string): string {
  const normalized = normalizeScopePath(filePath);
  const currentExtension = scopeExtension(normalized);
  return currentExtension ? `${normalized.slice(0, -currentExtension.length)}${extension}` : `${normalized}${extension}`;
}

function normalizeRelativePath(filePath: string): string {
  const segments: string[] = [];
  for (const segment of normalizeScopePath(filePath).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
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

function riskyAreaLines(report: ScopeCheckReport): string[] {
  const lines: string[] = [];
  for (const dangerous of report.diffSummary.dangerousFileChanges) {
    lines.push(`${dangerous.path}: ${dangerous.reasons.join(", ")}`);
  }
  for (const signal of report.diffSummary.overreach) {
    lines.push(`[${signal.kind}] ${signal.message}`);
  }
  return lines.length ? lines : ["None detected."];
}

function recommendedReviewerChecks(report: ScopeCheckReport): string[] {
  const checks = new Set<string>();
  const kinds = new Set(report.violations.map(violation => violation.kind));
  if (kinds.has("file-out-of-scope")) checks.add("Confirm every out-of-scope file was explicitly approved or narrow the diff.");
  if (kinds.has("dangerous-file")) checks.add("Review dangerous file changes for secrets, CI, lockfile, or package-manager impact.");
  if (kinds.has("generated-only-change")) checks.add("Verify generated memory changes came from an intentional scan, evaluation, or context refresh.");
  if (kinds.has("docs-only-change")) checks.add("Confirm documentation-only work did not require source or test changes.");
  if (kinds.has("package-metadata-change")) checks.add("Review package metadata, lockfile, install, and script behavior.");
  if (kinds.has("implementation-without-test")) checks.add("Decide whether the implementation needs a nearby unit or integration test.");
  if (kinds.has("source-changed-memory-not-refreshed")) checks.add("Consider running a memory refresh if source changes affect scanner output, ownership, concepts, or invariants.");
  if (kinds.has("cross-subsystem-change")) checks.add("Check that each touched subsystem is required by the prompt and has matching tests or docs.");
  if (kinds.has("broad-areas") || kinds.has("source-app-docs-automation")) checks.add("Review whether mixed areas represent one coherent change or unrelated work.");
  if (report.diffSummary.changedAreas.length) checks.add(`Inspect changed areas: ${report.diffSummary.changedAreas.join(", ")}.`);
  return checks.size ? [...checks] : ["Review changed files against the allowed file list and required checks."];
}

function pushList(lines: string[], values: string[]): void {
  for (const value of values) lines.push(`- ${value}`);
}

type AllowedFileEvidenceKind =
  | "selected-node"
  | "direct-prompt"
  | "route"
  | "concept"
  | "import-neighbor"
  | "nearby-test"
  | "nearby-source";

interface AllowedFileInference {
  allowedFiles: string[];
  candidateCount: number;
  excludedCandidateCount: number;
  selectedNodeFileCount: number;
  directFileCount: number;
  routeFileCount: number;
  conceptFileCount: number;
  importNeighborFileCount: number;
  nearbyTestFileCount: number;
  nearbySourceFileCount: number;
}

interface ScoredItem {
  id: string;
  score: number;
}
