import type {
  ChangeRecord,
  Concept,
  ContextPack,
  ContextPackDiagnostics,
  ContextRouteDisagreementDiagnostic,
  ContextSelectionDiagnostic,
  ContextSelectionKind,
  FileSummary,
  Invariant,
  TreeNode
} from "./schema.js";
import { CONTEXT_PACK_LIMITS } from "./contextLimits.js";
import { scorePromptEvidence, type PromptEvidenceResult } from "./promptRouter.js";

const TOKEN_ESTIMATOR: ContextPackDiagnostics["tokenEstimator"] = "approximate-json-chars-div-4";
const EXCLUDED_NEARBY_LIMIT = 8;
const REPRESENTATIVE_FILES_PER_NODE = 3;
const COMPACTED_NODE_REASON = "compacted selected node to preserve representative file under token budget";
const FORCED_FILE_REASON = "forced by selected node ownership to preserve a concrete edit file";
const PRESERVED_EXCLUDED_FILE_REASON = "preserved high-value file by compacting selected nodes under token budget";
const ROUTE_FILE_REASON = "matched route-estimated file evidence";
const ROUTE_NODE_REASON = "matched route-estimated node evidence";
const ROUTE_CONCEPT_REASON = "matched route-estimated concept evidence";
const ROUTE_PRESERVED_FILE_REASON = "preserved route-estimated file by compacting selected nodes under token budget";
const PRESERVED_EXCLUDED_FILE_LIMIT = 6;
const ROUTE_DISAGREEMENT_LIMIT = 8;
const DOCS_BOOK_PROMPT_TERMS = new Set([
  "appendix",
  "appendices",
  "book",
  "books",
  "borrowing",
  "chapter",
  "chapters",
  "docs",
  "documentation",
  "example",
  "examples",
  "listing",
  "listings",
  "ownership",
  "restructure",
  "restructuring",
  "summary"
]);

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
  const promptEvidence = scorePromptEvidence({
    prompt: args.target,
    nodes: args.nodes,
    files: args.files,
    concepts: args.concepts
  });
  const promptFileScores = new Map(promptEvidence.scoredFiles.map(score => [score.id, score.score]));
  const promptNodeScores = new Map(promptEvidence.scoredNodes.map(score => [score.id, score.score]));
  const promptConceptScores = new Map(promptEvidence.scoredConcepts.map(score => [score.id, score.score]));
  const routeEstimatedFileSet = new Set(promptEvidence.estimatedFiles);
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
  const conceptScores = args.concepts
    .map(concept => {
      const scored = scoreConcept(concept, query, queryTokens);
      const routeBoost = evidenceBoost(promptConceptScores.get(concept.id), 10);
      return conceptCandidate(concept, {
        score: scored.score + routeBoost,
        reasons: routeBoost > 0
          ? [...scored.reasons, `${ROUTE_CONCEPT_REASON} (+${routeBoost})`]
          : scored.reasons
      });
    })
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
      const routeBoost = evidenceBoost(promptNodeScores.get(node.id), 12);
      const reasons = [...scored.reasons];
      if (conceptOverlap > 0) reasons.push(`related concept file overlap: ${conceptOverlap} file(s) (+${conceptOverlap * 5})`);
      if (conceptNodeBoost > 0) reasons.push(`related concept references this node (+${conceptNodeBoost})`);
      if (routeBoost > 0) reasons.push(`${ROUTE_NODE_REASON} (+${routeBoost})`);
      return nodeCandidate(node, {
        score: scored.score + conceptOverlap * 5 + conceptNodeBoost + routeBoost,
        reasons
      });
    })
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(nodeName));
  const nodeSelection = selectCandidates(uniqueScoredBy(nodeScores, node => node.id), CONTEXT_PACK_LIMITS.nodes, budget);
  let relevantNodes = nodeSelection.selected.map(scored => scored.item);

  const nodeFileSet = new Set(relevantNodes.flatMap(nodeFiles));
  const fileScores = args.files
    .map(file => {
      const scored = scoreFile(file, query, queryTokens);
      const ownershipBoost = nodeFileSet.has(file.path) ? 8 : 0;
      const conceptBoost = conceptFileSet.has(file.path) ? 8 : 0;
      const routeBoost = evidenceBoost(promptFileScores.get(file.path), 16);
      const reasons = [...scored.reasons];
      if (ownershipBoost > 0) reasons.push(`owned by selected node (+${ownershipBoost})`);
      if (conceptBoost > 0) reasons.push(`referenced by matching concept (+${conceptBoost})`);
      if (routeBoost > 0) reasons.push(`${ROUTE_FILE_REASON} (+${routeBoost})`);
      const relevanceScore = scored.score + ownershipBoost + conceptBoost + routeBoost;
      const fileKind = relevanceScore > 0 ? scoreFileKind(file, queryTokens) : { score: 0, reasons: [] };
      return fileCandidate(file, {
        score: relevanceScore + fileKind.score,
        reasons: [...reasons, ...fileKind.reasons]
      });
    })
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(file => file.path));
  const fileSelection = selectCandidates(uniqueScoredBy(fileScores, file => file.path), CONTEXT_PACK_LIMITS.files, budget);
  preserveRepresentativeSelectedNodeFiles({
    fileSelection,
    nodeSelection,
    budget,
    nodeFileSet,
    queryTokens
  });
  preserveHighValueExcludedFiles({
    fileSelection,
    nodeSelection,
    budget,
    queryTokens
  });
  preserveRouteEvidenceFiles({
    fileSelection,
    nodeSelection,
    budget,
    routeEstimatedFileSet,
    promptFileScores
  });
  relevantNodes = nodeSelection.selected.map(scored => scored.item);
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
  const relevantConcepts = conceptSelection.selected.map(scored => scored.item);

  const invariantSelection = selectCandidates(
    buildInvariantCandidates(args.invariants, query, queryTokens, fileSet, nodeIds),
    Number.POSITIVE_INFINITY,
    budget
  );
  const invariants = invariantSelection.selected.map(scored => scored.item);

  const changeSelection = selectCandidates(
    args.changes.slice(-10).map((change, index) => changeCandidate(change, index)),
    Number.POSITIVE_INFINITY,
    budget
  );

  const selectedDiagnostics: ContextSelectionDiagnostic[] = [];
  const excludedDiagnostics: ContextSelectionDiagnostic[] = [];
  recordDiagnostics(nodeSelection, selectedDiagnostics, excludedDiagnostics);
  recordDiagnostics(fileSelection, selectedDiagnostics, excludedDiagnostics);
  recordDiagnostics(conceptSelection, selectedDiagnostics, excludedDiagnostics);
  recordDiagnostics(invariantSelection, selectedDiagnostics, excludedDiagnostics);
  recordDiagnostics(changeSelection, selectedDiagnostics, excludedDiagnostics);
  const routeDisagreements = routeContextDisagreements(promptEvidence, fileSelection);

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
      excludedNearby: nearbyExcluded(excludedDiagnostics),
      ...(routeDisagreements.length ? { routeDisagreements } : {})
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

