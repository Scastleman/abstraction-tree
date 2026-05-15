import type { Concept, FileSummary, Invariant, TreeNode } from "./schema.js";

export type PromptRouteDecision = "direct" | "goal-driven" | "assessment-pack" | "manual-review";
export type PromptRouteRisk = "low" | "medium" | "high";
export type PromptRouteComplexity = "low" | "medium" | "high";

export interface PromptRouteInput {
  prompt: string;
  promptFile?: string;
  nodes?: TreeNode[];
  files?: FileSummary[];
  concepts?: Concept[];
  invariants?: Invariant[];
  memoryAvailable?: boolean;
  memoryIssues?: string[];
}

export interface PromptRouteResult {
  decision: PromptRouteDecision;
  confidence: number;
  estimatedRisk: PromptRouteRisk;
  estimatedComplexity: PromptRouteComplexity;
  estimatedAffectedLayers: string[];
  estimatedAffectedNodes: string[];
  estimatedAffectedConcepts: string[];
  estimatedFiles: string[];
  reasons: string[];
  recommendedCommand: string;
}

export interface PromptScoredEvidence<T> {
  id: string;
  item: T;
  score: number;
  reasons: string[];
}

export interface PromptEvidenceInput {
  prompt: string;
  nodes?: TreeNode[];
  files?: FileSummary[];
  concepts?: Concept[];
}

export interface PromptEvidenceResult {
  tokens: string[];
  scoredFiles: Array<PromptScoredEvidence<FileSummary>>;
  scoredNodes: Array<PromptScoredEvidence<TreeNode>>;
  scoredConcepts: Array<PromptScoredEvidence<Concept>>;
  estimatedFiles: string[];
  estimatedAffectedNodes: string[];
  estimatedAffectedConcepts: string[];
  estimatedAffectedLayers: string[];
}

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "be",
  "for",
  "from",
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
  "with"
]);

const orderedLayers = ["project", "architecture", "module", "file", "function", "schema", "cli", "docs", "tests"];
const directTerms = ["typo", "copy", "wording", "sentence", "small", "minor", "rename", "one", "fix"];
const complexTerms = [
  "full",
  "whole",
  "system",
  "workflow",
  "autonomous",
  "refactor",
  "architecture",
  "integration",
  "migration",
  "engine",
  "loop",
  "mission",
  "tree",
  "pr",
  "tests",
  "docs",
  "feature",
  "subsystem",
  "automation",
  "implementation",
  "billing",
  "subscription",
  "webhook",
  "webhooks"
];
const assessmentTerms = ["assess", "assessment", "review", "critique", "evaluate", "audit", "roadmap", "strategy", "improvements", "improved"];
const destructiveTerms = ["delete", "remove", "wipe", "purge", "destroy"];
const bypassTerms = ["bypass", "disable", "ignore", "skip"];
const sensitiveTerms = ["secret", "secrets", "credential", "credentials", "env", "auth", "security", "payment", "payments", "billing", "production", "deploy", "deployment", "stripe"];
const broadTerms = ["all", "whole", "entire", "everything", "repo", "repository", "large", "unlimited"];

