import type {
  ChangeRecord,
  Concept,
  ContextPack,
  ContextPackDiagnostics,
  ContextSelectionDiagnostic,
  ContextSelectionKind,
  FileSummary,
  Invariant,
  TreeNode
} from "./schema.js";
import { CONTEXT_PACK_LIMITS } from "./contextLimits.js";

const TOKEN_ESTIMATOR: ContextPackDiagnostics["tokenEstimator"] = "approximate-json-chars-div-4";
const EXCLUDED_NEARBY_LIMIT = 8;

export function buildContextPack(args: {
  target: string;
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  invariants: Invariant[];
  changes: ChangeRecord[];
  maxTokens?: number;
  includeDiagnostics?: boolean;
}): ContextPack {
  const query = normalize(args.target);
  const queryTokens = tokenize(args.target);
  const diagnosticsEnabled = Boolean(args.includeDiagnostics || args.maxTokens !== undefined);
  const agentInstructions = [
    "Use the relevant abstraction nodes as the change boundary.",
    "Preserve listed invariants unless the user explicitly asks to change them.",
    "Avoid touching files outside allowed ownership unless dependency analysis requires it.",
    "After code changes, update `.abstraction-tree/` files and write a semantic change record."
  ];
  const basePack: ContextPack = {
    id: `context.${Date.now()}`,
    createdAt: new Date().toISOString(),
    target: args.target,
    projectSummary: projectSummary(args.nodes),
    relevantNodes: [],
    relevantFiles: [],
    relevantConcepts: [],
    invariants: [],
    recentChanges: [],
    agentInstructions
  };
  const budget = {
    maxTokens: normalizeMaxTokens(args.maxTokens),
    estimatedTokens: estimateTokens(basePack)
  };
  const selectedDiagnostics: ContextSelectionDiagnostic[] = [];
  const excludedDiagnostics: ContextSelectionDiagnostic[] = [];

  const conceptScores = args.concepts
    .map(concept => conceptCandidate(concept, scoreConcept(concept, query, queryTokens)))
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(conceptName));
  const conceptFileSet = new Set(conceptScores.flatMap(scored => scored.item.relatedFiles));
  const conceptNodeSet = new Set(conceptScores.flatMap(scored => scored.item.relatedNodeIds));

  const nodeScores = args.nodes
    .map(node => {
      const scored = scoreNode(node, query, queryTokens);
      const files = nodeFiles(node);
      const conceptOverlap = files.filter(file => conceptFileSet.has(file)).length;
      const conceptNodeBoost = conceptNodeSet.has(node.id) ? 10 : 0;
      const reasons = [...scored.reasons];
      if (conceptOverlap > 0) reasons.push(`related concept file overlap: ${conceptOverlap} file(s) (+${conceptOverlap * 5})`);
      if (conceptNodeBoost > 0) reasons.push(`related concept references this node (+${conceptNodeBoost})`);
      return nodeCandidate(node, {
        score: scored.score + conceptOverlap * 5 + conceptNodeBoost,
        reasons
      });
    })
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(nodeName));
  const nodeSelection = selectCandidates(uniqueScoredBy(nodeScores, node => node.id), CONTEXT_PACK_LIMITS.nodes, budget);
  recordDiagnostics(nodeSelection, selectedDiagnostics, excludedDiagnostics);
  const relevantNodes = nodeSelection.selected.map(scored => scored.item);

  const nodeFileSet = new Set(relevantNodes.flatMap(nodeFiles));
  const fileScores = args.files
    .map(file => {
      const scored = scoreFile(file, query, queryTokens);
      const ownershipBoost = nodeFileSet.has(file.path) ? 8 : 0;
      const conceptBoost = conceptFileSet.has(file.path) ? 8 : 0;
      const reasons = [...scored.reasons];
      if (ownershipBoost > 0) reasons.push(`owned by selected node (+${ownershipBoost})`);
      if (conceptBoost > 0) reasons.push(`referenced by matching concept (+${conceptBoost})`);
      return fileCandidate(file, {
        score: scored.score + ownershipBoost + conceptBoost,
        reasons
      });
    })
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(file => file.path));
  const fileSelection = selectCandidates(uniqueScoredBy(fileScores, file => file.path), CONTEXT_PACK_LIMITS.files, budget);
  recordDiagnostics(fileSelection, selectedDiagnostics, excludedDiagnostics);
  const relevantFiles = fileSelection.selected.map(scored => scored.item);

  const fileSet = new Set(relevantFiles.map(file => file.path));
  for (const node of relevantNodes) {
    for (const filePath of nodeFiles(node)) fileSet.add(filePath);
  }
  const nodeIds = new Set(relevantNodes.map(n => n.id));
  const conceptSelection = selectCandidates(
    buildConceptSelectionCandidates(conceptScores, args.concepts, fileSet, nodeIds),
    CONTEXT_PACK_LIMITS.concepts,
    budget
  );
  recordDiagnostics(conceptSelection, selectedDiagnostics, excludedDiagnostics);
  const relevantConcepts = conceptSelection.selected.map(scored => scored.item);

  const invariantSelection = selectCandidates(
    buildInvariantCandidates(args.invariants, query, queryTokens, fileSet, nodeIds),
    Number.POSITIVE_INFINITY,
    budget
  );
  recordDiagnostics(invariantSelection, selectedDiagnostics, excludedDiagnostics);
  const invariants = invariantSelection.selected.map(scored => scored.item);

  const changeSelection = selectCandidates(
    args.changes.slice(-10).map((change, index) => changeCandidate(change, index)),
    Number.POSITIVE_INFINITY,
    budget
  );
  recordDiagnostics(changeSelection, selectedDiagnostics, excludedDiagnostics);

  const pack: ContextPack = {
    ...basePack,
    relevantNodes,
    relevantFiles,
    relevantConcepts,
    invariants,
    recentChanges: changeSelection.selected.map(scored => scored.item)
  };

  if (diagnosticsEnabled) {
    pack.diagnostics = {
      tokenEstimator: TOKEN_ESTIMATOR,
      budgeted: budget.maxTokens !== undefined,
      estimatedTokens: budget.estimatedTokens,
      ...(budget.maxTokens !== undefined ? { maxTokens: budget.maxTokens } : {}),
      selected: selectedDiagnostics,
      excludedNearby: nearbyExcluded(excludedDiagnostics)
    };
  }

  return pack;
}

