import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { scorePromptEvidence, type PromptRouteResult } from "./promptRouter.js";
import type { ChangeRecord, Concept, FileSummary, Invariant, MissionPlanningConfig, TreeNode } from "./schema.js";
import type { ScopeContract } from "./scope.js";

export type GoalMode = "plan-only" | "review-required" | "full-auto" | "create-pr" | "run";
export type GoalStatus = "planned" | "execution-refused" | "success" | "partial" | "failed";
export type GoalLayer = "project" | "architecture" | "module" | "file" | "function" | "schema" | "cli" | "docs" | "tests";
export type GoalMissionPriority = "P0" | "P1" | "P2" | "P3";
export type GoalMissionRisk = "low" | "medium" | "high";
export type GoalMissionCategory = "product-value" | "safety" | "quality" | "developer-experience" | "automation-maintenance";

export interface GoalPlanningInput {
  goalText: string;
  goalFile?: string;
  mode: GoalMode;
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  invariants: Invariant[];
  changes?: ChangeRecord[];
  evaluations?: Record<string, unknown>[];
  createdAt?: Date;
  projectRoot?: string;
  missionPlanning?: MissionPlanningConfig;
}

export interface GoalMetadata {
  id: string;
  created_at: string;
  source: "file";
  goal_file: string;
  mode: GoalMode;
  status: GoalStatus;
  project_root: string;
}

export interface GoalAffectedTree {
  goal_id: string;
  affected_nodes: Array<{
    node_id: string;
    reason: string;
    confidence: number;
  }>;
  affected_concepts: Array<{
    concept_id: string;
    reason: string;
    confidence: number;
  }>;
  affected_files: Array<{
    path: string;
    reason: string;
    confidence: number;
  }>;
  invariants: Array<{
    id: string;
    reason: string;
  }>;
}

export interface GoalMissionSummary {
  id: string;
  title: string;
  priority: GoalMissionPriority;
  risk: GoalMissionRisk;
  category: GoalMissionCategory;
  affectedFiles: string[];
  affectedNodes: string[];
  dependsOn: string[];
  parallelGroup: string;
  parallelGroupSafe: boolean;
  expected_affected_areas: GoalLayer[];
  source_goal: string;
  success_checks: string[];
}

export interface GoalMissionPlan {
  goal_id: string;
  created_at: string;
  mission_dir: string;
  missions: Array<{
    id: string;
    title: string;
    priority: GoalMissionPriority;
    risk: GoalMissionRisk;
    depends_on: string[];
    expected_affected_areas: GoalLayer[];
    source_goal: string;
    success_checks: string[];
  }>;
}

export interface GoalMissionFile {
  fileName: string;
  relativePath: string;
  content: string;
  mission: GoalMissionSummary;
}

export interface GoalWorkspacePlan {
  id: string;
  slug: string;
  createdAt: string;
  workspaceRelativePath: string;
  goalRelativePath: string;
  goalJsonRelativePath: string;
  missionDirRelativePath: string;
  metadata: GoalMetadata;
  assessmentMarkdown: string;
  affectedTree: GoalAffectedTree;
  missionPlan: GoalMissionPlan;
  missions: GoalMissionFile[];
  coherenceReviewMarkdown: string;
  finalReportMarkdown: string;
  prBodyMarkdown?: string;
  routeJson?: GoalRouteRecord;
  routeMarkdown?: string;
  scopeContract?: ScopeContract;
  scopeContractMarkdown?: string;
  checksJson?: GoalChecksRecord;
  checksMarkdown?: string;
  goalScore?: GoalCompletionScore;
  reviewCommands: string[];
  selectedLayers: GoalLayer[];
}

export interface GoalRouteRecord {
  goal_id: string;
  created_at: string;
  route: PromptRouteResult;
  overridden: boolean;
  override_reason?: string;
}

export interface GoalChecksRecord {
  goal_id: string;
  status: "not-run" | "passed" | "partial" | "failed";
  commands: Array<{
    command: string;
    status: "not-run" | "passed" | "failed";
    exit_code?: number;
    summary: string;
  }>;
  notes: string[];
}

export interface GoalCompletionScore {
  goal_id: string;
  status: GoalStatus;
  score: number;
  breakdown: {
    missions_completed: number;
    checks_passed: number;
    scope_respected: number;
    validation_passed: number;
    evaluation_available: number;
    docs_or_memory_updated: number;
    coherence_review_written: number;
  };
  penalties: string[];
  evidence: string[];
}

interface ScoredItem<T> {
  id: string;
  item: T;
  score: number;
  reasons: string[];
}

interface MissionPlanningProfile {
  implementationFiles: string[];
  testFiles: string[];
  docFiles: string[];
  buildFiles: string[];
  scopeFiles: string[];
  buildChecks: string[];
  testChecks: string[];
  docsChecks: string[];
  validationChecks: string[];
  scanChecks: string[];
}

interface PackageScript {
  name: string;
  command: string;
  manifestPath: string;
}

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "by",
  "can",
  "for",
  "from",
  "have",
  "in",
  "into",
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
  "use",
  "we",
  "with"
]);

const allLayers: GoalLayer[] = ["project", "architecture", "module", "file", "function", "schema", "cli", "docs", "tests"];