function preserveRepresentativeSelectedNodeFiles(input: {
  fileSelection: SelectionResult<FileSummary>;
  nodeSelection: SelectionResult<TreeNode>;
  budget: BudgetState;
  nodeFileSet: Set<string>;
  queryTokens: string[];
}): void {
  if (!input.nodeSelection.selected.length) return;
  if (input.fileSelection.selected.some(candidate => input.nodeFileSet.has(candidate.item.path))) return;
  if (input.fileSelection.selected.length >= CONTEXT_PACK_LIMITS.files) return;

  const selectedFileIds = new Set(input.fileSelection.selected.map(candidate => candidate.id));
  const candidate = [
    ...input.fileSelection.excluded,
    ...input.fileSelection.selected
  ]
    .filter(file => input.nodeFileSet.has(file.item.path) && !selectedFileIds.has(file.id))
    .sort((left, right) => compareRepresentativeFiles(left, right, input.queryTokens))[0];
  if (!candidate) return;

  const forcedCandidate = addCandidateReason(candidate, FORCED_FILE_REASON);
  if (!canFit(forcedCandidate, input.budget)) {
    compactSelectedNodesForFile(input.nodeSelection, input.budget, forcedCandidate);
  }

  if (!canFit(forcedCandidate, input.budget)) {
    addExcludedReason(input.fileSelection, forcedCandidate.id, "owned by selected node but still over token budget after node compaction");
    return;
  }

  input.fileSelection.excluded = input.fileSelection.excluded.filter(file => file.id !== forcedCandidate.id);
  input.fileSelection.selected.push(forcedCandidate);
  input.budget.estimatedTokens += forcedCandidate.estimatedTokens;
}