export function formatContextPackMarkdown(pack: ContextPack): string {
  const lines: string[] = [
    `# Context Pack: ${pack.target}`,
    "",
    `- ID: \`${pack.id}\``,
    `- Created: ${pack.createdAt}`
  ];
  if (pack.diagnostics) {
    const max = pack.diagnostics.maxTokens === undefined ? "unbounded" : String(pack.diagnostics.maxTokens);
    lines.push(`- Estimated tokens: ${pack.diagnostics.estimatedTokens} of ${max}`);
    lines.push(`- Token estimate: ${pack.diagnostics.tokenEstimator}`);
  }
  lines.push("", "## Project Summary", "", pack.projectSummary, "");

  pushNodeMarkdown(lines, pack.relevantNodes);
  pushFileMarkdown(lines, pack.relevantFiles);
  pushConceptMarkdown(lines, pack.relevantConcepts);
  pushInvariantMarkdown(lines, pack.invariants);
  pushChangeMarkdown(lines, pack.recentChanges);
  pushStringListMarkdown(lines, "Agent Instructions", pack.agentInstructions);
  if (pack.diagnostics) pushDiagnosticsMarkdown(lines, pack.diagnostics);

  return `${lines.join("\n").trimEnd()}\n`;
}

export function estimateContextItemTokens(value: unknown): number {
  return estimateTokens(value);
}

interface ScoreResult {
  score: number;
  reasons: string[];
}

interface ScoredCandidate<T> {
  item: T;
  kind: ContextSelectionKind;
  id: string;
  label: string;
  score: number;
  reasons: string[];
  estimatedTokens: number;
  excludedReason?: ContextSelectionDiagnostic["excludedReason"];
}