export function routePrompt(input: PromptRouteInput): PromptRouteResult {
  const prompt = input.prompt.trim();
  const lowerPrompt = prompt.toLowerCase();
  const nodes = input.nodes ?? [];
  const files = input.files ?? [];
  const concepts = input.concepts ?? [];
  const invariants = input.invariants ?? [];
  const memoryAvailable = input.memoryAvailable ?? (nodes.length > 0 || files.length > 0 || concepts.length > 0 || invariants.length > 0);
  const evidence = scorePromptEvidence({ prompt, nodes, files, concepts });
  const tokens = evidence.tokens;
  const estimatedFiles = evidence.estimatedFiles;
  const estimatedAffectedNodes = evidence.estimatedAffectedNodes;
  const estimatedAffectedConcepts = evidence.estimatedAffectedConcepts;
  const estimatedAffectedLayers = evidence.estimatedAffectedLayers;
  const areaCount = affectedAreaTerms(tokens).length;
  const complexScore = complexityScore(tokens, lowerPrompt, areaCount, estimatedAffectedLayers.length, estimatedFiles.length, estimatedAffectedNodes.length);
  const directScore = directScoreFor(tokens, lowerPrompt, estimatedFiles.length, estimatedAffectedLayers.length);
  const manualReasons = manualReviewReasons(tokens, lowerPrompt);
  const assessmentReasons = assessmentPackReasons(tokens, lowerPrompt);
  const sensitiveRisk = tokens.some(token => sensitiveTerms.includes(token));
  const reasons: string[] = [];
  let decision: PromptRouteDecision;
  const strongDirect = directScore >= 3 && tokens.length <= 14 && areaCount <= 1 && !sensitiveRisk && !manualReasons.length && !assessmentReasons.length;

  if (manualReasons.length) {
    decision = "manual-review";
    reasons.push(...manualReasons);
  } else if (assessmentReasons.length && complexScore >= 2) {
    decision = "assessment-pack";
    reasons.push(...assessmentReasons);
  } else if (strongDirect) {
    decision = "direct";
    reasons.push("Prompt describes a small bounded change.");
    reasons.push("Prompt has low complexity and no manual-review safety triggers.");
  } else if (complexScore >= 5 || estimatedAffectedLayers.length >= 4 || estimatedFiles.length > 5) {
    decision = "goal-driven";
    reasons.push(...goalDrivenReasons(areaCount, estimatedAffectedLayers.length, complexScore, sensitiveRisk));
  } else if (directScore >= 2 && complexScore <= 3) {
    decision = "direct";
    reasons.push("Prompt describes a small bounded change.");
    reasons.push("Prompt has low complexity and no manual-review safety triggers.");
  } else if (complexScore >= 3) {
    decision = "goal-driven";
    reasons.push(...goalDrivenReasons(areaCount, estimatedAffectedLayers.length, complexScore, sensitiveRisk));
  } else {
    decision = "direct";
    reasons.push("Prompt appears narrow enough for direct bounded execution.");
  }

  if (!memoryAvailable) {
    reasons.push("Abstraction memory missing or incomplete; routing confidence reduced.");
  } else if (estimatedFiles.length || estimatedAffectedNodes.length || estimatedAffectedConcepts.length) {
    reasons.push(`Abstraction memory matched ${estimatedFiles.length} likely file(s), ${estimatedAffectedNodes.length} node(s), and ${estimatedAffectedConcepts.length} concept(s).`);
  }
  if (input.memoryIssues?.length) {
    reasons.push(`Memory read reported ${input.memoryIssues.length} issue(s); routing used available fallback data.`);
  }

  const estimatedRisk = riskFor(decision, tokens, lowerPrompt, sensitiveRisk);
  const estimatedComplexity = decision === "direct"
    ? directComplexity(complexScore, estimatedFiles.length)
    : complexityFor(complexScore, estimatedAffectedLayers.length, estimatedFiles.length);
  return {
    decision,
    confidence: confidenceFor(decision, memoryAvailable, manualReasons.length, assessmentReasons.length, complexScore, directScore),
    estimatedRisk,
    estimatedComplexity,
    estimatedAffectedLayers,
    estimatedAffectedNodes,
    estimatedAffectedConcepts,
    estimatedFiles,
    reasons: uniqueStable(reasons),
    recommendedCommand: recommendedCommand(decision, input.promptFile)
  };
}

export function scorePromptEvidence(input: PromptEvidenceInput): PromptEvidenceResult {
  const prompt = input.prompt.trim();
  const tokens = tokenize(prompt);
  const scoredFiles = scoreFiles(input.files ?? [], tokens);
  const scoredNodes = scoreNodes(input.nodes ?? [], scoredFiles, tokens);
  const scoredConcepts = scoreConcepts(input.concepts ?? [], scoredFiles, tokens);
  const estimatedFiles = topScored(scoredFiles, 8).map(item => item.item.path);
  const estimatedAffectedNodes = topScored(scoredNodes, 8).map(item => item.item.id);
  const estimatedAffectedConcepts = topScored(scoredConcepts, 8).map(item => item.item.id);

  return {
    tokens,
    scoredFiles,
    scoredNodes,
    scoredConcepts,
    estimatedFiles,
    estimatedAffectedNodes,
    estimatedAffectedConcepts,
    estimatedAffectedLayers: inferLayers(tokens, estimatedFiles, estimatedAffectedNodes)
  };
}