function preserveHighValueExcludedFiles(input: {
  fileSelection: SelectionResult<FileSummary>;
  nodeSelection: SelectionResult<TreeNode>;
  budget: BudgetState;
  queryTokens: string[];
}): void {
  if (input.budget.maxTokens === undefined) return;
  const selectedFileIds = new Set(input.fileSelection.selected.map(candidate => candidate.id));
  let preserved = 0;
  const candidates = input.fileSelection.excluded
    .filter(candidate => candidate.excludedReason === "token-budget")
    .filter(candidate => isHighValueFallbackFile(candidate.item, candidate.score, input.queryTokens))
    .sort((left, right) => compareFallbackFiles(left, right, input.queryTokens));

  for (const candidate of candidates) {
    if (preserved >= PRESERVED_EXCLUDED_FILE_LIMIT) return;
    if (input.fileSelection.selected.length >= CONTEXT_PACK_LIMITS.files) return;
    if (selectedFileIds.has(candidate.id)) continue;

    const forcedCandidate = addCandidateReason(candidate, PRESERVED_EXCLUDED_FILE_REASON);
    if (!canFit(forcedCandidate, input.budget)) {
      compactSelectedNodesForFile(input.nodeSelection, input.budget, forcedCandidate);
    }
    if (!canFit(forcedCandidate, input.budget)) continue;

    input.fileSelection.excluded = input.fileSelection.excluded.filter(file => file.id !== forcedCandidate.id);
    input.fileSelection.selected.push(forcedCandidate);
    selectedFileIds.add(forcedCandidate.id);
    input.budget.estimatedTokens += forcedCandidate.estimatedTokens;
    preserved += 1;
  }
}

function preserveRouteEvidenceFiles(input: {
  fileSelection: SelectionResult<FileSummary>;
  nodeSelection: SelectionResult<TreeNode>;
  budget: BudgetState;
  routeEstimatedFileSet: Set<string>;
  promptFileScores: Map<string, number>;
}): void {
  const selectedFileIds = new Set(input.fileSelection.selected.map(candidate => candidate.id));
  const candidates = input.fileSelection.excluded
    .filter(candidate => candidate.excludedReason === "token-budget")
    .filter(candidate => input.routeEstimatedFileSet.has(candidate.id))
    .sort((left, right) =>
      (input.promptFileScores.get(right.id) ?? 0) - (input.promptFileScores.get(left.id) ?? 0) ||
      right.score - left.score ||
      left.item.path.localeCompare(right.item.path)
    );

  for (const candidate of candidates) {
    if (input.fileSelection.selected.length >= CONTEXT_PACK_LIMITS.files) return;
    if (selectedFileIds.has(candidate.id)) continue;

    const forcedCandidate = addCandidateReason(candidate, ROUTE_PRESERVED_FILE_REASON);
    if (!canFit(forcedCandidate, input.budget)) {
      compactSelectedNodesForFile(input.nodeSelection, input.budget, forcedCandidate);
    }
    if (!canFit(forcedCandidate, input.budget)) {
      addExcludedReason(input.fileSelection, forcedCandidate.id, "route-estimated file but still over token budget after node compaction");
      continue;
    }

    input.fileSelection.excluded = input.fileSelection.excluded.filter(file => file.id !== forcedCandidate.id);
    input.fileSelection.selected.push(forcedCandidate);
    selectedFileIds.add(forcedCandidate.id);
    input.budget.estimatedTokens += forcedCandidate.estimatedTokens;
  }
}