interface BudgetState {
  maxTokens?: number;
  estimatedTokens: number;
}

interface SelectionResult<T> {
  selected: ScoredCandidate<T>[];
  excluded: ScoredCandidate<T>[];
}

function conceptCandidate(concept: Concept, scored: ScoreResult): ScoredCandidate<Concept> {
  return {
    item: concept,
    kind: "concept",
    id: concept.id,
    label: concept.title,
    score: scored.score,
    reasons: scored.reasons,
    estimatedTokens: estimateTokens(concept)
  };
}

function nodeCandidate(node: TreeNode, scored: ScoreResult): ScoredCandidate<TreeNode> {
  return {
    item: node,
    kind: "node",
    id: node.id,
    label: nodeName(node),
    score: scored.score,
    reasons: scored.reasons,
    estimatedTokens: estimateTokens(node)
  };
}

function fileCandidate(file: FileSummary, scored: ScoreResult): ScoredCandidate<FileSummary> {
  return {
    item: file,
    kind: "file",
    id: file.path,
    label: file.path,
    score: scored.score,
    reasons: scored.reasons,
    estimatedTokens: estimateTokens(file)
  };
}

function invariantCandidate(invariant: Invariant, scored: ScoreResult): ScoredCandidate<Invariant> {
  return {
    item: invariant,
    kind: "invariant",
    id: invariant.id,
    label: invariant.title,
    score: scored.score,
    reasons: scored.reasons,
    estimatedTokens: estimateTokens(invariant)
  };
}

function changeCandidate(change: ChangeRecord, index: number): ScoredCandidate<ChangeRecord> {
  return {
    item: change,
    kind: "change",
    id: change.id,
    label: change.title,
    score: index + 1,
    reasons: ["recent semantic change record"],
    estimatedTokens: estimateTokens(change)
  };
}

function buildConceptSelectionCandidates(
  conceptScores: ScoredCandidate<Concept>[],
  concepts: Concept[],
  fileSet: Set<string>,
  nodeIds: Set<string>
): ScoredCandidate<Concept>[] {
  const selected: ScoredCandidate<Concept>[] = [];
  const seen = new Set<string>();

  for (const scored of conceptScores) {
    selected.push(addConceptSelectionReasons(scored, fileSet, nodeIds));
    seen.add(scored.item.id);
  }

  for (const concept of concepts) {
    if (seen.has(concept.id)) continue;
    const related = scoreConceptSelection(concept, fileSet, nodeIds);
    if (related.score <= 0) continue;
    selected.push(conceptCandidate(concept, related));
    seen.add(concept.id);
  }

  return uniqueScoredBy(selected, concept => concept.id);
}

function addConceptSelectionReasons(
  scored: ScoredCandidate<Concept>,
  fileSet: Set<string>,
  nodeIds: Set<string>
): ScoredCandidate<Concept> {
  const related = scoreConceptSelection(scored.item, fileSet, nodeIds);
  if (related.score <= 0) return scored;
  return {
    ...scored,
    score: scored.score + related.score,
    reasons: [...scored.reasons, ...related.reasons]
  };
}

function scoreConceptSelection(concept: Concept, fileSet: Set<string>, nodeIds: Set<string>): ScoreResult {
  const fileOverlap = concept.relatedFiles.filter(file => fileSet.has(file)).length;
  const nodeOverlap = concept.relatedNodeIds.filter(id => nodeIds.has(id)).length;
  const reasons: string[] = [];
  let score = 0;
  if (fileOverlap > 0) {
    score += fileOverlap * 4;
    reasons.push(`related to ${fileOverlap} selected file(s) (+${fileOverlap * 4})`);
  }
  if (nodeOverlap > 0) {
    score += nodeOverlap * 4;
    reasons.push(`related to ${nodeOverlap} selected node(s) (+${nodeOverlap * 4})`);
  }
  return { score, reasons };
}