export function buildGoalWorkspacePlan(input: GoalPlanningInput): GoalWorkspacePlan {
  const createdAt = input.createdAt ?? new Date();
  const createdAtIso = createdAt.toISOString();
  const slug = slugFromInput(input.goalFile, input.goalText);
  const id = goalId(createdAt, slug);
  const workspaceRelativePath = `.abstraction-tree/goals/${id}`;
  const goalRelativePath = `${workspaceRelativePath}/goal.md`;
  const goalJsonRelativePath = `${workspaceRelativePath}/goal.json`;
  const missionDirRelativePath = `${workspaceRelativePath}/missions`;
  const tokens = tokenize(input.goalText);
  const promptEvidence = scorePromptEvidence({
    prompt: input.goalText,
    nodes: input.nodes,
    files: input.files,
    concepts: input.concepts
  });
  const scoredFiles = mergeScoredItems(
    scoreFiles(input.files, tokens),
    promptEvidence.scoredFiles.map(item => ({
      id: item.id,
      item: item.item,
      score: item.score + 6,
      reasons: ["Route evidence selected this file."]
    }))
  );
  const scoredNodes = mergeScoredItems(
    scoreNodes(input.nodes, scoredFiles, tokens),
    promptEvidence.scoredNodes.map(item => ({
      id: item.id,
      item: item.item,
      score: item.score + 4,
      reasons: ["Route evidence selected this node."]
    }))
  );
  const scoredConcepts = mergeScoredItems(
    scoreConcepts(input.concepts, tokens, scoredFiles),
    promptEvidence.scoredConcepts.map(item => ({
      id: item.id,
      item: item.item,
      score: item.score + 4,
      reasons: ["Route evidence selected this concept."]
    }))
  );
  const selectedFiles = topScored(scoredFiles, 12);
  const selectedNodes = selectNodes(input.nodes, scoredNodes, selectedFiles);
  const selectedConcepts = topScored(scoredConcepts, 8);
  const selectedInvariants = selectInvariants(input.invariants, selectedNodes, selectedFiles, tokens);
  const baseSelectedLayers = inferLayers(selectedNodes.map(score => score.item), selectedFiles.map(score => score.item), tokens);
  const missionProfile = buildMissionPlanningProfile({
    files: input.files,
    selectedFiles,
    selectedNodes,
    tokens,
    projectRoot: input.projectRoot,
    config: input.missionPlanning
  });
  const selectedLayers = enrichLayersFromMissionProfile(baseSelectedLayers, missionProfile);
  const affectedTree = buildAffectedTree(id, selectedNodes, selectedConcepts, selectedFiles, selectedInvariants);
  const metadata: GoalMetadata = {
    id,
    created_at: createdAtIso,
    source: "file",
    goal_file: normalizeRepoPath(input.goalFile ?? ""),
    mode: input.mode,
    status: input.mode === "full-auto" || input.mode === "run" ? "execution-refused" : "planned",
    project_root: input.projectRoot ?? "."
  };
  const missions = buildMissions({
    goalId: id,
    goalText: input.goalText,
    goalRelativePath,
    missionDirRelativePath,
    slug,
    selectedLayers,
    selectedFiles,
    selectedNodes,
    tokens,
    profile: missionProfile
  });
  const missionPlan = buildMissionPlan(id, createdAtIso, missionDirRelativePath, missions);
  const reviewCommands = [
    `npm run missions:plan -- --missions ${missionDirRelativePath}`,
    `npm run missions:run -- --missions ${missionDirRelativePath}`
  ];
  return {
    id,
    slug,
    createdAt: createdAtIso,
    workspaceRelativePath,
    goalRelativePath,
    goalJsonRelativePath,
    missionDirRelativePath,
    metadata,
    assessmentMarkdown: formatGoalAssessment({
      goalText: input.goalText,
      affectedTree,
      selectedNodes,
      selectedConcepts,
      selectedFiles,
      selectedInvariants,
      selectedLayers,
      missions,
      tokens,
      changes: input.changes ?? [],
      evaluations: input.evaluations ?? []
    }),
    affectedTree,
    missionPlan,
    missions,
    coherenceReviewMarkdown: formatCoherenceReview({
      mode: input.mode,
      goalText: input.goalText
    }),
    finalReportMarkdown: formatFinalReport({
      status: metadata.status,
      workspaceRelativePath,
      missionDirRelativePath,
      reviewCommands,
      fullAutoRefused: input.mode === "full-auto" || input.mode === "run",
      createPr: input.mode === "create-pr"
    }),
    prBodyMarkdown: input.mode === "create-pr"
      ? formatPrBody({ goalText: input.goalText, missionPlan, fullAutoRefused: false })
      : undefined,
    reviewCommands,
    selectedLayers
  };
}

function buildAffectedTree(
  goalId: string,
  nodes: Array<ScoredItem<TreeNode>>,
  concepts: Array<ScoredItem<Concept>>,
  files: Array<ScoredItem<FileSummary>>,
  invariants: Invariant[]
): GoalAffectedTree {
  return {
    goal_id: goalId,
    affected_nodes: nodes.map(node => ({
      node_id: node.item.id,
      reason: node.reasons.join(" "),
      confidence: confidenceFor(node.score)
    })),
    affected_concepts: concepts.map(concept => ({
      concept_id: concept.item.id,
      reason: concept.reasons.join(" "),
      confidence: confidenceFor(concept.score)
    })),
    affected_files: files.map(file => ({
      path: normalizeRepoPath(file.item.path),
      reason: file.reasons.join(" "),
      confidence: confidenceFor(file.score)
    })),
    invariants: invariants.map(invariant => ({
      id: invariant.id,
      reason: "Matched the goal through selected nodes, selected files, or invariant wording."
    }))
  };
}

function buildMissionPlan(
  goalId: string,
  createdAt: string,
  missionDirRelativePath: string,
  missions: GoalMissionFile[]
): GoalMissionPlan {
  return {
    goal_id: goalId,
    created_at: createdAt,
    mission_dir: missionDirRelativePath,
    missions: missions.map(({ mission }) => ({
      id: mission.id,
      title: mission.title,
      priority: mission.priority,
      risk: mission.risk,
      depends_on: mission.dependsOn,
      expected_affected_areas: mission.expected_affected_areas,
      source_goal: mission.source_goal,
      success_checks: mission.success_checks
    }))
  };
}