export function formatPromptRouteResult(result: PromptRouteResult, options: { explain?: boolean } = {}): string {
  const lines = [
    `Routing decision: ${result.decision}`,
    `Confidence: ${result.confidence.toFixed(2)}`,
    `Risk: ${result.estimatedRisk}`,
    `Complexity: ${result.estimatedComplexity}`,
    "",
    "Reasons:",
    ...result.reasons.map(reason => `- ${reason}`),
    ""
  ];
  if (options.explain) {
    lines.push("Estimated affected layers:");
    lines.push(...listOrNone(result.estimatedAffectedLayers));
    lines.push("");
    lines.push("Estimated affected nodes:");
    lines.push(...listOrNone(result.estimatedAffectedNodes));
    lines.push("");
    lines.push("Estimated affected concepts:");
    lines.push(...listOrNone(result.estimatedAffectedConcepts));
    lines.push("");
    lines.push("Estimated files:");
    lines.push(...listOrNone(result.estimatedFiles));
    lines.push("");
  }
  lines.push("Recommended command:");
  lines.push(result.recommendedCommand);
  lines.push("");
  return lines.join("\n");
}

function manualReviewReasons(tokens: string[], lowerPrompt: string): string[] {
  const reasons: string[] = [];
  const hasDestructive = hasUnnegatedMatch(lowerPrompt, /\b(delete|remove|wipe|purge|destroy)\b/gu) &&
    tokens.some(token => broadTerms.includes(token) || token === "system");
  const hasBypass = hasUnnegatedMatch(lowerPrompt, /\b(bypass|disable|ignore|skip)\b/gu) &&
    tokens.some(token => ["test", "tests", "check", "checks", "safety", "validation", "ci"].includes(token));
  const hasSecrets = hasUnnegatedMatch(lowerPrompt, /\b(secret|secrets|credential|credentials|\.env)\b/gu);
  const highImpactRewrite = hasUnnegatedMatch(lowerPrompt, /\brewrite\b/gu) && /\b(whole|entire|all|everything|architecture|system|repo|repository)\b/u.test(lowerPrompt);
  const unlimitedControl = hasUnnegatedMatch(lowerPrompt, /\b(unlimited|forever|no limits?|without limits?|full autonomous control)\b/gu);
  const ambiguousSensitive = tokens.some(token => ["auth", "security", "payment", "payments", "production", "deployment"].includes(token)) &&
    tokens.length <= 8 &&
    !tokens.some(token => ["test", "tests", "docs", "specific", "checkout", "webhook", "webhooks"].includes(token));

  if (hasDestructive) reasons.push("Prompt asks for broad deletion or irreversible changes.");
  if (hasBypass) reasons.push("Prompt asks to bypass tests, checks, validation, or safety controls.");
  if (hasSecrets) reasons.push("Prompt touches secrets, credentials, or .env data.");
  if (highImpactRewrite) reasons.push("Prompt asks for a high-impact rewrite without bounded implementation scope.");
  if (unlimitedControl) reasons.push("Prompt asks for unlimited autonomous control.");
  if (ambiguousSensitive) reasons.push("Prompt touches sensitive auth, security, payment, production, or deployment behavior without clear scope.");
  return reasons;
}