function buildInvariantCandidates(
  invariants: Invariant[],
  query: string,
  queryTokens: string[],
  fileSet: Set<string>,
  nodeIds: Set<string>
): ScoredCandidate<Invariant>[] {
  return invariants
    .map(invariant => {
      const scored = scoreInvariant(invariant, query, queryTokens);
      const fileOverlap = invariant.filePaths.filter(file => fileSet.has(file)).length;
      const nodeOverlap = invariant.nodeIds.filter(id => nodeIds.has(id)).length;
      const reasons = [...scored.reasons];
      let score = scored.score;
      if (fileOverlap > 0) {
        score += fileOverlap * 6;
        reasons.push(`protects ${fileOverlap} selected file(s) (+${fileOverlap * 6})`);
      }
      if (nodeOverlap > 0) {
        score += nodeOverlap * 6;
        reasons.push(`protects ${nodeOverlap} selected node(s) (+${nodeOverlap * 6})`);
      }
      return invariantCandidate(invariant, { score, reasons });
    })
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(invariant => invariant.title));
}

function selectCandidates<T>(
  candidates: ScoredCandidate<T>[],
  limit: number,
  budget: BudgetState
): SelectionResult<T> {
  const selected: ScoredCandidate<T>[] = [];
  const excluded: ScoredCandidate<T>[] = [];

  candidates.forEach((candidate, index) => {
    if (index >= limit) {
      excluded.push({ ...candidate, excludedReason: "hard-limit" });
      return;
    }
    if (budget.maxTokens !== undefined && budget.estimatedTokens + candidate.estimatedTokens > budget.maxTokens) {
      excluded.push({ ...candidate, excludedReason: "token-budget" });
      return;
    }
    selected.push(candidate);
    budget.estimatedTokens += candidate.estimatedTokens;
  });

  return { selected, excluded };
}

function recordDiagnostics(
  selection: SelectionResult<unknown>,
  selected: ContextSelectionDiagnostic[],
  excluded: ContextSelectionDiagnostic[]
): void {
  selected.push(...selection.selected.map(toDiagnostic));
  excluded.push(...selection.excluded.map(toDiagnostic));
}

function toDiagnostic(candidate: ScoredCandidate<unknown>): ContextSelectionDiagnostic {
  return {
    kind: candidate.kind,
    id: candidate.id,
    label: candidate.label,
    score: candidate.score,
    estimatedTokens: candidate.estimatedTokens,
    reasons: candidate.reasons.length ? candidate.reasons : ["included by context-pack selection"],
    ...(candidate.excludedReason ? { excludedReason: candidate.excludedReason } : {})
  };
}

function nearbyExcluded(excluded: ContextSelectionDiagnostic[]): ContextSelectionDiagnostic[] {
  return [...excluded]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.label.localeCompare(b.label);
    })
    .slice(0, EXCLUDED_NEARBY_LIMIT);
}

function nodeName(node: TreeNode): string {
  return node.name ?? node.title;
}

function nodeFiles(node: TreeNode): string[] {
  const sourceFiles = Array.isArray(node.sourceFiles) ? node.sourceFiles : [];
  return sourceFiles.length ? sourceFiles : Array.isArray(node.ownedFiles) ? node.ownedFiles : [];
}

function nodeDependencies(node: TreeNode): string[] {
  const dependencies = Array.isArray(node.dependencies) ? node.dependencies : [];
  return dependencies.length ? dependencies : Array.isArray(node.dependsOn) ? node.dependsOn : [];
}

function scoreNode(node: TreeNode, query: string, queryTokens: string[]): ScoreResult {
  return combineScores([
    scoreText("node name", nodeName(node), query, queryTokens, 4),
    scoreText("node summary", node.summary, query, queryTokens, 3),
    scoreText("node explanation", node.explanation, query, queryTokens, 2),
    scoreText("node separation logic", node.separationLogic, query, queryTokens, 2),
    scoreList("node files", nodeFiles(node), query, queryTokens, 3),
    scoreList("node responsibilities", node.responsibilities ?? [], query, queryTokens, 2),
    scoreList("node dependencies", nodeDependencies(node), query, queryTokens, 1)
  ]);
}