function buildMissions(input: {
  goalId: string;
  goalText: string;
  goalRelativePath: string;
  missionDirRelativePath: string;
  slug: string;
  selectedLayers: GoalLayer[];
  selectedFiles: Array<ScoredItem<FileSummary>>;
  selectedNodes: Array<ScoredItem<TreeNode>>;
  tokens: string[];
  profile: MissionPlanningProfile;
}): GoalMissionFile[] {
  const group = input.goalId;
  const relevantFiles = uniqueStable([
    ...input.selectedFiles.map(file => file.item.path),
    ...input.selectedNodes.flatMap(node => [...node.item.sourceFiles, ...node.item.ownedFiles])
  ]);
  const relevantNodes = input.selectedNodes.map(node => node.item.id);
  const missionSpecs: Omit<GoalMissionSummary, "id" | "source_goal" | "parallelGroup" | "parallelGroupSafe">[] = [];

  missionSpecs.push({
    title: "Map scope, invariants, and non-goals",
    priority: "P0",
    risk: "low",
    category: "safety",
    affectedFiles: uniqueStable([
      ...input.profile.scopeFiles,
      ...input.profile.docFiles.slice(0, 2)
    ]),
    affectedNodes: relevantNodes.slice(0, 5),
    dependsOn: [],
    expected_affected_areas: uniqueLayers(["project", ...input.selectedLayers]),
    success_checks: input.profile.validationChecks
  });

  missionSpecs.push({
    title: implementationMissionTitle(input.selectedLayers, input.tokens),
    priority: "P1",
    risk: "medium",
    category: "product-value",
    affectedFiles: uniqueStable([
      ...input.profile.implementationFiles,
      ...input.profile.buildFiles.slice(0, 4)
    ]),
    affectedNodes: implementationNodes(relevantNodes),
    dependsOn: [`${input.slug}-00-scope-and-invariants`],
    expected_affected_areas: uniqueLayers(input.selectedLayers.length ? input.selectedLayers : ["module", "file"]),
    success_checks: uniqueCommands([
      ...input.profile.buildChecks,
      ...input.profile.testChecks.slice(0, 1)
    ])
  });

  if (input.selectedLayers.includes("tests") || input.tokens.some(token => ["test", "tests", "validation", "validate", "quality"].includes(token))) {
    missionSpecs.push({
      title: "Add deterministic tests and validation coverage",
      priority: "P1",
      risk: "medium",
      category: "quality",
      affectedFiles: input.profile.testFiles,
      affectedNodes: relevantNodes.filter(node => /test|quality|validation|spec/u.test(node)).slice(0, 6),
      dependsOn: [missionSpecs[1]?.title ? `${input.slug}-01-implementation` : `${input.slug}-00-scope-and-invariants`],
      expected_affected_areas: ["tests"],
      success_checks: uniqueCommands([...input.profile.testChecks, ...input.profile.validationChecks])
    });
  } else {
    missionSpecs.push({
      title: "Verify behavior with deterministic checks",
      priority: "P2",
      risk: "low",
      category: "quality",
      affectedFiles: input.profile.testFiles,
      affectedNodes: relevantNodes.slice(0, 5),
      dependsOn: [`${input.slug}-01-implementation`],
      expected_affected_areas: ["tests"],
      success_checks: uniqueCommands([...input.profile.testChecks, ...input.profile.validationChecks])
    });
  }

  missionSpecs.push({
    title: "Document workflow and update durable memory",
    priority: "P2",
    risk: "low",
    category: "developer-experience",
    affectedFiles: uniqueStable([
      ...input.profile.docFiles,
      ...input.profile.scopeFiles.slice(0, 2)
    ]),
    affectedNodes: relevantNodes.filter(node => /docs|readme|memory|project/u.test(node)).slice(0, 6),
    dependsOn: [`${input.slug}-02-tests-and-validation`],
    expected_affected_areas: ["docs", "project"],
    success_checks: uniqueCommands([
      ...input.profile.docsChecks,
      ...input.profile.scanChecks,
      ...input.profile.validationChecks
    ])
  });

  missionSpecs.push({
    title: "Review coherence against the original goal",
    priority: "P0",
    risk: "low",
    category: "safety",
    affectedFiles: [
      `${input.missionDirRelativePath}/../coherence-review.md`,
      `${input.missionDirRelativePath}/../final-report.md`
    ],
    affectedNodes: relevantNodes.slice(0, 6),
    dependsOn: [`${input.slug}-03-docs-and-memory`],
    expected_affected_areas: uniqueLayers(["project", ...input.selectedLayers]),
    success_checks: uniqueCommands(["git diff --check", ...input.profile.validationChecks])
  });

  return missionSpecs.map((spec, index) => {
    const suffix = missionSuffix(index, spec.title);
    const id = `${input.slug}-${String(index).padStart(2, "0")}-${suffix}`;
    const normalizedSpec = normalizeMissionDependencies(spec, input.slug, index);
    const mission: GoalMissionSummary = {
      id,
      title: spec.title,
      priority: spec.priority,
      risk: spec.risk,
      category: spec.category,
      affectedFiles: normalizedSpec.affectedFiles.length ? normalizedSpec.affectedFiles : ["README.md"],
      affectedNodes: normalizedSpec.affectedNodes.length ? normalizedSpec.affectedNodes : ["project.intent"],
      dependsOn: normalizedSpec.dependsOn,
      parallelGroup: group,
      parallelGroupSafe: false,
      expected_affected_areas: normalizedSpec.expected_affected_areas,
      source_goal: input.goalRelativePath,
      success_checks: normalizedSpec.success_checks
    };
    const fileName = `${String(index).padStart(2, "0")}-${suffix}.md`;
    return {
      fileName,
      relativePath: `${input.missionDirRelativePath}/${fileName}`,
      mission,
      content: formatMissionMarkdown(mission, input.goalText)
    };
  });
}

function buildMissionPlanningProfile(input: {
  files: FileSummary[];
  selectedFiles: Array<ScoredItem<FileSummary>>;
  selectedNodes: Array<ScoredItem<TreeNode>>;
  tokens: string[];
  projectRoot?: string;
  config?: MissionPlanningConfig;
}): MissionPlanningProfile {
  const allPaths = input.files.map(file => normalizeRepoPath(file.path));
  const relevantFiles = uniqueStable([
    ...input.selectedFiles.map(file => file.item.path),
    ...input.selectedNodes.flatMap(node => [...node.item.sourceFiles, ...node.item.ownedFiles])
  ]);
  const packageScripts = readPackageScripts(input.projectRoot, input.files);
  const packageManager = detectPackageManager(input.projectRoot, input.files);
  const configuredDocFiles = filesMatchingPatterns(allPaths, input.config?.docsPatterns ?? []);
  const configuredTestFiles = filesMatchingPatterns(allPaths, input.config?.testPatterns ?? []);
  const configuredBuildFiles = filesMatchingPatterns(allPaths, input.config?.buildPatterns ?? []);
  const docFiles = prioritizedPaths([
    ...relevantFiles.filter(file => isDocPath(file, allPaths)),
    ...configuredDocFiles,
    ...allPaths.filter(file => isDocPath(file, allPaths))
  ], relevantFiles, input.tokens).slice(0, 10);
  const testFiles = prioritizedPaths([
    ...relevantFiles.filter(file => isTestPath(file)),
    ...configuredTestFiles,
    ...input.files.filter(file => file.isTest || isTestPath(file.path)).map(file => file.path)
  ], relevantFiles, input.tokens).slice(0, 10);
  const buildFiles = prioritizedPaths([
    ...relevantFiles.filter(file => isBuildPath(file)),
    ...configuredBuildFiles,
    ...allPaths.filter(isBuildPath)
  ], relevantFiles, input.tokens).slice(0, 8);
  const implementationFiles = prioritizedPaths([
    ...relevantFiles.filter(file => isImplementationPath(file, allPaths)),
    ...allPaths.filter(file => isImplementationPath(file, allPaths))
  ], relevantFiles, input.tokens).slice(0, 12);

  return {
    implementationFiles: withFallback(implementationFiles, fallbackImplementationFiles(allPaths)),
    testFiles: withFallback(testFiles, ["tests"]),
    docFiles: withFallback(docFiles, fallbackDocFiles(allPaths)),
    buildFiles,
    scopeFiles: [".abstraction-tree/tree.json", ".abstraction-tree/invariants.json", ".abstraction-tree/config.json"],
    buildChecks: configuredCommands(input.config?.buildCommands) ??
      withFallback(inferBuildChecks(input.files, packageScripts, packageManager), ["git diff --check"]),
    testChecks: configuredCommands(input.config?.testCommands) ??
      withFallback(inferTestChecks(input.files, packageScripts, packageManager), ["git diff --check"]),
    docsChecks: configuredCommands(input.config?.docsCommands) ??
      inferDocsChecks(input.files, packageScripts, packageManager),
    validationChecks: configuredCommands(input.config?.validationCommands) ??
      [atreeCheckCommand(packageScripts, packageManager, "validate", "npx atree validate --project . --strict")],
    scanChecks: configuredCommands(input.config?.scanCommands) ??
      [atreeCheckCommand(packageScripts, packageManager, "scan", "npx atree scan --project .")]
  };
}

function enrichLayersFromMissionProfile(layers: GoalLayer[], profile: MissionPlanningProfile): GoalLayer[] {
  return uniqueLayers([
    ...layers,
    profile.testFiles.length ? "tests" : "file",
    profile.docFiles.length ? "docs" : "file"
  ]);
}

function implementationMissionTitle(layers: GoalLayer[], tokens: string[]): string {
  if (layers.includes("cli") || tokens.some(token => ["cli", "command", "terminal"].includes(token))) {
    return "Implement bounded command workflow";
  }
  if (tokens.some(token => ["api", "endpoint", "route"].includes(token))) return "Implement bounded API workflow";
  if (tokens.some(token => ["ui", "app", "frontend", "component"].includes(token))) return "Implement bounded application workflow";
  return "Implement the smallest useful product change";
}