function routeContextDisagreements(
  evidence: PromptEvidenceResult,
  fileSelection: SelectionResult<FileSummary>
): ContextRouteDisagreementDiagnostic[] {
  const selected = new Set(fileSelection.selected.map(candidate => candidate.id));
  const excluded = new Map(fileSelection.excluded.map(candidate => [candidate.id, candidate]));
  const scores = new Map(evidence.scoredFiles.map(candidate => [candidate.id, candidate.score]));

  return evidence.estimatedFiles
    .filter(filePath => !selected.has(filePath))
    .map(filePath => {
      const excludedCandidate = excluded.get(filePath);
      return {
        filePath,
        routeScore: scores.get(filePath) ?? 0,
        contextStatus: excludedCandidate ? "excluded" as const : "missing" as const,
        reason: excludedCandidate
          ? `Route-estimated file was excluded by ${excludedCandidate.excludedReason ?? "context selection"}.`
          : "Route-estimated file was not present in context file candidates.",
        ...(excludedCandidate?.excludedReason ? { excludedReason: excludedCandidate.excludedReason } : {})
      };
    })
    .slice(0, ROUTE_DISAGREEMENT_LIMIT);
}

function compactSelectedNodesForFile(
  selection: SelectionResult<TreeNode>,
  budget: BudgetState,
  fileCandidate: ScoredCandidate<FileSummary>
): void {
  if (budget.maxTokens === undefined) return;
  const order = selection.selected
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftOwns = nodeFiles(left.candidate.item).includes(fileCandidate.item.path);
      const rightOwns = nodeFiles(right.candidate.item).includes(fileCandidate.item.path);
      if (leftOwns !== rightOwns) return leftOwns ? -1 : 1;
      return right.candidate.estimatedTokens - left.candidate.estimatedTokens || left.index - right.index;
    });

  for (const { candidate, index } of order) {
    if (canFit(fileCandidate, budget)) return;
    const compacted = compactNodeCandidate(candidate, fileCandidate.item.path);
    if (compacted.estimatedTokens >= candidate.estimatedTokens) continue;
    selection.selected[index] = compacted;
    budget.estimatedTokens -= candidate.estimatedTokens - compacted.estimatedTokens;
  }
}

function compactNodeCandidate(candidate: ScoredCandidate<TreeNode>, representativeFile: string): ScoredCandidate<TreeNode> {
  const compactedNode = compactNode(candidate.item, representativeFile);
  const estimatedTokens = estimateTokens(compactedNode);
  return {
    ...candidate,
    item: compactedNode,
    estimatedTokens,
    reasons: uniqueStableStrings([...candidate.reasons, COMPACTED_NODE_REASON])
  };
}

function compareFallbackFiles(
  left: ScoredCandidate<FileSummary>,
  right: ScoredCandidate<FileSummary>,
  queryTokens: string[]
): number {
  const leftRank = fallbackFileRank(left.item, queryTokens);
  const rightRank = fallbackFileRank(right.item, queryTokens);
  if (rightRank !== leftRank) return rightRank - leftRank;
  if (right.score !== left.score) return right.score - left.score;
  return left.item.path.localeCompare(right.item.path);
}

function fallbackFileRank(file: FileSummary, queryTokens: string[]): number {
  const path = normalizeRepoPath(file.path).toLowerCase();
  return (isImplementationPath(path) ? 8 : 0) +
    (isReadmePath(path) ? 7 : 0) +
    (isTestFile(file) ? 5 : 0) +
    (isDocsPath(path) ? 3 : 0) +
    docsBookPathRank(path, queryTokens) +
    queryTokens.filter(token => token.length > 3 && path.includes(token)).length * 2;
}