function projectSummary(nodes: TreeNode[]): string {
  const projectNode = nodes.find(n => n.id === "project.intent");
  return projectNode?.explanation?.trim() || projectNode?.summary || "Project context pack.";
}

function scoreFile(file: FileSummary, query: string, queryTokens: string[]): ScoreResult {
  return combineScores([
    scoreText("file path", file.path, query, queryTokens, 4),
    scoreText("file summary", file.summary, query, queryTokens, 2),
    scoreList("file symbols", file.symbols, query, queryTokens, 3),
    scoreList("file exports", file.exports, query, queryTokens, 3),
    scoreList("file imports", file.imports, query, queryTokens, 1)
  ]);
}

function scoreConcept(concept: Concept, query: string, queryTokens: string[]): ScoreResult {
  return combineScores([
    scoreText("concept title", concept.title, query, queryTokens, 5),
    scoreText("concept summary", concept.summary, query, queryTokens, 3),
    scoreList("concept tags", concept.tags, query, queryTokens, 4),
    scoreList("concept files", concept.relatedFiles, query, queryTokens, 2)
  ]);
}

function scoreInvariant(invariant: Invariant, query: string, queryTokens: string[]): ScoreResult {
  return combineScores([
    scoreText("invariant title", invariant.title, query, queryTokens, 4),
    scoreText("invariant description", invariant.description, query, queryTokens, 3),
    scoreList("invariant nodes", invariant.nodeIds, query, queryTokens, 2),
    scoreList("invariant files", invariant.filePaths, query, queryTokens, 2)
  ]);
}

function combineScores(scores: ScoreResult[]): ScoreResult {
  return {
    score: scores.reduce((sum, value) => sum + value.score, 0),
    reasons: scores.flatMap(value => value.reasons)
  };
}

function scoreList(field: string, values: string[] = [], query: string, queryTokens: string[], weight: number): ScoreResult {
  return combineScores(values.map(value => scoreText(field, value, query, queryTokens, weight)));
}

function scoreText(valueField: string, value: string | undefined, query: string, queryTokens: string[], weight: number): ScoreResult {
  const text = normalize(value ?? "");
  if (!text) return { score: 0, reasons: [] };
  const textTokens = new Set(tokenize(text));
  const reasons: string[] = [];
  let score = 0;
  if (query && text.includes(query)) {
    const valueScore = 5 * weight;
    score += valueScore;
    reasons.push(`${valueField} contains exact query (+${valueScore})`);
  }
  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      const valueScore = 3 * weight;
      score += valueScore;
      reasons.push(`${valueField} matches token "${token}" (+${valueScore})`);
    } else if (text.includes(token)) {
      score += weight;
      reasons.push(`${valueField} contains token fragment "${token}" (+${weight})`);
    }
  }
  return { score, reasons };
}

function tokenize(input: string): string[] {
  return normalize(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 2);
}