function implementationNodes(nodeIds: string[]): string[] {
  const prioritized = nodeIds.filter(node => /architecture|module|source|service|api|cli|ui|app|feature/u.test(node));
  return (prioritized.length ? prioritized : nodeIds).slice(0, 6);
}

function readPackageScripts(projectRoot: string | undefined, files: FileSummary[]): PackageScript[] {
  if (!projectRoot) return [];
  const root = path.resolve(projectRoot);
  const scripts: PackageScript[] = [];
  for (const manifestPath of files.map(file => normalizeRepoPath(file.path)).filter(file => path.basename(file) === "package.json").sort()) {
    const absolutePath = resolveInsideProject(root, manifestPath);
    if (!absolutePath) continue;
    const manifest = readJsonRecord(absolutePath);
    const scriptRecord = objectRecord(manifest?.scripts);
    if (!scriptRecord) continue;
    for (const [name, command] of Object.entries(scriptRecord)) {
      if (typeof command === "string" && command.trim() && !isPlaceholderScript(command)) {
        scripts.push({ name, command, manifestPath });
      }
    }
  }
  return scripts;
}

function detectPackageManager(projectRoot: string | undefined, files: FileSummary[]): "npm" | "pnpm" | "yarn" | "bun" {
  const paths = files.map(file => normalizeRepoPath(file.path));
  if (paths.some(file => /(^|\/)(pnpm-lock\.yaml|pnpm-workspace\.yaml)$/u.test(file))) return "pnpm";
  if (paths.some(file => /(^|\/)bun\.lockb?$/u.test(file))) return "bun";
  if (paths.some(file => /(^|\/)yarn\.lock$/u.test(file))) return "yarn";
  if (projectRoot) {
    const root = path.resolve(projectRoot);
    const manifest = readJsonRecord(resolveInsideProject(root, "package.json") ?? "");
    const packageManager = typeof manifest?.packageManager === "string" ? manifest.packageManager : "";
    if (packageManager.startsWith("pnpm@")) return "pnpm";
    if (packageManager.startsWith("yarn@")) return "yarn";
    if (packageManager.startsWith("bun@")) return "bun";
  }
  return "npm";
}

function inferBuildChecks(files: FileSummary[], scripts: PackageScript[], packageManager: "npm" | "pnpm" | "yarn" | "bun"): string[] {
  const scriptChecks = scriptChecksFor(scripts, packageManager, "build", 2);
  if (scriptChecks.length) return scriptChecks;
  const paths = new Set(files.map(file => normalizeRepoPath(file.path)));
  if (paths.has("Cargo.toml")) return ["cargo build"];
  if (paths.has("go.mod")) return ["go build ./..."];
  if (paths.has("pom.xml")) return ["mvn package"];
  if (paths.has("build.gradle") || paths.has("build.gradle.kts")) return ["./gradlew build"];
  if (paths.has("pyproject.toml")) return ["python -m build"];
  if (paths.has("Makefile")) return ["make"];
  return [];
}

function inferTestChecks(files: FileSummary[], scripts: PackageScript[], packageManager: "npm" | "pnpm" | "yarn" | "bun"): string[] {
  const scriptChecks = scriptChecksFor(scripts, packageManager, "test", 2);
  if (scriptChecks.length) return scriptChecks;
  const paths = new Set(files.map(file => normalizeRepoPath(file.path)));
  if (paths.has("Cargo.toml")) return ["cargo test"];
  if (paths.has("go.mod")) return ["go test ./..."];
  if (paths.has("pom.xml")) return ["mvn test"];
  if (paths.has("build.gradle") || paths.has("build.gradle.kts")) return ["./gradlew test"];
  if (paths.has("book.toml") || paths.has("src/SUMMARY.md")) return ["mdbook test"];
  if (paths.has("pyproject.toml") || paths.has("pytest.ini") || paths.has("tox.ini") || files.some(file => file.isTest || isTestPath(file.path))) {
    return ["python -m pytest"];
  }
  return [];
}

function inferDocsChecks(files: FileSummary[], scripts: PackageScript[], packageManager: "npm" | "pnpm" | "yarn" | "bun"): string[] {
  const scriptChecks = scriptChecksFor(scripts, packageManager, "docs", 1);
  if (scriptChecks.length) return scriptChecks;
  const paths = new Set(files.map(file => normalizeRepoPath(file.path)));
  if (paths.has("book.toml") || paths.has("src/SUMMARY.md")) return ["mdbook build"];
  if (paths.has("mkdocs.yml") || paths.has("mkdocs.yaml")) return ["mkdocs build"];
  if (paths.has("docs/conf.py")) return ["sphinx-build docs docs/_build"];
  if (paths.has("Cargo.toml")) return ["cargo doc --no-deps"];
  return [];
}