function hasUnnegatedMatch(text: string, pattern: RegExp): boolean {
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = text.slice(Math.max(0, index - 40), index);
    const sentencePrefix = text.slice(Math.max(0, text.lastIndexOf(".", index) + 1), index);
    if (/(do not|don't|never|must not|should not|no)\b/u.test(sentencePrefix)) continue;
    if (/(do not|don't|never|must not|should not|no)\s*(?::|-|\n|\r|\s)*$/u.test(prefix)) continue;
    if (/(do not|don't|never|must not|should not|no)\s+\w+\s+$/u.test(prefix)) continue;
    return true;
  }
  return false;
}

function assessmentPackReasons(tokens: string[], lowerPrompt: string): string[] {
  const hasAssessment = tokens.some(token => assessmentTerms.includes(token));
  const broad = tokens.some(token => ["repo", "repository", "roadmap", "strategy", "improvements", "whole", "architecture"].includes(token)) ||
    /what should be improved/u.test(lowerPrompt);
  if (!hasAssessment || !broad) return [];
  return [
    "Prompt asks for broad assessment, critique, roadmap, or strategy rather than a bounded implementation.",
    "Assessment-pack workflow is a better fit for repo-wide planning before missions are written."
  ];
}

function goalDrivenReasons(areaCount: number, layerCount: number, score: number, sensitiveRisk: boolean): string[] {
  const reasons: string[] = [];
  if (areaCount >= 2) reasons.push("Prompt mentions multiple implementation areas.");
  if (layerCount >= 3) reasons.push("Prompt likely affects multiple abstraction layers.");
  if (score >= 5) reasons.push("Prompt contains feature, workflow, architecture, migration, automation, tests, docs, or mission language.");
  if (sensitiveRisk) reasons.push("Prompt includes sensitive product or operational terms, so decomposition and review are safer than direct execution.");
  if (!reasons.length) reasons.push("Prompt is complex enough to benefit from goal-driven mission decomposition.");
  return reasons;
}

function riskFor(decision: PromptRouteDecision, tokens: string[], lowerPrompt: string, sensitiveRisk: boolean): PromptRouteRisk {
  if (decision === "manual-review") return "high";
  if (sensitiveRisk || /\b(migration|database|schema|production|deployment|auth|security|payment|stripe)\b/u.test(lowerPrompt)) return "high";
  if (decision === "goal-driven" || tokens.some(token => ["architecture", "refactor", "integration", "automation", "workflow"].includes(token))) return "medium";
  return "low";
}

function complexityFor(score: number, layerCount: number, fileCount: number): PromptRouteComplexity {
  if (score >= 5 || layerCount >= 4 || fileCount > 5) return "high";
  if (score >= 3 || layerCount >= 2 || fileCount > 2) return "medium";
  return "low";
}

function directComplexity(score: number, fileCount: number): PromptRouteComplexity {
  if (score >= 4 || fileCount > 2) return "medium";
  return "low";
}

function confidenceFor(
  decision: PromptRouteDecision,
  memoryAvailable: boolean,
  manualReasonCount: number,
  assessmentReasonCount: number,
  complexScore: number,
  directScore: number
): number {
  let confidence = 0.74;
  if (decision === "manual-review" && manualReasonCount) confidence = 0.92;
  else if (decision === "assessment-pack" && assessmentReasonCount) confidence = 0.86;
  else if (decision === "goal-driven" && complexScore >= 5) confidence = 0.84;
  else if (decision === "direct" && directScore >= 2) confidence = 0.8;
  if (!memoryAvailable) confidence -= 0.15;
  if (decision === "direct" && complexScore >= 2) confidence -= 0.06;
  return Number(Math.max(0.5, Math.min(0.95, confidence)).toFixed(2));
}

function recommendedCommand(decision: PromptRouteDecision, promptFile?: string): string {
  if (decision === "direct") return "Direct execution recommended. No automatic direct runner is implemented yet.";
  if (decision === "goal-driven") {
    return promptFile
      ? `npm run atree:goal -- --file ${promptFile} --review-required`
      : "Save the prompt to a file, then run npm run atree:goal -- --file <prompt.md> --review-required.";
  }
  if (decision === "assessment-pack") return "npm run assessment:pack";
  return "Manual review required before agent execution.";
}

function complexityScore(
  tokens: string[],
  lowerPrompt: string,
  areaCount: number,
  layerCount: number,
  fileCount: number,
  nodeCount: number
): number {
  let score = 0;
  score += Math.min(4, areaCount);
  score += tokens.filter(token => complexTerms.includes(token)).length;
  if (/\b(add|implement|build|create)\b/u.test(lowerPrompt) && /\b(feature|workflow|system|subsystem|integration|automation|billing)\b/u.test(lowerPrompt)) score += 2;
  if (/\b(frontend|backend|api|database|tests?|docs?)\b/u.test(lowerPrompt)) score += 1;
  if (tokens.length > 35) score += 2;
  if (tokens.length > 60) score += 1;
  if (layerCount >= 3) score += 2;
  if (fileCount > 5) score += 2;
  if (nodeCount > 4) score += 1;
  return score;
}

function directScoreFor(tokens: string[], lowerPrompt: string, fileCount: number, layerCount: number): number {
  let score = 0;
  if (tokens.some(token => directTerms.includes(token))) score += 1;
  if (/\b(fix|rename|update|adjust)\b/u.test(lowerPrompt)) score += 1;
  if (/\btypo|copy|wording|sentence|small fix|one file|one function|one test\b/u.test(lowerPrompt)) score += 2;
  if (tokens.length <= 12) score += 1;
  if (fileCount <= 2 && layerCount <= 2) score += 1;
  return score;
}

function affectedAreaTerms(tokens: string[]): string[] {
  const areas = new Set<string>();
  const areaMap: Record<string, string> = {
    api: "api",
    backend: "backend",
    server: "backend",
    frontend: "frontend",
    ui: "frontend",
    app: "frontend",
    test: "tests",
    tests: "tests",
    docs: "docs",
    documentation: "docs",
    readme: "docs",
    database: "database",
    db: "database",
    schema: "database",
    migration: "database",
    cli: "cli",
    command: "cli",
    ci: "ci",
    workflow: "workflow",
    architecture: "architecture"
  };
  for (const token of tokens) {
    const area = areaMap[token];
    if (area) areas.add(area);
  }
  return [...areas];
}

function inferLayers(tokens: string[], filePaths: string[], nodeIds: string[]): string[] {
  const layers = new Set<string>();
  const text = [...tokens, ...filePaths, ...nodeIds].join(" ").toLowerCase();
  if (/\b(repo|repository|whole|project|roadmap)\b/u.test(text)) layers.add("project");
  if (/\b(architecture|workflow|system|subsystem|integration|refactor|engine)\b/u.test(text)) layers.add("architecture");
  if (/\b(module|backend|frontend|api|app|package|service|billing|checkout|webhook)\b/u.test(text)) layers.add("module");
  if (/\b(file|readme|typo)\b/u.test(text) || filePaths.length) layers.add("file");
  if (/\b(function|method|symbol|null check|validation)\b/u.test(text)) layers.add("function");
  if (/\b(schema|database|db|migration|model|plans)\b/u.test(text)) layers.add("schema");
  if (/\b(cli|command|script)\b/u.test(text)) layers.add("cli");
  if (/\b(docs|documentation|readme)\b/u.test(text) || filePaths.some(file => file.endsWith(".md") || file.startsWith("docs/"))) layers.add("docs");
  if (/\b(test|tests|spec|validation)\b/u.test(text) || filePaths.some(file => file.includes(".test.") || file.includes("/tests/"))) layers.add("tests");
  if (!layers.size) layers.add("project");
  return orderedLayers.filter(layer => layers.has(layer));
}

function scoreFiles(files: FileSummary[], promptTokens: string[]): Array<PromptScoredEvidence<FileSummary>> {
  return files
    .map(file => {
      const haystack = tokenize([
        file.path,
        file.summary,
        file.language,
        ...file.imports,
        ...file.exports,
        ...file.symbols
      ].join(" "));
      const overlapScore = scoreTokenOverlap(promptTokens, haystack);
      const boost = filePathBoost(file.path, promptTokens);
      return {
        id: file.path,
        item: file,
        score: overlapScore + boost,
        reasons: reasonsForScore([
          overlapScore > 0 ? "Prompt terms matched file path, summary, language, imports, exports, or symbols." : "",
          boost > 0 ? "File path matched route-specific prompt terms." : ""
        ], "Selected as prompt file evidence.")
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function scoreNodes(
  nodes: TreeNode[],
  scoredFiles: Array<PromptScoredEvidence<FileSummary>>,
  promptTokens: string[]
): Array<PromptScoredEvidence<TreeNode>> {
  const fileScores = new Map(scoredFiles.map(score => [score.id, score.score]));
  return nodes
    .map(node => {
      const nodeFiles = [...node.sourceFiles, ...node.ownedFiles];
      const fileScore = nodeFiles
        .map(filePath => fileScores.get(filePath) ?? 0)
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
      const relatedFileScore = Math.min(fileScore, 8);
      return {
        id: node.id,
        item: node,
        score: directScore + relatedFileScore,
        reasons: reasonsForScore([
          directScore > 0 ? "Prompt terms matched node identity, summary, responsibilities, or ownership." : "",
          relatedFileScore > 0 ? "Node owns files selected by prompt file evidence." : ""
        ], "Selected as prompt node evidence.")
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function scoreConcepts(
  concepts: Concept[],
  scoredFiles: Array<PromptScoredEvidence<FileSummary>>,
  promptTokens: string[]
): Array<PromptScoredEvidence<Concept>> {
  const fileScores = new Map(scoredFiles.map(score => [score.id, score.score]));
  return concepts
    .map(concept => {
      const relatedFileScoreRaw = concept.relatedFiles
        .map(filePath => fileScores.get(filePath) ?? 0)
        .sort((left, right) => right - left)
        .slice(0, 3)
        .reduce((sum, score) => sum + score, 0);
      const haystack = tokenize([
        concept.id,
        concept.title,
        concept.summary,
        ...concept.tags,
        ...concept.relatedFiles,
        ...concept.evidence.map(evidence => `${evidence.term} ${evidence.value}`)
      ].join(" "));
      const directScore = scoreTokenOverlap(promptTokens, haystack);
      const relatedFileScore = Math.min(relatedFileScoreRaw, 6);
      return {
        id: concept.id,
        item: concept,
        score: directScore + relatedFileScore,
        reasons: reasonsForScore([
          directScore > 0 ? "Prompt terms matched concept title, tags, summary, related files, or evidence." : "",
          relatedFileScore > 0 ? "Concept relates to files selected by prompt file evidence." : ""
        ], "Selected as prompt concept evidence.")
      };
    })
    .filter(item => item.score > 0)
    .sort(scoreSort);
}

function filePathBoost(filePath: string, promptTokens: string[]): number {
  const lowerPath = filePath.toLowerCase();
  let score = 0;
  if (promptTokens.includes("readme") && lowerPath.endsWith("readme.md")) score += 4;
  if (promptTokens.includes("checkout") && lowerPath.includes("checkout")) score += 4;
  if (promptTokens.includes("validation") && lowerPath.includes("validation")) score += 3;
  if (promptTokens.includes("docs") && (lowerPath.startsWith("docs/") || lowerPath.endsWith(".md"))) score += 3;
  if (promptTokens.includes("test") || promptTokens.includes("tests")) {
    if (lowerPath.includes(".test.") || lowerPath.includes("/tests/")) score += 3;
  }
  if (promptTokens.includes("cli") && lowerPath.includes("cli")) score += 3;
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

function topScored<T>(items: Array<PromptScoredEvidence<T>>, limit: number): Array<PromptScoredEvidence<T>> {
  return items.filter(item => item.score > 0).sort(scoreSort).slice(0, limit);
}

function scoreSort<T>(left: PromptScoredEvidence<T>, right: PromptScoredEvidence<T>): number {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function tokenize(text: string): string[] {
  return [...new Set(text
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(token => token.length > 1 && !stopWords.has(token)))];
}

function listOrNone(values: string[]): string[] {
  return values.length ? values.map(value => `- ${value}`) : ["- None estimated."];
}

function uniqueStable(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function reasonsForScore(reasons: string[], fallback: string): string[] {
  const cleaned = reasons.filter(Boolean);
  return cleaned.length ? cleaned : [fallback];
}