function isHighValueFallbackFile(file: FileSummary, score: number, queryTokens: string[]): boolean {
  const path = normalizeRepoPath(file.path).toLowerCase();
  if (isOperationalMetadataPath(path) && !mentionsOperationalMetadata(queryTokens)) return false;
  if (isReadmePath(path)) return score >= 12;
  if (score < 20) return false;
  return isImplementationPath(path) || isTestFile(file) || isReadmePath(path);
}

function compactNode(node: TreeNode, representativeFile: string): TreeNode {
  const representativeFiles = representativeNodeFiles(node, representativeFile);
  return {
    ...node,
    explanation: undefined,
    reasonForExistence: undefined,
    separationLogic: undefined,
    children: node.children.slice(0, 6),
    sourceFiles: keepRepresentativeFiles(node.sourceFiles, representativeFiles),
    ownedFiles: keepRepresentativeFiles(node.ownedFiles, representativeFiles),
    responsibilities: node.responsibilities.slice(0, 2),
    dependencies: node.dependencies.slice(0, 4),
    dependsOn: node.dependsOn.slice(0, 4),
    changeLog: node.changeLog.slice(-2),
    invariants: node.invariants.slice(0, 4),
    changePolicy: {
      allowedToChange: keepRepresentativeFiles(node.changePolicy.allowedToChange, representativeFiles),
      mustNotChange: node.changePolicy.mustNotChange.slice(0, 4)
    }
  };
}

function representativeNodeFiles(node: TreeNode, representativeFile: string): string[] {
  return uniqueStableStrings([
    representativeFile,
    ...nodeFiles(node).filter(file => file !== representativeFile).slice(0, REPRESENTATIVE_FILES_PER_NODE - 1)
  ]);
}

function keepRepresentativeFiles(files: string[], representativeFiles: string[]): string[] {
  const keep = new Set(representativeFiles);
  const kept = files.filter(file => keep.has(file));
  return kept.length ? kept : files.slice(0, REPRESENTATIVE_FILES_PER_NODE);
}

function compareRepresentativeFiles(
  left: ScoredCandidate<FileSummary>,
  right: ScoredCandidate<FileSummary>,
  queryTokens: string[]
): number {
  const leftRank = representativeFileRank(left.item, queryTokens);
  const rightRank = representativeFileRank(right.item, queryTokens);
  if (rightRank !== leftRank) return rightRank - leftRank;
  if (right.score !== left.score) return right.score - left.score;
  return left.item.path.localeCompare(right.item.path);
}

function representativeFileRank(file: FileSummary, queryTokens: string[]): number {
  const path = normalizeRepoPath(file.path).toLowerCase();
  const pathTokens = new Set(tokenize(path));
  const exactMatches = queryTokens.filter(token => pathTokens.has(token)).length;
  const fragmentMatches = queryTokens.filter(token => token.length > 3 && path.includes(token)).length;
  return exactMatches * 8 +
    fragmentMatches * 3 +
    (isImplementationPath(path) ? 8 : 0) +
    (isTestFile(file) ? 6 : 0) +
    (isDocsPath(path) ? 3 : 0) -
    (isOperationalMetadataPath(path) && !mentionsOperationalMetadata(queryTokens) ? 12 : 0) +
    docsBookPathRank(path, queryTokens);
}

function scoreFileKind(file: FileSummary, queryTokens: string[]): ScoreResult {
  const path = normalizeRepoPath(file.path).toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  const operational = isOperationalMetadataPath(path);
  const operationalPrompt = mentionsOperationalMetadata(queryTokens);
  if (isImplementationPath(path)) {
    score += 12;
    reasons.push("source implementation file (+12)");
  }
  if (isTestFile(file)) {
    score += 8;
    reasons.push("test file (+8)");
  }
  if (isDocsPath(path)) {
    const boost = queryTokens.some(token => ["doc", "docs", "documentation", "readme"].includes(token)) ? 3 : 1;
    score += boost;
    reasons.push(`documentation file (+${boost})`);
  }
  const docsBookScore = scoreDocsBookFileKind(path, queryTokens);
  score += docsBookScore.score;
  reasons.push(...docsBookScore.reasons);
  if (operational && operationalPrompt) {
    score += 4;
    reasons.push("package/CI/dependency metadata requested by prompt (+4)");
  } else if (operational) {
    score -= 6;
    reasons.push("package/CI/dependency metadata deprioritized without matching prompt (-6)");
  }
  return { score, reasons };
}