function normalize(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

function byScoreThenName<T>(name: (item: T) => string) {
  return (a: { item: T; score: number }, b: { item: T; score: number }) => {
    if (b.score !== a.score) return b.score - a.score;
    return name(a.item).localeCompare(name(b.item));
  };
}

function uniqueScoredBy<T>(items: ScoredCandidate<T>[], key: (item: T) => string): ScoredCandidate<T>[] {
  const seen = new Set<string>();
  return items.filter(scored => {
    const value = key(scored.item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function conceptName(concept: Concept): string {
  return concept.title;
}

function normalizeMaxTokens(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return Math.max(1, Math.ceil(text.length / 4));
}

function pushNodeMarkdown(lines: string[], nodes: TreeNode[]): void {
  lines.push("## Relevant Nodes", "");
  if (!nodes.length) {
    lines.push("None.", "");
    return;
  }
  for (const node of nodes) {
    lines.push(`- \`${node.id}\` - ${nodeName(node)}`);
    lines.push(`  Summary: ${node.summary}`);
    if (node.explanation?.trim() && node.explanation.trim() !== node.summary.trim()) {
      lines.push(`  Explanation: ${node.explanation.trim()}`);
    }
    if (node.separationLogic?.trim()) {
      lines.push(`  Separation logic: ${node.separationLogic.trim()}`);
    }
    const files = nodeFiles(node);
    if (files.length) lines.push(`  Files: ${inlineCodeList(files)}`);
  }
  lines.push("");
}

function pushFileMarkdown(lines: string[], files: FileSummary[]): void {
  lines.push("## Relevant Files", "");
  if (!files.length) {
    lines.push("None.", "");
    return;
  }
  for (const file of files) {
    lines.push(`- \`${file.path}\` - ${file.summary}`);
    if (file.symbols.length) lines.push(`  Symbols: ${inlineCodeList(file.symbols.slice(0, 8))}`);
    if (file.exports.length) lines.push(`  Exports: ${inlineCodeList(file.exports.slice(0, 8))}`);
  }
  lines.push("");
}

function pushConceptMarkdown(lines: string[], concepts: Concept[]): void {
  lines.push("## Relevant Concepts", "");
  if (!concepts.length) {
    lines.push("None.", "");
    return;
  }
  for (const concept of concepts) {
    lines.push(`- \`${concept.id}\` - ${concept.title}: ${concept.summary}`);
    if (concept.relatedFiles.length) lines.push(`  Files: ${inlineCodeList(concept.relatedFiles.slice(0, 8))}`);
  }
  lines.push("");
}

function pushInvariantMarkdown(lines: string[], invariants: Invariant[]): void {
  lines.push("## Invariants", "");
  if (!invariants.length) {
    lines.push("None.", "");
    return;
  }
  for (const invariant of invariants) {
    lines.push(`- \`${invariant.id}\` - ${invariant.title} (${invariant.severity})`);
    lines.push(`  ${invariant.description}`);
  }
  lines.push("");
}

function pushChangeMarkdown(lines: string[], changes: ChangeRecord[]): void {
  lines.push("## Recent Changes", "");
  if (!changes.length) {
    lines.push("None.", "");
    return;
  }
  for (const change of changes) {
    lines.push(`- \`${change.id}\` - ${change.title}: ${change.reason}`);
  }
  lines.push("");
}

function pushStringListMarkdown(lines: string[], title: string, values: string[]): void {
  lines.push(`## ${title}`, "");
  if (!values.length) {
    lines.push("None.", "");
    return;
  }
  for (const value of values) lines.push(`- ${value}`);
  lines.push("");
}

function pushDiagnosticsMarkdown(lines: string[], diagnostics: ContextPackDiagnostics): void {
  lines.push("## Why", "");
  lines.push(`Budgeted: ${diagnostics.budgeted ? "yes" : "no"}`);
  lines.push(`Estimated tokens: ${diagnostics.estimatedTokens}`);
  if (diagnostics.maxTokens !== undefined) lines.push(`Max tokens: ${diagnostics.maxTokens}`);
  lines.push("");
  lines.push("### Selected", "");
  if (!diagnostics.selected.length) {
    lines.push("None.", "");
  } else {
    for (const item of diagnostics.selected) {
      lines.push(`- ${item.kind} \`${item.id}\` scored ${item.score}, estimated ${item.estimatedTokens} tokens`);
      lines.push(`  Reasons: ${item.reasons.join("; ")}`);
    }
    lines.push("");
  }
  lines.push("### Excluded Nearby", "");
  if (!diagnostics.excludedNearby.length) {
    lines.push("None.", "");
    return;
  }
  for (const item of diagnostics.excludedNearby) {
    const reason = item.excludedReason ? `, excluded by ${item.excludedReason}` : "";
    lines.push(`- ${item.kind} \`${item.id}\` scored ${item.score}, estimated ${item.estimatedTokens} tokens${reason}`);
    lines.push(`  Reasons: ${item.reasons.join("; ")}`);
  }
  lines.push("");
}

function inlineCodeList(values: string[]): string {
  return values.map(value => `\`${value}\``).join(", ");
}
