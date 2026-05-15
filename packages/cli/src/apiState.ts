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
  type AtreeConfig,
  type CoherenceFindingView,
  type CoherenceReviewView,
  type Concept,
  type ContextPackView,
  type GoalWorkspaceView,
  type Invariant,
  type MissionPlanItemView,
  type MissionPlanStageView,
  type ScopeReviewView,
  type ScopeSelectionItem,
  type WorkflowArtifactPolicy,
  type ValidationIssue,
  type WorkflowReference,
  type WorkflowViewState,
  validateApiStateSchema
} from "@abstraction-tree/core";
import { latestScopeSummary } from "./scopeCommand.js";

export type ApiState = AbstractionTreeState;
export type AgentHealthLoader = (root: string) => Promise<AgentHealth>;
export type ValidationIssuesLoader = (root: string) => Promise<ValidationIssue[]>;

export async function loadApiState(
  root: string,
  loadAgentHealth: AgentHealthLoader = loadApiAgentHealth,
  artifactPolicy?: WorkflowArtifactPolicy
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
  const workflow = await loadWorkflowViewState(root, { concepts, invariants }, artifactPolicy ?? apiArtifactPolicy(config));

  const state: ApiState = {
    config,
    ontology,
    nodes,
    files,
    importGraph,
    concepts,
    invariants,
    changes,
    agentHealth,
    workflow
  };
  assertRuntimeSchema(validateApiStateSchema(state));
  return state;
}

export async function loadWorkflowViewState(
  root: string,
  memory: { concepts?: Concept[]; invariants?: Invariant[] } = {},
  artifacts: WorkflowArtifactPolicy = apiArtifactPolicy()
): Promise<WorkflowViewState> {
  const contextPacks = await loadContextPackViews(root);
  const goalBundles = await loadGoalWorkspaceBundles(root, contextPacks, memory);
  const goalScopeIds = new Set(goalBundles.flatMap(bundle => bundle.scopeReview ? [bundle.scopeReview.id] : []));
  const standaloneScopes = await loadStandaloneScopeReviews(root);

  return {
    goalWorkspaces: goalBundles.map(bundle => bundle.goal),
    scopeReviews: [
      ...goalBundles.flatMap(bundle => bundle.scopeReview ? [bundle.scopeReview] : []),
      ...standaloneScopes.filter(scope => !goalScopeIds.has(scope.id))
    ],
    coherenceReviews: goalBundles.flatMap(bundle => bundle.coherenceReview ? [bundle.coherenceReview] : []),
    contextPacks,
    artifacts
  };
}

export interface ApiArtifact {
  path: string;
  contentType: string;
  text: string;
}

export interface ApiArtifactOptions {
  enabled?: boolean;
  config?: Pick<AtreeConfig, "visualApp">;
}

export function apiArtifactPolicy(
  config?: Pick<AtreeConfig, "visualApp">,
  enabled = true
): WorkflowArtifactPolicy {
  return {
    enabled: enabled && isApiArtifactServingEnabled(config),
    root: ".abstraction-tree",
    textOnly: true,
    redacted: true
  };
}

export function isApiArtifactServingEnabled(config?: Pick<AtreeConfig, "visualApp">): boolean {
  return config?.visualApp?.artifacts?.enabled !== false;
}

export async function loadApiArtifact(root: string, requestedPath: string, options: ApiArtifactOptions = {}): Promise<ApiArtifact | undefined> {
  if (options.enabled === false) return undefined;
  if (!await loadArtifactServingEnabled(root, options.config)) return undefined;

  const normalized = normalizeArtifactPath(requestedPath);
  if (!normalized) return undefined;

  const absolutePath = path.resolve(root, normalized);
  const atreeRoot = path.resolve(atreePath(root));
  if (absolutePath !== atreeRoot && !absolutePath.startsWith(`${atreeRoot}${path.sep}`)) return undefined;
  if (!existsSync(absolutePath)) return undefined;

  const raw = await readFile(absolutePath, "utf8").catch(() => undefined);
  if (raw === undefined) return undefined;
  const text = redactSecrets(raw);
  const maxLength = 80_000;
  return {
    path: normalized,
    contentType: normalized.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    text: text.length > maxLength ? `${text.slice(0, maxLength)}\n\n[artifact truncated for visual app display]\n` : text
  };
}