function scoreDocsBookFileKind(filePath: string, queryTokens: string[]): ScoreResult {
  const path = normalizeRepoPath(filePath).toLowerCase();
  const pathTokenSet = new Set(tokenize(path));
  const exactPathMatches = queryTokens.filter(token => token.length > 3 && pathTokenSet.has(token)).length;
  const fragmentPathMatches = queryTokens.filter(token => token.length > 3 && path.includes(token)).length;
  const docsBookPrompt = mentionsDocsBookSurface(queryTokens);
  const reasons: string[] = [];
  let score = 0;

  if (isDocsBookSummaryPath(path) && (docsBookPrompt || exactPathMatches > 0 || fragmentPathMatches > 0)) {
    score += 10;
    reasons.push("documentation book summary/navigation file (+10)");
  }

  if (isDocsBookChapterPath(path) && (docsBookPrompt || exactPathMatches > 0 || fragmentPathMatches > 0)) {
    const boost = 8 + Math.min(6, exactPathMatches * 3 + fragmentPathMatches);
    score += boost;
    reasons.push(`documentation book chapter file (+${boost})`);
  }

  if (isDocsBookListingPath(path) && (docsBookPrompt || exactPathMatches > 0 || fragmentPathMatches > 0)) {
    const boost = 8 + Math.min(4, exactPathMatches * 2 + fragmentPathMatches);
    score += boost;
    reasons.push(`documentation book listing/example file (+${boost})`);
  }

  if (isDocsBookBuildConfigPath(path) && queryTokens.some(token => ["book", "build", "chapter", "docs", "documentation", "publish", "publishing", "restructure", "restructuring", "summary"].includes(token))) {
    score += 5;
    reasons.push("documentation book build/config file (+5)");
  }

  return { score, reasons };
}

function docsBookPathRank(filePath: string, queryTokens: string[]): number {
  const path = normalizeRepoPath(filePath).toLowerCase();
  if (!mentionsDocsBookSurface(queryTokens)) return 0;
  return (isDocsBookSummaryPath(path) ? 9 : 0) +
    (isDocsBookChapterPath(path) ? 8 : 0) +
    (isDocsBookListingPath(path) ? 8 : 0) +
    (isDocsBookBuildConfigPath(path) ? 4 : 0);
}

function canFit(candidate: ScoredCandidate<unknown>, budget: BudgetState): boolean {
  return budget.maxTokens === undefined || budget.estimatedTokens + candidate.estimatedTokens <= budget.maxTokens;
}

function evidenceBoost(score: number | undefined, cap: number): number {
  if (!score || score <= 0) return 0;
  return Math.min(cap, Math.max(4, score));
}

function addCandidateReason<T>(candidate: ScoredCandidate<T>, reason: string): ScoredCandidate<T> {
  return {
    ...candidate,
    reasons: uniqueStableStrings([...candidate.reasons, reason])
  };
}

function addExcludedReason<T>(selection: SelectionResult<T>, id: string, reason: string): void {
  selection.excluded = selection.excluded.map(candidate =>
    candidate.id === id ? addCandidateReason(candidate, reason) : candidate
  );
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
    scoreText("node reason for existence", node.reasonForExistence, query, queryTokens, 2),
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

function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isImplementationPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  if (isDocsPath(path) || isTestPath(path) || isOperationalMetadataPath(path)) return false;
  return /\.(c|cc|cpp|cs|go|java|js|jsx|kt|mjs|py|rs|swift|ts|tsx)$/u.test(path) ||
    path.startsWith("src/") ||
    path.includes("/src/") ||
    path.includes("/lib/") ||
    path.includes("/app/") ||
    path.includes("/backend/") ||
    path.includes("/frontend/");
}

