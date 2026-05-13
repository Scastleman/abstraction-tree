import path from "node:path";
import type { ChangeRecord, Concept, FileSummary, Invariant, TreeNode } from "./schema.js";

export type GoalMode = "plan-only" | "review-required" | "full-auto" | "create-pr";
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
  reviewCommands: string[];
  selectedLayers: GoalLayer[];
}

interface ScoredItem<T> {
  id: string;
  item: T;
  score: number;
  reasons: string[];
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
  const scoredFiles = scoreFiles(input.files, tokens);
  const scoredNodes = scoreNodes(input.nodes, scoredFiles, tokens);
  const scoredConcepts = scoreConcepts(input.concepts, tokens, scoredFiles);
  const selectedFiles = topScored(scoredFiles, 12);
  const selectedNodes = selectNodes(input.nodes, scoredNodes, selectedFiles);
  const selectedConcepts = topScored(scoredConcepts, 8);
  const selectedInvariants = selectInvariants(input.invariants, selectedNodes, selectedFiles, tokens);
  const selectedLayers = inferLayers(selectedNodes.map(score => score.item), selectedFiles.map(score => score.item), tokens);
  const affectedTree = buildAffectedTree(id, selectedNodes, selectedConcepts, selectedFiles, selectedInvariants);
  const metadata: GoalMetadata = {
    id,
    created_at: createdAtIso,
    source: "file",
    goal_file: normalizeRepoPath(input.goalFile ?? ""),
    mode: input.mode,
    status: input.mode === "full-auto" ? "execution-refused" : "planned",
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
    tokens
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
    coherenceReviewMarkdown: formatCoherenceReview(input.mode),
    finalReportMarkdown: formatFinalReport({
      status: metadata.status,
      workspaceRelativePath,
      missionDirRelativePath,
      reviewCommands,
      fullAutoRefused: input.mode === "full-auto",
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
}): GoalMissionFile[] {
  const group = input.goalId;
  const relevantFiles = input.selectedFiles.map(file => normalizeRepoPath(file.item.path));
  const relevantNodes = input.selectedNodes.map(node => node.item.id);
  const missionSpecs: Omit<GoalMissionSummary, "id" | "source_goal" | "parallelGroup" | "parallelGroupSafe">[] = [];

  missionSpecs.push({
    title: "Map scope, invariants, and non-goals",
    priority: "P0",
    risk: "low",
    category: "safety",
    affectedFiles: uniqueStable([
      ".abstraction-tree/tree.json",
      ".abstraction-tree/invariants.json",
      ...relevantFiles.filter(file => file.startsWith("docs/")).slice(0, 2)
    ]),
    affectedNodes: relevantNodes.slice(0, 5),
    dependsOn: [],
    expected_affected_areas: uniqueLayers(["project", ...input.selectedLayers]),
    success_checks: ["npm run atree:validate"]
  });

  if (needsCoreOrCliMission(input.tokens, relevantFiles)) {
    missionSpecs.push({
      title: "Implement bounded core and CLI workflow",
      priority: "P1",
      risk: "medium",
      category: "product-value",
      affectedFiles: uniqueStable([
        ...relevantFiles.filter(file => file.startsWith("packages/core/") || file.startsWith("packages/cli/")).slice(0, 8),
        "packages/core/src/goal.ts",
        "packages/cli/src/goalCommand.ts",
        "packages/cli/src/index.ts",
        "package.json"
      ]),
      affectedNodes: relevantNodes.filter(node => /core|cli|package|architecture/u.test(node)).slice(0, 6),
      dependsOn: [`${input.slug}-00-scope-and-invariants`],
      expected_affected_areas: uniqueLayers(["module", "cli", "file", ...input.selectedLayers]),
      success_checks: ["npm run build", "npm test"]
    });
  } else {
    missionSpecs.push({
      title: "Implement the smallest useful product change",
      priority: "P1",
      risk: "medium",
      category: "product-value",
      affectedFiles: uniqueStable(relevantFiles.slice(0, 10)),
      affectedNodes: relevantNodes.slice(0, 6),
      dependsOn: [`${input.slug}-00-scope-and-invariants`],
      expected_affected_areas: uniqueLayers(input.selectedLayers.length ? input.selectedLayers : ["module", "file"]),
      success_checks: ["npm run build", "npm test"]
    });
  }

  if (input.selectedLayers.includes("tests") || input.tokens.some(token => ["test", "tests", "validation", "validate", "quality"].includes(token))) {
    missionSpecs.push({
      title: "Add deterministic tests and validation coverage",
      priority: "P1",
      risk: "medium",
      category: "quality",
      affectedFiles: uniqueStable([
        ...relevantFiles.filter(file => file.includes(".test.")).slice(0, 8),
        "packages/core/src/goal.test.ts",
        "packages/cli/src/goalCommand.test.ts"
      ]),
      affectedNodes: relevantNodes.filter(node => /test|core|cli|quality/u.test(node)).slice(0, 6),
      dependsOn: [missionSpecs[1]?.title ? `${input.slug}-01-implementation` : `${input.slug}-00-scope-and-invariants`],
      expected_affected_areas: ["tests"],
      success_checks: ["npm test", "npm run atree:validate"]
    });
  } else {
    missionSpecs.push({
      title: "Verify behavior with deterministic checks",
      priority: "P2",
      risk: "low",
      category: "quality",
      affectedFiles: uniqueStable([
        ...relevantFiles.filter(file => file.includes(".test.")).slice(0, 5),
        "packages/core/src/goal.test.ts",
        "packages/cli/src/goalCommand.test.ts"
      ]),
      affectedNodes: relevantNodes.slice(0, 5),
      dependsOn: [`${input.slug}-01-implementation`],
      expected_affected_areas: ["tests"],
      success_checks: ["npm test", "npm run atree:validate"]
    });
  }

  missionSpecs.push({
    title: "Document workflow and update durable memory",
    priority: "P2",
    risk: "low",
    category: "developer-experience",
    affectedFiles: uniqueStable([
      ...relevantFiles.filter(file => file.endsWith(".md")).slice(0, 6),
      "README.md",
      "docs/FULL_SELF_IMPROVEMENT_LOOP.md",
      "docs/MISSION_RUNNER.md",
      "docs/ROADMAP.md"
    ]),
    affectedNodes: relevantNodes.filter(node => /docs|readme|memory|project/u.test(node)).slice(0, 6),
    dependsOn: [`${input.slug}-02-tests-and-validation`],
    expected_affected_areas: ["docs", "project"],
    success_checks: ["npm run atree:scan", "npm run atree:validate"]
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
    success_checks: ["git diff --check", "npm run atree:validate"]
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
    "Use Abstraction Tree as a prompt-to-mission compiler so complex user goals are scoped, decomposed, reviewed, and executed through existing project safety machinery.",
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
    "- Replacing the existing self-improvement loop.",
    "- Running Codex automatically without a review gate in the first safe version.",
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

function formatCoherenceReview(mode: GoalMode): string {
  const status = mode === "full-auto" ? "execution refused in this safe first version" : "pending execution";
  return [
    "# Goal Coherence Review",
    "",
    "## Did The Missions Match The Original Goal?",
    status,
    "",
    "## Did The Missions Stay In Scope?",
    status,
    "",
    "## Were Expected Affected Areas Respected?",
    status,
    "",
    "## Are Docs / Tests / Tree Memory Aligned?",
    status,
    "",
    "## Did Validation Pass?",
    status,
    "",
    "## Did Evaluation Improve Or Worsen?",
    status,
    "",
    "## What Remains Incomplete?",
    "Mission execution has not been performed by this command.",
    "",
    "## Final Verdict",
    "planned",
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
  const layers = new Set<GoalLayer>(["file"]);
  if (normalized.startsWith("packages/cli/")) layers.add("cli");
  if (normalized.startsWith("packages/core/") || normalized.startsWith("packages/app/")) layers.add("module");
  if (normalized.endsWith(".md") || normalized.startsWith("docs/")) layers.add("docs");
  if (normalized.includes(".test.") || normalized.includes("/test/") || normalized.includes("/tests/")) layers.add("tests");
  if (/schema|migration|model|runtimeSchema/u.test(normalized)) layers.add("schema");
  return allLayers.filter(layer => layers.has(layer));
}

function likelyRequiredChanges(tokens: string[], files: string[]): string[] {
  const changes = new Set<string>();
  if (tokens.some(token => ["goal", "autopilot", "mission", "prompt"].includes(token))) {
    changes.add("Add a deterministic goal intake and planning workflow.");
    changes.add("Generate mission-runner-compatible mission files from a complex prompt.");
  }
  if (tokens.includes("cli") || tokens.includes("command")) changes.add("Expose the workflow through the CLI.");
  if (files.some(file => file.startsWith("packages/app/"))) changes.add("Adjust the visual app only if the goal affects UI behavior.");
  changes.add("Add tests, documentation, final reports, and durable lessons.");
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

function needsCoreOrCliMission(tokens: string[], files: string[]): boolean {
  return tokens.some(token => ["cli", "command", "goal", "autopilot", "planner", "mission", "runner"].includes(token)) ||
    files.some(file => file.startsWith("packages/core/") || file.startsWith("packages/cli/"));
}

function confidenceFor(score: number): number {
  return Math.max(0.5, Math.min(0.95, Number((0.5 + score / 20).toFixed(2))));
}

function filePathBoost(filePath: string, goalTokens: string[]): number {
  const lowerPath = normalizeRepoPath(filePath).toLowerCase();
  let score = 0;
  if (goalTokens.includes("cli") && lowerPath.startsWith("packages/cli/")) score += 3;
  if (goalTokens.includes("core") && lowerPath.startsWith("packages/core/")) score += 3;
  if ((goalTokens.includes("app") || goalTokens.includes("ui")) && lowerPath.startsWith("packages/app/")) score += 3;
  if ((goalTokens.includes("mission") || goalTokens.includes("runner")) && lowerPath.includes("mission")) score += 4;
  if ((goalTokens.includes("goal") || goalTokens.includes("autopilot")) && lowerPath.includes("goal")) score += 4;
  if ((goalTokens.includes("self") || goalTokens.includes("improvement")) && lowerPath.includes("self")) score += 2;
  if ((goalTokens.includes("scope") || goalTokens.includes("overreach")) && lowerPath.includes("scope")) score += 4;
  if (goalTokens.includes("docs") && (lowerPath.startsWith("docs/") || lowerPath.endsWith(".md"))) score += 3;
  if (goalTokens.includes("test") && lowerPath.includes(".test.")) score += 3;
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