async function loadArtifactServingEnabled(root: string, config?: Pick<AtreeConfig, "visualApp">): Promise<boolean> {
  if (config) return isApiArtifactServingEnabled(config);
  return isApiArtifactServingEnabled(await readConfig(root));
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

interface GoalWorkspaceBundle {
  goal: GoalWorkspaceView;
  scopeReview?: ScopeReviewView;
  coherenceReview?: CoherenceReviewView;
}

async function loadContextPackViews(root: string): Promise<ContextPackView[]> {
  const dir = atreePath(root, "context-packs");
  const names = await jsonFileNames(dir);
  const views = await Promise.all(names.map(async name => {
    const record = await readOptionalJsonRecord(path.join(dir, name));
    if (!record) return undefined;
    const diagnostics = objectRecord(record.diagnostics);
    return {
      id: stringField(record, "id") ?? path.basename(name, ".json"),
      target: redactText(stringField(record, "target") ?? "Unknown target", 220),
      file: `.abstraction-tree/context-packs/${name}`,
      createdAt: stringField(record, "createdAt"),
      stats: {
        nodes: arrayField(record, "relevantNodes").length,
        files: arrayField(record, "relevantFiles").length,
        concepts: arrayField(record, "relevantConcepts").length,
        invariants: arrayField(record, "invariants").length,
        changes: arrayField(record, "recentChanges").length,
        selectedDiagnostics: diagnostics ? arrayField(diagnostics, "selected").length : undefined,
        excludedDiagnostics: diagnostics ? arrayField(diagnostics, "excludedNearby").length : undefined,
        estimatedTokens: numberField(diagnostics, "estimatedTokens")
      }
    } satisfies ContextPackView;
  }));

  return views
    .filter(isDefined)
    .sort((left, right) => sortNewest(left.createdAt, right.createdAt));
}

async function loadGoalWorkspaceBundles(
  root: string,
  contextPacks: ContextPackView[],
  memory: { concepts?: Concept[]; invariants?: Invariant[] }
): Promise<GoalWorkspaceBundle[]> {
  const goalsDir = atreePath(root, "goals");
  const workspaceNames = (await directoryNames(goalsDir)).sort().reverse();
  const bundles = await Promise.all(workspaceNames.map(name => loadGoalWorkspaceBundle(root, name, contextPacks, memory)));
  return bundles.filter(isDefined);
}

async function loadGoalWorkspaceBundle(
  root: string,
  name: string,
  contextPacks: ContextPackView[],
  memory: { concepts?: Concept[]; invariants?: Invariant[] }
): Promise<GoalWorkspaceBundle | undefined> {
  const workspaceRelativePath = `.abstraction-tree/goals/${name}`;
  const workspacePath = path.join(root, workspaceRelativePath);
  const metadata = await readOptionalJsonRecord(path.join(workspacePath, "goal.json")) ?? {};
  const missionPlan = await readOptionalJsonRecord(path.join(workspacePath, "mission-plan.json")) ?? {};
  const affectedTree = await readOptionalJsonRecord(path.join(workspacePath, "affected-tree.json")) ?? {};
  const scopeContract = await readOptionalJsonRecord(path.join(workspacePath, "scope-contract.json"));
  const checks = await readOptionalJsonRecord(path.join(workspacePath, "checks.json"));
  const score = await readOptionalJsonRecord(path.join(workspacePath, "goal-score.json"));
  const goalText = await readOptionalText(path.join(workspacePath, "goal.md"));
  const coherenceText = await readOptionalText(path.join(workspacePath, "coherence-review.md"));
  const finalReportText = await readOptionalText(path.join(workspacePath, "final-report.md"));
  const id = stringField(metadata, "id") ?? stringField(missionPlan, "goal_id") ?? name;
  const title = goalTitle(goalText, id);
  const status = stringField(metadata, "status") ?? stringField(score, "status") ?? "unknown";
  const missionDirPath = stringField(missionPlan, "mission_dir") ?? `${workspaceRelativePath}/missions`;
  const missionFiles = await missionFileRefs(root, missionDirPath);
  const missions = missionPlanItems(missionPlan, missionFiles);
  const matchedContextPacks = contextPackRefs(matchingContextPacks(contextPacks, id, title, name));
  const reports = workspaceReports(root, workspaceRelativePath);
  const scopeReview = scopeContract
    ? buildScopeReviewView({
      file: `${workspaceRelativePath}/scope-contract.json`,
      workspaceId: id,
      contract: scopeContract,
      affectedTree,
      memory,
      evidence: [
        ref("Scope contract", `${workspaceRelativePath}/scope-contract.json`, "scope", stringField(scopeContract, "id")),
        ref("Affected tree", `${workspaceRelativePath}/affected-tree.json`, "json"),
        ...(checks ? [ref("Goal checks", `${workspaceRelativePath}/checks.json`, "json")] : [])
      ]
    })
    : undefined;
  const coherenceReview = coherenceText
    ? buildCoherenceReviewView({
      file: `${workspaceRelativePath}/coherence-review.md`,
      workspaceId: id,
      markdown: coherenceText,
      finalReportMarkdown: finalReportText,
      statusFallback: status,
      evidence: [
        ref("Coherence review", `${workspaceRelativePath}/coherence-review.md`, "markdown"),
        ...(finalReportText ? [ref("Final report", `${workspaceRelativePath}/final-report.md`, "markdown")] : []),
        ...(scopeContract ? [ref("Scope contract", `${workspaceRelativePath}/scope-contract.json`, "scope")] : []),
        ...(score ? [ref("Goal score", `${workspaceRelativePath}/goal-score.json`, "json")] : [])
      ]
    })
    : undefined;

  return {
    goal: {
      id,
      title,
      status,
      mode: stringField(metadata, "mode"),
      createdAt: stringField(metadata, "created_at") ?? stringField(missionPlan, "created_at"),
      workspacePath: workspaceRelativePath,
      goalPath: stringField(metadata, "goal_file") || `${workspaceRelativePath}/goal.md`,
      missionDirPath,
      summary: summarizeText(goalText ?? title, 260),
      stats: goalStats(status, affectedTree, scopeContract, checks, coherenceText, missions),
      reports,
      missionStages: missionStages({
        workspaceRelativePath,
        missionDirPath,
        status,
        missionPlan,
        affectedTree,
        scopeContract,
        checks,
        coherenceText,
        finalReportText,
        missions,
        contextPacks: matchedContextPacks
      }),
      missions,
      scopeReviewId: scopeReview?.id,
      coherenceReviewId: coherenceReview?.id,
      score: numberField(score, "score")
    },
    scopeReview,
    coherenceReview
  };
}

async function loadStandaloneScopeReviews(root: string): Promise<ScopeReviewView[]> {
  const dir = atreePath(root, "scopes");
  const names = (await jsonFileNames(dir)).filter(name => name.endsWith("-scope.json"));
  const reviews = await Promise.all(names.map(async name => {
    const contract = await readOptionalJsonRecord(path.join(dir, name));
    if (!contract) return undefined;
    const id = stringField(contract, "id") ?? path.basename(name, ".json");
    const report = await readOptionalJsonRecord(path.join(dir, `${id}-check.json`));
    return buildScopeReviewView({
      file: `.abstraction-tree/scopes/${name}`,
      contract,
      report,
      evidence: [
        ref("Scope contract", `.abstraction-tree/scopes/${name}`, "scope", id),
        ...(report ? [ref("Scope check", `.abstraction-tree/scopes/${id}-check.json`, "json", `${id}-check`)] : [])
      ]
    });
  }));
  return reviews.filter(isDefined).sort((left, right) => sortNewest(left.checkedAt ?? left.createdAt, right.checkedAt ?? right.createdAt));
}

function workspaceReports(root: string, workspaceRelativePath: string): WorkflowReference[] {
  const definitions: Array<{ label: string; name: string; kind: WorkflowReference["kind"] }> = [
    { label: "Original goal", name: "goal.md", kind: "goal" },
    { label: "Goal metadata", name: "goal.json", kind: "json" },
    { label: "Route report", name: "route.md", kind: "markdown" },
    { label: "Route JSON", name: "route.json", kind: "json" },
    { label: "Goal assessment", name: "goal-assessment.md", kind: "markdown" },
    { label: "Affected tree", name: "affected-tree.json", kind: "json" },
    { label: "Mission plan", name: "mission-plan.json", kind: "json" },
    { label: "Scope contract", name: "scope-contract.json", kind: "scope" },
    { label: "Scope contract report", name: "scope-contract.md", kind: "markdown" },
    { label: "Checks", name: "checks.json", kind: "json" },
    { label: "Checks report", name: "checks.md", kind: "markdown" },
    { label: "Coherence review", name: "coherence-review.md", kind: "markdown" },
    { label: "Final report", name: "final-report.md", kind: "markdown" },
    { label: "Draft PR body", name: "pr-body.md", kind: "markdown" },
    { label: "Goal score", name: "goal-score.json", kind: "json" }
  ];
  return definitions
    .filter(definition => existsSync(path.join(root, workspaceRelativePath, definition.name)))
    .map(definition => ref(definition.label, `${workspaceRelativePath}/${definition.name}`, definition.kind));
}

async function missionFileRefs(root: string, missionDirPath: string): Promise<WorkflowReference[]> {
  const dir = path.join(root, missionDirPath);
  const names = await markdownFileNames(dir);
  return names.map(name => ref(name, `${missionDirPath}/${name}`, "mission"));
}

function missionPlanItems(missionPlan: Record<string, unknown>, missionFiles: WorkflowReference[]): MissionPlanItemView[] {
  return recordArray(missionPlan.missions).map((mission, index) => ({
    id: stringField(mission, "id") ?? `mission-${index + 1}`,
    title: redactText(stringField(mission, "title") ?? `Mission ${index + 1}`, 180),
    priority: stringField(mission, "priority"),
    risk: stringField(mission, "risk"),
    dependsOn: stringArrayField(mission, "depends_on"),
    affectedAreas: stringArrayField(mission, "expected_affected_areas"),
    successChecks: stringArrayField(mission, "success_checks").map(command => redactText(command, 180)),
    evidence: missionFiles[index] ? [missionFiles[index]] : []
  }));
}

function missionStages(input: {
  workspaceRelativePath: string;
  missionDirPath: string;
  status: string;
  missionPlan: Record<string, unknown>;
  affectedTree: Record<string, unknown>;
  scopeContract?: Record<string, unknown>;
  checks?: Record<string, unknown>;
  coherenceText?: string;
  finalReportText?: string;
  missions: MissionPlanItemView[];
  contextPacks: WorkflowReference[];
}): MissionPlanStageView[] {
  const checkStatus = stringField(input.checks, "status");
  return [{
    id: "analysis",
    title: "Analysis",
    status: recordArray(input.affectedTree.affected_files).length || recordArray(input.affectedTree.affected_nodes).length ? "complete" : "pending",
    summary: `${recordArray(input.affectedTree.affected_nodes).length} node(s), ${recordArray(input.affectedTree.affected_files).length} file(s), and ${recordArray(input.affectedTree.affected_concepts).length} concept(s) selected.`,
    actions: [
      "Goal assessment written.",
      "Affected tree map generated.",
      ...(input.scopeContract ? [`Scope intent: ${redactText(stringField(input.scopeContract, "intent") ?? stringField(input.scopeContract, "prompt") ?? "unknown", 160)}`] : [])
    ],
    contextPacks: input.contextPacks,
    evidence: [
      ref("Goal assessment", `${input.workspaceRelativePath}/goal-assessment.md`, "markdown"),
      ref("Affected tree", `${input.workspaceRelativePath}/affected-tree.json`, "json")
    ]
  }, {
    id: "planning",
    title: "Planning",
    status: input.missions.length ? "complete" : "pending",
    summary: `${input.missions.length} mission task(s) planned in ${input.missionDirPath}.`,
    actions: input.missions.map(mission => `${mission.id}: ${mission.title}`),
    contextPacks: input.contextPacks,
    evidence: [
      ref("Mission plan", `${input.workspaceRelativePath}/mission-plan.json`, "json"),
      ref("Mission folder", input.missionDirPath, "mission")
    ]
  }, {
    id: "execution",
    title: "Execution",
    status: executionStageStatus(input.status, checkStatus),
    summary: executionStageSummary(input.status, checkStatus),
    actions: recordArray(input.checks?.commands).map(command =>
      `${stringField(command, "status") ?? "unknown"}: ${redactText(stringField(command, "command") ?? "unknown command", 180)}`
    ),
    contextPacks: [],
    evidence: input.checks ? [ref("Checks", `${input.workspaceRelativePath}/checks.json`, "json")] : []
  }, {
    id: "review",
    title: "Review",
    status: reviewStageStatus(input.status, input.coherenceText, input.finalReportText),
    summary: input.coherenceText ? coherenceSummary(input.coherenceText) : "Coherence review has not been written.",
    actions: [
      ...(input.scopeContract ? [`Scope contract status: ${stringField(input.scopeContract, "status") ?? "unknown"}`] : []),
      ...(input.coherenceText ? ["Coherence review written."] : []),
      ...(input.finalReportText ? ["Final report written."] : [])
    ],
    contextPacks: [],
    evidence: [
      ...(input.scopeContract ? [ref("Scope contract", `${input.workspaceRelativePath}/scope-contract.json`, "scope")] : []),
      ...(input.coherenceText ? [ref("Coherence review", `${input.workspaceRelativePath}/coherence-review.md`, "markdown")] : []),
      ...(input.finalReportText ? [ref("Final report", `${input.workspaceRelativePath}/final-report.md`, "markdown")] : [])
    ]
  }];
}

function buildScopeReviewView(input: {
  file: string;
  contract: Record<string, unknown>;
  report?: Record<string, unknown>;
  affectedTree?: Record<string, unknown>;
  workspaceId?: string;
  memory?: { concepts?: Concept[]; invariants?: Invariant[] };
  evidence: WorkflowReference[];
}): ScopeReviewView {
  const id = stringField(input.contract, "id") ?? path.basename(input.file, ".json");
  const selections = scopeSelections(input.contract, input.report, input.affectedTree, input.memory);
  const violations = scopeViolations(input.report);
  const allSelections = uniqueSelections([...selections, ...violations]).slice(0, 120);
  const status = stringField(input.report, "status") ?? stringField(input.contract, "status") ?? "unknown";

  return {
    id,
    status,
    file: input.file,
    prompt: redactOptional(stringField(input.contract, "prompt"), 220),
    createdAt: stringField(input.contract, "createdAt"),
    checkedAt: stringField(input.report, "checkedAt"),
    workspaceId: input.workspaceId,
    summary: scopeSummary(input.contract, input.report),
    stats: {
      selectedCount: allSelections.filter(item => item.status === "selected").length,
      excludedCount: allSelections.filter(item => item.status === "excluded").length,
      questionableCount: allSelections.filter(item => item.status === "questionable").length,
      violationCount: violations.length,
      affectedNodeCount: stringArrayField(input.contract, "affectedNodeIds").length,
      allowedFileCount: stringArrayField(input.contract, "allowedFiles").length
    },
    selections: allSelections,
    violations,
    evidence: input.evidence
  };
}

function buildCoherenceReviewView(input: {
  file: string;
  markdown: string;
  finalReportMarkdown?: string;
  statusFallback: string;
  workspaceId: string;
  evidence: WorkflowReference[];
}): CoherenceReviewView {
  const verdict = firstSectionLine(input.markdown, "Final Verdict") ?? input.statusFallback;
  const findings: CoherenceFindingView[] = [
    finding("Mission plan", firstSectionLine(input.markdown, "Mission Plan Alignment")),
    finding("Scope", firstSectionLine(input.markdown, "Scope Check Result")),
    finding("Validation", firstSectionLine(input.markdown, "Validation / Evaluation Result")),
    finding("Remaining work", firstSectionLine(input.markdown, "What Remains Incomplete")),
    finding("Final verdict", verdict, toneForCoherence(verdict))
  ].filter(isDefined);

  return {
    id: `${input.workspaceId}-coherence`,
    status: redactText(verdict, 80).toLowerCase(),
    file: input.file,
    workspaceId: input.workspaceId,
    summary: coherenceSummary(input.markdown),
    findings,
    evidence: input.evidence
  };
}

function scopeSelections(
  contract: Record<string, unknown>,
  report?: Record<string, unknown>,
  affectedTree: Record<string, unknown> = {},
  memory: { concepts?: Concept[]; invariants?: Invariant[] } = {}
): ScopeSelectionItem[] {
  const selectedConceptIds = new Set<string>();
  const selectedInvariantIds = new Set<string>();
  const items: ScopeSelectionItem[] = [];

  for (const node of recordArray(affectedTree.affected_nodes)) {
    const id = stringField(node, "node_id");
    if (!id) continue;
    items.push(selection(id, id, "node", "selected", confidenceImpact(numberField(node, "confidence")), stringField(node, "reason") ?? "Selected by affected-tree mapping."));
  }

  for (const concept of recordArray(affectedTree.affected_concepts)) {
    const id = stringField(concept, "concept_id");
    if (!id) continue;
    selectedConceptIds.add(id);
    items.push(selection(id, id, "concept", "selected", confidenceImpact(numberField(concept, "confidence")), stringField(concept, "reason") ?? "Selected by affected-tree mapping."));
  }

  for (const file of recordArray(affectedTree.affected_files)) {
    const filePath = stringField(file, "path");
    if (!filePath) continue;
    items.push(selection(filePath, filePath, "file", "selected", confidenceImpact(numberField(file, "confidence")), stringField(file, "reason") ?? "Selected by affected-tree mapping."));
  }

  for (const invariant of recordArray(affectedTree.invariants)) {
    const id = stringField(invariant, "id");
    if (!id) continue;
    selectedInvariantIds.add(id);
    items.push(selection(id, id, "invariant", "selected", "high", stringField(invariant, "reason") ?? "Selected by affected-tree invariant mapping."));
  }

  for (const nodeId of stringArrayField(contract, "affectedNodeIds")) {
    items.push(selection(nodeId, nodeId, "node", "selected", "medium", "Included by the scope contract affected node list."));
  }

  for (const filePath of stringArrayField(contract, "allowedFiles")) {
    items.push(selection(filePath, filePath, "file", "selected", "medium", "Allowed by the scope contract."));
  }

  for (const area of stringArrayField(contract, "forbiddenAreas")) {
    items.push(selection(area, area, "area", "excluded", areaImpact(area), "Excluded because it is outside the selected scope areas."));
  }

  for (const ambiguity of stringArrayField(contract, "ambiguities")) {
    items.push(selection(ambiguity, "Scope ambiguity", "check", "questionable", "high", ambiguity));
  }

  for (const command of stringArrayField(contract, "requiredChecks")) {
    items.push(selection(command, redactText(command, 120), "check", "selected", "medium", "Required by the scope contract."));
  }

  for (const filePath of stringArrayField(report, "changedFiles")) {
    if (!stringArrayField(contract, "allowedFiles").includes(filePath)) {
      items.push(selection(filePath, filePath, "file", "questionable", "high", "Changed file was not in the scope contract allowed file list."));
    }
  }

  for (const concept of (memory.concepts ?? []).filter(concept => !selectedConceptIds.has(concept.id)).slice(0, 5)) {
    items.push(selection(concept.id, concept.title, "concept", "excluded", "low", "Not selected by the goal affected-tree mapping."));
  }

  for (const invariant of (memory.invariants ?? []).filter(invariant => !selectedInvariantIds.has(invariant.id)).slice(0, 5)) {
    items.push(selection(invariant.id, invariant.title, "invariant", "excluded", invariant.severity, "Not selected by the goal affected-tree mapping."));
  }

  return items;
}

function scopeViolations(report?: Record<string, unknown>): ScopeSelectionItem[] {
  return recordArray(report?.violations).map((violation, index) => {
    const severity = stringField(violation, "severity");
    const filePath = stringField(violation, "filePath");
    const message = stringField(violation, "message") ?? "Scope violation.";
    return selection(
      filePath ?? `violation-${index + 1}`,
      filePath ?? stringField(violation, "kind") ?? "Scope violation",
      filePath ? "file" : "check",
      severity === "error" ? "excluded" : "questionable",
      severity === "error" ? "high" : "medium",
      message
    );
  });
}

function goalStats(
  status: string,
  affectedTree: Record<string, unknown>,
  scopeContract: Record<string, unknown> | undefined,
  checks: Record<string, unknown> | undefined,
  coherenceText: string | undefined,
  missions: MissionPlanItemView[]
): GoalWorkspaceView["stats"] {
  const checkCommands = recordArray(checks?.commands);
  const failedCheckCount = checkCommands.filter(command => stringField(command, "status") === "failed").length;
  const notRunCheckCount = checkCommands.filter(command => stringField(command, "status") === "not-run").length;
  const unresolvedSignals = [
    status !== "success" ? 1 : 0,
    failedCheckCount,
    notRunCheckCount,
    stringArrayField(scopeContract, "ambiguities").length,
    coherenceText && /\b(pending|incomplete|refused|not run)\b/iu.test(coherenceText) ? 1 : 0
  ];
  const affectedFiles = new Set([
    ...recordArray(affectedTree.affected_files).map(file => stringField(file, "path")),
    ...stringArrayField(scopeContract, "allowedFiles")
  ].filter(isDefined));

  return {
    affectedFileCount: affectedFiles.size,
    affectedNodeCount: uniqueStrings([
      ...recordArray(affectedTree.affected_nodes).map(node => stringField(node, "node_id")),
      ...stringArrayField(scopeContract, "affectedNodeIds")
    ]).length,
    affectedConceptCount: recordArray(affectedTree.affected_concepts).length,
    invariantCount: recordArray(affectedTree.invariants).length,
    plannedTaskCount: missions.length,
    unresolvedItemCount: unresolvedSignals.reduce((sum, value) => sum + (typeof value === "number" ? value : 0), 0),
    checkCount: checkCommands.length,
    failedCheckCount
  };
}

function executionStageStatus(status: string, checkStatus?: string): MissionPlanStageView["status"] {
  if (checkStatus === "passed") return "complete";
  if (checkStatus === "failed") return "blocked";
  if (checkStatus === "partial") return "warning";
  if (status === "execution-refused") return "blocked";
  if (status === "failed") return "blocked";
  if (status === "partial") return "warning";
  if (status === "success") return "complete";
  return "pending";
}

function executionStageSummary(status: string, checkStatus?: string): string {
  if (checkStatus) return `Checks are ${checkStatus}.`;
  if (status === "execution-refused") return "Automatic execution was refused by the goal command.";
  if (status === "planned") return "Mission execution is pending review.";
  return `Execution status is ${status}.`;
}

function reviewStageStatus(status: string, coherenceText?: string, finalReportText?: string): MissionPlanStageView["status"] {
  if (!coherenceText && !finalReportText) return "pending";
  if (status === "failed" || status === "execution-refused") return "warning";
  return "complete";
}

function scopeSummary(contract: Record<string, unknown>, report?: Record<string, unknown>): string {
  const status = stringField(report, "status") ?? stringField(contract, "status") ?? "unknown";
  const prompt = stringField(contract, "prompt") ?? "No prompt recorded.";
  const violations = recordArray(report?.violations).length;
  const suffix = violations ? `${violations} violation(s) recorded.` : "No scope check violations recorded.";
  return redactText(`${status}: ${prompt} ${suffix}`, 260);
}

function coherenceSummary(markdown: string): string {
  return redactText(
    firstSectionLine(markdown, "What Remains Incomplete") ??
      firstSectionLine(markdown, "Mission Plan Alignment") ??
      firstMeaningfulLine(markdown) ??
      "No coherence summary found.",
    260
  );
}

function goalTitle(goalText: string | undefined, fallback: string): string {
  const summary = summarizeText(goalText ?? fallback, 90);
  return summary || fallback;
}

function summarizeText(value: string, maxLength: number): string {
  return redactText(value.replace(/^#\s+/gmu, "").replace(/\s+/gu, " ").trim() || "No summary available.", maxLength);
}

function firstSectionLine(markdown: string, heading: string): string | undefined {
  const section = markdownSection(markdown, heading);
  return section ? firstMeaningfulLine(section) : undefined;
}

function firstMeaningfulLine(markdown: string): string | undefined {
  return markdown
    .split(/\r?\n/u)
    .map(line => line.replace(/^[-*]\s*/u, "").trim())
    .find(line => line.length > 0 && !line.startsWith("#"));
}

function markdownSection(markdown: string, heading: string): string | undefined {
  const lines = markdown.split(/\r?\n/u);
  const normalizedHeading = heading.toLowerCase();
  const collected: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const match = /^(#{2,6})\s+(.+?)\s*$/u.exec(line);
    if (match) {
      if (collecting) break;
      collecting = match[2].trim().toLowerCase() === normalizedHeading;
      continue;
    }
    if (collecting) collected.push(line);
  }

  const section = collected.join("\n").trim();
  return section || undefined;
}

function matchingContextPacks(contextPacks: ContextPackView[], goalId: string, title: string, slug: string): ContextPackView[] {
  const needles = [goalId, slug, ...title.toLowerCase().split(/[^a-z0-9]+/u).filter(token => token.length > 4).slice(0, 4)]
    .map(value => value.toLowerCase());
  return contextPacks
    .filter(pack => {
      const haystack = `${pack.id} ${pack.target}`.toLowerCase();
      return needles.some(needle => haystack.includes(needle));
    })
    .slice(0, 5);
}

function contextPackRefs(contextPacks: ContextPackView[]): WorkflowReference[] {
  return contextPacks.map(pack => ref(pack.target, pack.file, "context-pack", pack.id));
}

function finding(label: string, value: string | undefined, tone?: CoherenceFindingView["tone"]): CoherenceFindingView | undefined {
  if (!value) return undefined;
  return {
    label,
    value: redactText(value, 220),
    tone
  };
}

function toneForCoherence(value: string | undefined): CoherenceFindingView["tone"] {
  const lower = value?.toLowerCase() ?? "";
  if (/\b(success|complete|passed)\b/u.test(lower)) return "good";
  if (/\b(failed|blocked|refused)\b/u.test(lower)) return "bad";
  if (/\b(partial|planned|pending|incomplete)\b/u.test(lower)) return "warn";
  return undefined;
}

function selection(
  id: string,
  label: string,
  kind: ScopeSelectionItem["kind"],
  status: ScopeSelectionItem["status"],
  impact: ScopeSelectionItem["impact"],
  reason: string
): ScopeSelectionItem {
  return {
    id: redactText(id, 220),
    label: redactText(label, 220),
    kind,
    status,
    impact,
    reason: redactText(reason, 260)
  };
}

function uniqueSelections(items: ScopeSelectionItem[]): ScopeSelectionItem[] {
  const seen = new Set<string>();
  const unique: ScopeSelectionItem[] = [];
  for (const item of items) {
    const key = `${item.kind}\0${item.status}\0${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function confidenceImpact(confidence: number | undefined): ScopeSelectionItem["impact"] {
  if (typeof confidence !== "number") return "medium";
  if (confidence >= 0.85) return "high";
  if (confidence < 0.65) return "low";
  return "medium";
}

function areaImpact(area: string): ScopeSelectionItem["impact"] {
  return ["ci", "package", "automation", "memory"].includes(area) ? "high" : "medium";
}

function ref(
  label: string,
  referencePath: string,
  kind: WorkflowReference["kind"],
  targetId?: string
): WorkflowReference {
  return {
    label,
    path: referencePath.replaceAll("\\", "/"),
    kind,
    targetId
  };
}

async function directoryNames(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
}

async function jsonFileNames(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir).catch(() => [])).filter(name => name.endsWith(".json")).sort();
}

async function markdownFileNames(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir).catch(() => [])).filter(name => name.endsWith(".md")).sort();
}

async function readOptionalJsonRecord(filePath: string): Promise<Record<string, unknown> | undefined> {
  if (!existsSync(filePath)) return undefined;
  try {
    return objectRecord(await readJson<unknown>(filePath, undefined));
  } catch {
    return undefined;
  }
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  if (!existsSync(filePath)) return undefined;
  return readFile(filePath, "utf8").catch(() => undefined);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(objectRecord).filter(isDefined) : [];
}

function arrayField(value: unknown, field: string): unknown[] {
  const record = objectRecord(value);
  const fieldValue = record?.[field];
  return Array.isArray(fieldValue) ? fieldValue : [];
}

function stringArrayField(value: unknown, field: string): string[] {
  return arrayField(value, field).filter((item): item is string => typeof item === "string").map(item => redactText(item, 220));
}

function redactOptional(value: string | undefined, maxLength: number): string | undefined {
  return value === undefined ? undefined : redactText(value, maxLength);
}

function redactText(value: string, maxLength = 500): string {
  const redacted = redactSecrets(value)
    .replace(/\s+/gu, " ")
    .trim();
  return redacted.length > maxLength ? `${redacted.slice(0, Math.max(0, maxLength - 3)).trim()}...` : redacted;
}

function redactSecrets(value: string): string {
  const secretKey = String.raw`(?:[A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|access[_-]?token|auth[_-]?token|token|secret|password|credentials?|private[_-]?key))`;
  const secretValue = String.raw`("[^"]*"|'[^']*'|` + "`[^`]*`" + String.raw`|[^\s,;}\]]+)`;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(/\bAuthorization\s*:\s*(?:token|basic)\s+[A-Za-z0-9._~+/=-]+/giu, "Authorization: [redacted]")
    .replace(new RegExp(`(["']?\\b${secretKey}\\b["']?\\s*[:=]\\s*)${secretValue}`, "giu"), redactSecretValue)
    .replace(/\b((?:export\s+)?[A-Z][A-Z0-9_]*(?:API_KEY|ACCESS_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*\s*=\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gu, redactSecretValue)
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/giu, "[redacted-secret]")
    .replace(/\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/giu, "[redacted-secret]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu, "[redacted-secret]");
}

function redactSecretValue(_match: string, prefix: string, value: string): string {
  if (value.startsWith("\"")) return `${prefix}"[redacted]"`;
  if (value.startsWith("'")) return `${prefix}'[redacted]'`;
  if (value.startsWith("`")) return `${prefix}\`[redacted]\``;
  return `${prefix}[redacted]`;
}

function normalizeArtifactPath(requestedPath: string): string | undefined {
  const trimmed = requestedPath.replaceAll("\\", "/").trim().replace(/^\/+/u, "");
  if (!trimmed || !trimmed.startsWith(".abstraction-tree/")) return undefined;
  const normalized = path.posix.normalize(trimmed);
  if (normalized === ".abstraction-tree" || normalized.startsWith("../") || normalized.includes("/../")) return undefined;
  if (!/\.(json|md|txt|log)$/iu.test(normalized)) return undefined;
  return normalized;
}

function sortNewest(left: string | undefined, right: string | undefined): number {
  return (Date.parse(right ?? "") || 0) - (Date.parse(left ?? "") || 0);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter(isDefined))];
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
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