function isTestFile(file: FileSummary): boolean {
  return file.isTest || isTestPath(file.path);
}

function isTestPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  return path.includes(".test.") ||
    path.includes(".spec.") ||
    path.startsWith("test/") ||
    path.startsWith("tests/") ||
    path.includes("/test/") ||
    path.includes("/tests/");
}

function isDocsPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  return path.endsWith(".md") ||
    path.endsWith(".mdx") ||
    path.endsWith(".rst") ||
    path.startsWith("docs/") ||
    path.startsWith("doc/") ||
    path.includes("/docs/") ||
    path.includes("/doc/");
}

function isReadmePath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  return path === "readme.md" || path.endsWith("/readme.md");
}

function mentionsDocsBookSurface(queryTokens: string[]): boolean {
  return queryTokens.some(token => DOCS_BOOK_PROMPT_TERMS.has(token));
}

function isDocsBookSummaryPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  return path.endsWith("/summary.md") || path === "summary.md";
}

function isDocsBookChapterPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  if (!/\.(md|mdx|rst)$/u.test(path) || isDocsBookSummaryPath(path) || isReadmePath(path)) return false;
  const basename = path.split("/").at(-1) ?? path;
  return path.startsWith("src/") ||
    path.includes("/src/") ||
    /^(ch|chapter)[0-9][0-9a-z-]*\.(md|mdx|rst)$/u.test(basename) ||
    /^(appendix|appendices|foreword|preface|title-page)[0-9a-z-]*\.(md|mdx|rst)$/u.test(basename);
}

function isDocsBookListingPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  return path.startsWith("listings/") || path.includes("/listings/");
}

function isDocsBookBuildConfigPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  const name = path.split("/").at(-1) ?? path;
  return name === "book.toml" || name === "mdbook.yml" || name === "mdbook.yaml";
}

function isOperationalMetadataPath(filePath: string): boolean {
  const path = normalizeRepoPath(filePath).toLowerCase();
  const name = path.split("/").at(-1) ?? path;
  return path.startsWith(".github/") ||
    path.includes("/.github/") ||
    path.startsWith(".gitlab/") ||
    path.includes("/.gitlab/") ||
    path.includes("dependabot") ||
    path.includes("renovate") ||
    path.includes("workflows/") ||
    [
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "cargo.toml",
      "cargo.lock",
      "pyproject.toml",
      "poetry.lock",
      "requirements.txt",
      "go.mod",
      "go.sum"
    ].includes(name);
}

function mentionsOperationalMetadata(queryTokens: string[]): boolean {
  return queryTokens.some(token => [
    "automation",
    "build",
    "cargo",
    "ci",
    "dependency",
    "dependencies",
    "deploy",
    "deployment",
    "github",
    "lockfile",
    "npm",
    "package",
    "packages",
    "pnpm",
    "release",
    "workflow",
    "workflows",
    "yarn"
  ].includes(token));
}

function uniqueStableStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
    if (node.reasonForExistence?.trim()) {
      lines.push(`  Reason for existence: ${node.reasonForExistence.trim()}`);
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
  } else {
    for (const item of diagnostics.excludedNearby) {
      const reason = item.excludedReason ? `, excluded by ${item.excludedReason}` : "";
      lines.push(`- ${item.kind} \`${item.id}\` scored ${item.score}, estimated ${item.estimatedTokens} tokens${reason}`);
      lines.push(`  Reasons: ${item.reasons.join("; ")}`);
    }
    lines.push("");
  }
  if (diagnostics.routeDisagreements?.length) {
    lines.push("### Route/Context Disagreement", "");
    for (const item of diagnostics.routeDisagreements) {
      const reason = item.excludedReason ? `, excluded by ${item.excludedReason}` : "";
      lines.push(`- file \`${item.filePath}\` route score ${item.routeScore}, context status ${item.contextStatus}${reason}`);
      lines.push(`  Reason: ${item.reason}`);
    }
    lines.push("");
  }
}

function inlineCodeList(values: string[]): string {
  return values.map(value => `\`${value}\``).join(", ");
}