function scriptChecksFor(
  scripts: PackageScript[],
  packageManager: "npm" | "pnpm" | "yarn" | "bun",
  category: "build" | "test" | "docs",
  limit: number
): string[] {
  return uniqueCommands(scripts
    .map(script => ({ script, score: scriptScore(script.name, category) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.script.name.localeCompare(right.script.name))
    .slice(0, limit)
    .map(item => formatPackageScriptCommand(item.script, packageManager)));
}

function scriptScore(name: string, category: "build" | "test" | "docs"): number {
  const lowerName = name.toLowerCase();
  if (category === "test") {
    if (lowerName === "test") return 100;
    if (lowerName === "test:ci" || lowerName === "ci:test") return 95;
    if (/^(test|tests)(:|$)|(:|-)test$/u.test(lowerName)) return 80;
    if (lowerName.includes("vitest") || lowerName.includes("pytest")) return 60;
  }
  if (category === "build") {
    if (lowerName === "build") return 100;
    if (lowerName === "compile") return 90;
    if (lowerName === "typecheck" || lowerName === "check") return 70;
    if (/^(build|compile)(:|$)|(:|-)build$/u.test(lowerName)) return 60;
  }
  if (category === "docs") {
    if (lowerName === "docs:build" || lowerName === "build:docs") return 100;
    if (lowerName === "docs" || lowerName === "doc") return 90;
    if (lowerName.includes("docs") || lowerName.includes("doc")) return 70;
  }
  return 0;
}

function formatPackageScriptCommand(script: PackageScript, packageManager: "npm" | "pnpm" | "yarn" | "bun"): string {
  const manifestDir = path.posix.dirname(normalizeRepoPath(script.manifestPath));
  const inRoot = manifestDir === ".";
  if (packageManager === "pnpm") return inRoot ? `pnpm run ${script.name}` : `pnpm --dir ${manifestDir} run ${script.name}`;
  if (packageManager === "yarn") return inRoot ? `yarn ${script.name}` : `yarn --cwd ${manifestDir} ${script.name}`;
  if (packageManager === "bun") return inRoot ? `bun run ${script.name}` : `bun --cwd ${manifestDir} run ${script.name}`;
  if (script.name === "test") return inRoot ? "npm test" : `npm --prefix ${manifestDir} test`;
  return inRoot ? `npm run ${script.name}` : `npm --prefix ${manifestDir} run ${script.name}`;
}

function atreeCheckCommand(
  scripts: PackageScript[],
  packageManager: "npm" | "pnpm" | "yarn" | "bun",
  action: "scan" | "validate",
  fallback: string
): string {
  const script = scripts.find(candidate => candidate.manifestPath === "package.json" && candidate.name === `atree:${action}`);
  return script ? formatPackageScriptCommand(script, packageManager) : fallback;
}

function filesMatchingPatterns(files: string[], patterns: string[]): string[] {
  const matchers = patterns.map(simpleGlobMatcher);
  return files.filter(file => matchers.some(matches => matches(file)));
}

function simpleGlobMatcher(pattern: string): (filePath: string) => boolean {
  const normalized = normalizeRepoPath(pattern).replace(/^\//u, "");
  let regex = "";
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized.startsWith("**/", index)) {
      regex += "(?:.*/)?";
      index += 2;
    } else if (normalized.startsWith("**", index)) {
      regex += ".*";
      index += 1;
    } else if (normalized[index] === "*") {
      regex += "[^/]*";
    } else {
      regex += escapeRegex(normalized[index]);
    }
  }
  const compiled = new RegExp(`^${regex}$`, "u");
  return filePath => compiled.test(normalizeRepoPath(filePath));
}

function prioritizedPaths(paths: string[], relevantFiles: string[], tokens: string[]): string[] {
  const relevant = new Set(relevantFiles.map(normalizeRepoPath));
  return uniqueStable(paths).sort((left, right) =>
    pathRelevanceScore(right, relevant, tokens) - pathRelevanceScore(left, relevant, tokens) ||
    left.localeCompare(right));
}

function pathRelevanceScore(filePath: string, relevantFiles: Set<string>, tokens: string[]): number {
  const normalized = normalizeRepoPath(filePath);
  const pathTokens = tokenize(normalized);
  return (relevantFiles.has(normalized) ? 10 : 0) +
    scoreTokenOverlap(tokens, pathTokens) +
    (path.basename(normalized).toLowerCase() === "readme.md" ? 1 : 0);
}

function fallbackImplementationFiles(files: string[]): string[] {
  return files.filter(file => isImplementationPath(file, files)).slice(0, 5);
}

function fallbackDocFiles(files: string[]): string[] {
  const readme = files.find(file => /^readme\./u.test(path.basename(file).toLowerCase()));
  if (readme) return [readme];
  const docFile = files.find(file => [".md", ".mdx", ".rst", ".adoc", ".txt"].some(extension => file.toLowerCase().endsWith(extension)));
  return docFile ? [docFile] : ["README.md"];
}

function isImplementationPath(filePath: string, allPaths: string[]): boolean {
  return !isDocPath(filePath, allPaths) && !isTestPath(filePath) && !isBuildPath(filePath) && !normalizeRepoPath(filePath).startsWith(".abstraction-tree/");
}

function isDocPath(filePath: string, allPaths: string[]): boolean {
  const normalized = normalizeRepoPath(filePath);
  const lowerPath = normalized.toLowerCase();
  const basename = path.basename(lowerPath);
  const hasMdBook = allPaths.includes("book.toml") || allPaths.includes("src/SUMMARY.md");
  const docExtension = [".md", ".mdx", ".rst", ".adoc", ".txt"].some(extension => lowerPath.endsWith(extension));
  return docExtension && (
    lowerPath.startsWith("docs/") ||
    lowerPath.startsWith("doc/") ||
    lowerPath.startsWith("book/") ||
    lowerPath.startsWith("website/") ||
    (hasMdBook && lowerPath.startsWith("src/")) ||
    /^(readme|changelog|contributing|roadmap)\./u.test(basename)
  );
}

function isTestPath(filePath: string): boolean {
  const normalized = normalizeRepoPath(filePath);
  const basename = path.basename(normalized);
  return /(^|\/)(__tests__|tests?|spec)\//iu.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/iu.test(normalized) ||
    /^test_/iu.test(basename) ||
    /_test\.[a-z0-9]+$/iu.test(basename);
}

function isBuildPath(filePath: string): boolean {
  const normalized = normalizeRepoPath(filePath);
  const basename = path.basename(normalized);
  return [
    "package.json",
    "package-lock.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "setup.cfg",
    "tox.ini",
    "noxfile.py",
    "pytest.ini",
    "Cargo.toml",
    "Cargo.lock",
    "go.mod",
    "go.sum",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "Makefile",
    "mkdocs.yml",
    "mkdocs.yaml",
    "conf.py",
    "book.toml"
  ].includes(basename) || /(^|\/)(vite|vitest|webpack|rollup|tsup|tsconfig|eslint|prettier|ruff|mypy)\.config\./iu.test(normalized);
}

function configuredCommands(commands: string[] | undefined): string[] | undefined {
  const configured = uniqueCommands(commands ?? []);
  return configured.length ? configured : undefined;
}

function withFallback(values: string[], fallback: string[]): string[] {
  return values.length ? values : fallback;
}

function uniqueCommands(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function isPlaceholderScript(command: string): boolean {
  return /no test specified|exit 1|todo|placeholder/iu.test(command);
}

function readJsonRecord(filePath: string): Record<string, unknown> | undefined {
  if (!filePath || !existsSync(filePath)) return undefined;
  try {
    return objectRecord(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return undefined;
  }
}

function resolveInsideProject(root: string, relativePath: string): string | undefined {
  const absolutePath = path.resolve(root, normalizeRepoPath(relativePath));
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return absolutePath;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

function normalizeMissionDependencies(
  spec: Omit<GoalMissionSummary, "id" | "source_goal" | "parallelGroup" | "parallelGroupSafe">,
  slug: string,
  index: number
): Omit<GoalMissionSummary, "id" | "source_goal" | "parallelGroup" | "parallelGroupSafe"> {
  if (index === 0) return { ...spec, dependsOn: [] };
  const previousSuffixes = [
    "scope-and-invariants",
    "implementation",
    "tests-and-validation",
    "docs-and-memory"
  ];
  const fixedDependsOn = spec.dependsOn.map(dependency => dependency
    .replace(`${slug}-01-implementation`, `${slug}-01-implementation`)
    .replace(`${slug}-02-tests-and-validation`, `${slug}-02-tests-and-validation`)
    .replace(`${slug}-03-docs-and-memory`, `${slug}-03-docs-and-memory`));
  if (fixedDependsOn.length) return { ...spec, dependsOn: fixedDependsOn };
  return { ...spec, dependsOn: [`${slug}-${String(index - 1).padStart(2, "0")}-${previousSuffixes[index - 1] ?? "mission"}`] };
}

function formatMissionMarkdown(mission: GoalMissionSummary, goalText: string): string {
  const sourceSummary = summarizeGoal(goalText);
  return [
    "---",
    `id: ${mission.id}`,
    `title: ${quoteYaml(mission.title)}`,
    `priority: ${mission.priority}`,
    `risk: ${mission.risk}`,
    `category: ${mission.category}`,
    `parallelGroup: ${mission.parallelGroup}`,
    `parallelGroupSafe: ${mission.parallelGroupSafe ? "true" : "false"}`,
    "affectedFiles:",
    ...frontmatterList(mission.affectedFiles),
    "affectedNodes:",
    ...frontmatterList(mission.affectedNodes),
    "dependsOn:",
    ...frontmatterList(mission.dependsOn),
    "---",
    "",
    "# Mission",
    "",
    "## Goal",
    mission.title,
    "",
    "## Source Goal",
    `Reference ${mission.source_goal}.`,
    "",
    "## Abstraction Tree Position",
    `Layers: ${mission.expected_affected_areas.join(", ") || "project"}.`,
    `Nodes: ${mission.affectedNodes.join(", ") || "project.intent"}.`,
    "",
    "## Why This Matters",
    `This mission keeps a complex goal bounded by turning one slice of "${sourceSummary}" into a reviewable change.`,
    "",
    "## Scope",
    ...mission.affectedFiles.map(file => `- ${file}`),
    "",
    "## Out of Scope",
    "- Pushes, merges, secret edits, unrelated refactors, and broad rewrites.",
    "- Changes outside the affected files unless the run report explains why the scope had to move.",
    "",
    "## Expected Affected Areas",
    ...mission.expected_affected_areas.map(area => `- ${area}`),
    "",
    "## Required Checks",
    ...mission.success_checks.map(check => `- ${check}`),
    "",
    "## Success Criteria",
    "- The mission produces one bounded, testable improvement.",
    "- The final diff matches the original goal and the listed abstraction tree position.",
    "- Any skipped work or failed check is reported honestly.",
    "",
    "## Required Report",
    "- Write a run report in `.abstraction-tree/runs/`.",
    "- Write or update one concise lesson in `.abstraction-tree/lessons/`.",
    "- Note whether the goal workspace needs a coherence-review update.",
    ""
  ].join("\n");
}

function formatGoalAssessment(input: {
  goalText: string;
  affectedTree: GoalAffectedTree;
  selectedNodes: Array<ScoredItem<TreeNode>>;
  selectedConcepts: Array<ScoredItem<Concept>>;
  selectedFiles: Array<ScoredItem<FileSummary>>;
  selectedInvariants: Invariant[];
  selectedLayers: GoalLayer[];
  missions: GoalMissionFile[];
  tokens: string[];
  changes: ChangeRecord[];
  evaluations: Record<string, unknown>[];
}): string {
  const files = input.selectedFiles.map(file => normalizeRepoPath(file.item.path));
  return [
    "# Goal Assessment",
    "",
    "## Original Goal Summary",
    summarizeGoal(input.goalText),
    "",
    "## Interpreted User Intent",
    "Use the repository abstraction tree to scope the request, decompose it into bounded missions, and keep execution reviewable.",
    "",
    "## Affected Abstraction Layers",
    ...listOrNone(input.selectedLayers),
    "",
    "## Relevant Tree Nodes",
    ...listOrNone(input.selectedNodes.map(node => `${node.item.id}: ${node.item.title} (${node.reasons.join(" ")})`)),
    "",
    "## Relevant Concepts",
    ...listOrNone(input.selectedConcepts.map(concept => `${concept.item.id}: ${concept.item.title}`)),
    "",
    "## Relevant Files",
    ...listOrNone(files),
    "",
    "## Invariants / Safety Constraints",
    ...listOrNone([
      "Do not push, merge, edit secrets, or mark execution complete when checks fail.",
      "Preserve the original goal text exactly in the goal workspace.",
      "Use deterministic heuristics first; do not claim LLM semantic intelligence.",
      ...input.selectedInvariants.map(invariant => `${invariant.id}: ${invariant.title}`)
    ]),
    "",
    "## Likely Required Changes",
    ...listOrNone(likelyRequiredChanges(input.tokens, files)),
    "",
    "## Explicit Non-Goals",
    "- Replacing the repository's existing development, release, or deployment process.",
    "- Running Codex automatically without a review gate.",
    "- Auto-pushing or auto-merging generated changes.",
    "",
    "## Risks",
    ...listOrNone(goalRisks(input.selectedFiles, input.selectedLayers)),
    "",
    "## Open Questions / Assumptions",
    ...listOrNone([
      "Assumption: review-required remains the safe default until mission execution can be called with stronger guardrails.",
      "Assumption: generated missions should stay compatible with the existing mission runner schema.",
      input.changes.length ? `Recent change records available: ${input.changes.length}.` : "No recent change records were required for this deterministic plan.",
      input.evaluations.length ? `Evaluation reports available: ${input.evaluations.length}.` : "No evaluation trend was required for this deterministic plan."
    ]),
    "",
    "## Recommended Mission Breakdown",
    ...input.missions.map(mission => `- ${mission.mission.id}: ${mission.mission.title}`),
    "",
    "## Completion Criteria",
    "- `atree goal --file <file> --plan-only` creates a complete goal workspace.",
    "- Generated mission files validate against the mission runner frontmatter/body expectations.",
    "- Review-required mode prints the exact mission runner commands to use next.",
    "- Full-auto refuses clearly until safe execution is implemented.",
    "- Create-pr mode writes a PR body without pushing or merging.",
    ""
  ].join("\n");
}

function formatCoherenceReview(input: { mode: GoalMode; goalText: string }): string {
  const status = input.mode === "full-auto" || input.mode === "run"
    ? "execution refused in this safe first version"
    : "pending execution";
  return [
    "# Goal Coherence Review",
    "",
    "## Original Goal",
    summarizeGoal(input.goalText),
    "",
    "## Mission Plan Alignment",
    status,
    "",
    "## Missions Completed",
    "None yet.",
    "",
    "## Missions Failed",
    "None yet.",
    "",
    "## Scope Check Result",
    status,
    "",
    "## Validation / Evaluation Result",
    status,
    "",
    "## Docs / Tests / Tree Memory Alignment",
    status,
    "",
    "## Expected vs Actual Affected Areas",
    status,
    "",
    "## Overreach Risks",
    "No implementation diff has been reviewed yet.",
    "",
    "## What Remains Incomplete",
    "Mission execution, checks, scope check, and post-run coherence review have not been performed by this command.",
    "",
    "## Final Verdict",
    input.mode === "full-auto" || input.mode === "run" ? "execution-refused" : "planned",
    ""
  ].join("\n");
}

function formatFinalReport(input: {
  status: GoalStatus;
  workspaceRelativePath: string;
  missionDirRelativePath: string;
  reviewCommands: string[];
  fullAutoRefused: boolean;
  createPr: boolean;
}): string {
  return [
    "# Goal Final Report",
    "",
    "## Status",
    input.fullAutoRefused ? "execution-refused" : input.status,
    "",
    "## Goal Workspace",
    input.workspaceRelativePath,
    "",
    "## Mission Folder",
    input.missionDirRelativePath,
    "",
    "## Recommended Next Command",
    ...input.reviewCommands.map(command => `- ${command}`),
    "",
    "## Risks",
    ...listOrNone([
      input.fullAutoRefused ? "Full-auto execution was not run; use review-required flow until safe runner integration is added." : "",
      input.createPr ? "PR body is draft planning material until missions and checks are executed." : "",
      "Generated mission plans use deterministic lexical mapping and require human review for subtle semantic scope."
    ].filter(Boolean)),
    "",
    "## Manual Review Notes",
    "Review the goal assessment and mission files before running mission execution.",
    ""
  ].join("\n");
}

function formatPrBody(input: {
  goalText: string;
  missionPlan: GoalMissionPlan;
  fullAutoRefused: boolean;
}): string {
  return [
    "# Goal-Driven Abstraction Tree PR",
    "",
    "## Original Goal",
    summarizeGoal(input.goalText),
    "",
    "## Mission Plan",
    ...input.missionPlan.missions.map(mission => `- ${mission.id}: ${mission.title}`),
    "",
    "## Missions Run",
    input.fullAutoRefused ? "- None. Full-auto execution was refused by the safe first implementation." : "- None. This PR body was prepared after deterministic planning only.",
    "",
    "## Key Changes",
    "- Goal workspace and mission plan are ready for review.",
    "",
    "## Validation / Evaluation",
    "- Pending mission execution.",
    "",
    "## Coherence Review",
    "- Pending mission execution.",
    "",
    "## Risks",
    "- Mission execution, checks, and final coherence review still require manual approval.",
    "",
    "## Manual Review Required",
    "- Review generated missions before running Codex through the mission runner.",
    "",
    "## Follow-Up",
    "- Run the mission plan and update this body with actual changes and validation results.",
    ""
  ].join("\n");
}

function scoreFiles(files: FileSummary[], goalTokens: string[]): Array<ScoredItem<FileSummary>> {
  return files
    .map(file => {
      const directScore = scoreTokenOverlap(goalTokens, tokenize([
        file.path,
        file.summary,
        file.language,
        ...file.imports,
        ...file.exports,
        ...file.symbols
      ].join(" ")));
      const boost = filePathBoost(file.path, goalTokens);
      const score = directScore + boost;
      return {
        id: file.path,
        item: file,
        score,
        reasons: reasonsForScore([
          directScore > 0 ? "Goal terms matched file path, summary, symbols, imports, or exports." : "",
          boost > 0 ? "File path matched a project area implied by the goal." : ""
        ], "Selected as a fallback relevant file.")
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function scoreNodes(
  nodes: TreeNode[],
  scoredFiles: Array<ScoredItem<FileSummary>>,
  goalTokens: string[]
): Array<ScoredItem<TreeNode>> {
  const fileScores = new Map(scoredFiles.map(file => [file.item.path, file.score]));
  return nodes
    .map(node => {
      const nodeFiles = uniqueStable([...node.sourceFiles, ...node.ownedFiles].map(normalizeRepoPath));
      const fileScore = nodeFiles
        .map(filePath => fileScores.get(filePath) ?? 0)
        .sort((left, right) => right - left)
        .slice(0, 4)
        .reduce((sum, score) => sum + score, 0);
      const directScore = scoreTokenOverlap(goalTokens, tokenize([
        node.id,
        node.name,
        node.title,
        node.level,
        node.summary,
        ...node.responsibilities,
        ...nodeFiles
      ].join(" ")));
      const breadthPenalty = nodeFiles.length > 25 ? Math.min(5, nodeFiles.length / 25) : 0;
      const score = directScore + Math.min(fileScore, 10) - breadthPenalty;
      return {
        id: node.id,
        item: node,
        score,
        reasons: reasonsForScore([
          directScore > 0 ? "Goal terms matched node identity, summary, or responsibilities." : "",
          fileScore > 0 ? "Node owns files selected by the goal-file mapper." : ""
        ], "Selected as a project fallback node.")
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function scoreConcepts(
  concepts: Concept[],
  goalTokens: string[],
  scoredFiles: Array<ScoredItem<FileSummary>>
): Array<ScoredItem<Concept>> {
  const fileScores = new Map(scoredFiles.map(file => [file.item.path, file.score]));
  return concepts
    .map(concept => {
      const directScore = scoreTokenOverlap(goalTokens, tokenize([
        concept.id,
        concept.title,
        concept.summary,
        ...concept.tags,
        ...concept.relatedFiles,
        ...concept.evidence.map(evidence => `${evidence.term} ${evidence.value}`)
      ].join(" ")));
      const relatedFileScore = concept.relatedFiles
        .map(filePath => fileScores.get(normalizeRepoPath(filePath)) ?? 0)
        .sort((left, right) => right - left)
        .slice(0, 3)
        .reduce((sum, score) => sum + score, 0);
      const score = directScore + Math.min(relatedFileScore, 6);
      return {
        id: concept.id,
        item: concept,
        score,
        reasons: reasonsForScore([
          directScore > 0 ? "Goal terms matched concept title, tags, summary, or evidence." : "",
          relatedFileScore > 0 ? "Concept relates to files selected by the goal-file mapper." : ""
        ], "Selected as a project fallback concept.")
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function selectNodes(
  nodes: TreeNode[],
  scoredNodes: Array<ScoredItem<TreeNode>>,
  scoredFiles: Array<ScoredItem<FileSummary>>
): Array<ScoredItem<TreeNode>> {
  const selected = topScored(scoredNodes, 8);
  if (selected.length) return selected;
  const projectNode = nodes.find(node => node.id === "project.intent") ?? nodes[0];
  if (!projectNode) return [];
  return [{
    id: projectNode.id,
    item: projectNode,
    score: scoredFiles.length ? 1 : 0.5,
    reasons: ["Selected as a project fallback node because the goal did not match a more specific node."]
  }];
}

function selectInvariants(
  invariants: Invariant[],
  selectedNodes: Array<ScoredItem<TreeNode>>,
  selectedFiles: Array<ScoredItem<FileSummary>>,
  goalTokens: string[]
): Invariant[] {
  const nodeIds = new Set(selectedNodes.map(node => node.item.id));
  const files = new Set(selectedFiles.map(file => normalizeRepoPath(file.item.path)));
  return invariants
    .map(invariant => ({
      invariant,
      score: scoreTokenOverlap(goalTokens, tokenize(`${invariant.id} ${invariant.title} ${invariant.description}`)) +
        invariant.nodeIds.filter(id => nodeIds.has(id)).length * 2 +
        invariant.filePaths.filter(filePath => files.has(normalizeRepoPath(filePath))).length * 2
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.invariant.id.localeCompare(right.invariant.id))
    .slice(0, 8)
    .map(item => item.invariant);
}

function inferLayers(
  nodes: TreeNode[],
  files: FileSummary[],
  tokens: string[]
): GoalLayer[] {
  const layers = new Set<GoalLayer>();
  for (const node of nodes) {
    for (const layer of allLayers) {
      if (tokenize(`${node.id} ${node.level} ${node.title}`).includes(layer)) layers.add(layer);
    }
    if (node.id.startsWith("architecture.") || node.level.includes("architecture")) layers.add("architecture");
    if (node.id.startsWith("module.") || node.level.includes("module")) layers.add("module");
    if (node.id.startsWith("file.") || node.level.includes("file")) layers.add("file");
    if (node.id.startsWith("project.") || node.level.includes("project")) layers.add("project");
  }
  for (const file of files) {
    for (const layer of layersForFile(file.path)) layers.add(layer);
  }
  if (tokens.some(token => ["schema", "data", "model", "migration"].includes(token))) layers.add("schema");
  if (tokens.some(token => ["function", "api", "method"].includes(token))) layers.add("function");
  if (!layers.size) layers.add("project");
  return allLayers.filter(layer => layers.has(layer));
}

function layersForFile(filePath: string): GoalLayer[] {
  const normalized = normalizeRepoPath(filePath);
  const pathTokens = tokenize(normalized);
  const layers = new Set<GoalLayer>(["file"]);
  if (pathTokens.some(token => ["cli", "command", "commands", "bin"].includes(token))) layers.add("cli");
  if (pathTokens.some(token => ["src", "lib", "module", "modules", "package", "packages", "app", "backend", "frontend", "service", "services"].includes(token))) {
    layers.add("module");
  }
  if (normalized.endsWith(".md") || normalized.startsWith("docs/") || normalized.startsWith("doc/")) layers.add("docs");
  if (isTestPath(normalized)) layers.add("tests");
  if (/schema|migration|model|runtimeSchema/u.test(normalized)) layers.add("schema");
  return allLayers.filter(layer => layers.has(layer));
}

function likelyRequiredChanges(tokens: string[], files: string[]): string[] {
  const changes = new Set<string>();
  if (tokens.some(token => ["goal", "autopilot", "mission", "prompt"].includes(token))) {
    changes.add("Update the repository workflow that maps broad requests into bounded implementation work.");
  }
  if (tokens.includes("cli") || tokens.includes("command")) changes.add("Update the command surface or command documentation.");
  if (files.some(file => tokenize(file).some(token => ["app", "frontend", "ui", "component"].includes(token)))) {
    changes.add("Adjust user-facing application behavior only where the goal requires it.");
  }
  changes.add("Add or update tests, documentation, and project memory when the implementation changes them.");
  return [...changes];
}

function goalRisks(selectedFiles: Array<ScoredItem<FileSummary>>, layers: GoalLayer[]): string[] {
  const risks = [
    "Lexical scoring can miss subtle semantic coupling; generated plans need review.",
    "Mission execution must remain separate from planning until the runner can enforce safety and coherence."
  ];
  if (selectedFiles.length > 10) risks.push("The goal touches many candidate files, so scope may need manual narrowing.");
  if (layers.includes("schema")) risks.push("Schema changes can affect persisted abstraction memory and require migration care.");
  if (layers.includes("cli")) risks.push("CLI command changes need tests for user-facing failures and mode behavior.");
  return risks;
}

function confidenceFor(score: number): number {
  return Math.max(0.5, Math.min(0.95, Number((0.5 + score / 20).toFixed(2))));
}

function filePathBoost(filePath: string, goalTokens: string[]): number {
  const lowerPath = normalizeRepoPath(filePath).toLowerCase();
  const pathTokens = tokenize(lowerPath);
  let score = 0;
  if (goalTokens.includes("cli") && pathTokens.some(token => ["cli", "command", "commands", "bin"].includes(token))) score += 3;
  if (goalTokens.includes("core") && pathTokens.some(token => ["core", "src", "lib", "engine"].includes(token))) score += 3;
  if ((goalTokens.includes("app") || goalTokens.includes("ui")) && pathTokens.some(token => ["app", "ui", "frontend", "component", "components"].includes(token))) score += 3;
  if ((goalTokens.includes("mission") || goalTokens.includes("runner")) && lowerPath.includes("mission")) score += 4;
  if ((goalTokens.includes("goal") || goalTokens.includes("autopilot")) && lowerPath.includes("goal")) score += 4;
  if ((goalTokens.includes("self") || goalTokens.includes("improvement")) && lowerPath.includes("self")) score += 2;
  if ((goalTokens.includes("scope") || goalTokens.includes("overreach")) && lowerPath.includes("scope")) score += 4;
  if (goalTokens.includes("docs") && (lowerPath.startsWith("docs/") || lowerPath.startsWith("doc/") || lowerPath.endsWith(".md"))) score += 3;
  if (goalTokens.includes("test") && isTestPath(lowerPath)) score += 3;
  return score;
}

function scoreTokenOverlap(needles: string[], haystack: string[]): number {
  const haystackSet = new Set(haystack);
  let score = 0;
  for (const token of needles) {
    if (haystackSet.has(token)) {
      score += 2;
    } else if (token.length > 3 && haystack.some(candidate => candidate.includes(token) || token.includes(candidate))) {
      score += 0.5;
    }
  }
  return score;
}

function topScored<T>(items: Array<ScoredItem<T>>, limit: number): Array<ScoredItem<T>> {
  return items.filter(item => item.score > 0).sort(scoreSort).slice(0, limit);
}

function mergeScoredItems<T>(primary: Array<ScoredItem<T>>, secondary: Array<ScoredItem<T>>): Array<ScoredItem<T>> {
  const merged = new Map<string, ScoredItem<T>>();
  for (const item of [...primary, ...secondary]) {
    const existing = merged.get(item.id);
    merged.set(item.id, {
      ...item,
      score: (existing?.score ?? 0) + item.score,
      reasons: uniqueReasonStrings([...(existing?.reasons ?? []), ...item.reasons])
    });
  }
  return [...merged.values()].filter(item => item.score > 0).sort(scoreSort);
}

function scoreSort<T>(left: ScoredItem<T>, right: ScoredItem<T>): number {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function tokenize(text: string): string[] {
  return [...new Set(text
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(token => token.length > 1 && !stopWords.has(token)))];
}

function slugFromInput(goalFile: string | undefined, goalText: string): string {
  const source = goalFile ? path.basename(goalFile, path.extname(goalFile)) : summarizeGoal(goalText);
  const slug = source
    .replace(/([a-z])([A-Z])/gu, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return slug || "goal";
}

function goalId(date: Date, slug: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    `${pad(date.getHours())}${pad(date.getMinutes())}`,
    slug
  ].join("-");
}

function summarizeGoal(goalText: string): string {
  const summary = goalText.trim().replace(/\s+/gu, " ");
  if (summary.length <= 220) return summary || "No goal supplied.";
  return `${summary.slice(0, 217).trim()}...`;
}

function missionSuffix(index: number, title: string): string {
  if (index === 0) return "scope-and-invariants";
  if (/implement|product|core|cli/u.test(title.toLowerCase())) return "implementation";
  if (/test|verify|validation/u.test(title.toLowerCase())) return "tests-and-validation";
  if (/document|memory/u.test(title.toLowerCase())) return "docs-and-memory";
  if (/coherence/u.test(title.toLowerCase())) return "coherence-review";
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32) || `mission-${index}`;
}

function frontmatterList(values: string[]): string[] {
  if (!values.length) return ["  []"];
  return values.map(value => `  - ${quoteYaml(value)}`);
}

function quoteYaml(value: string): string {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
}

function listOrNone(values: string[]): string[] {
  return values.length ? values.map(value => `- ${value}`) : ["- None found."];
}

function uniqueStable(values: string[]): string[] {
  return [...new Set(values.map(normalizeRepoPath).filter(Boolean))];
}

function uniqueReasonStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueLayers(values: GoalLayer[]): GoalLayer[] {
  const set = new Set(values);
  return allLayers.filter(layer => set.has(layer));
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function reasonsForScore(reasons: string[], fallback: string): string[] {
  const cleaned = reasons.filter(Boolean);
  return cleaned.length ? cleaned : [fallback];
}
