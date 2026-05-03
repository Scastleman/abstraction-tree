import type { ChangeRecord, Concept, ContextPack, FileSummary, Invariant, TreeNode } from "./schema.js";

export function buildContextPack(args: {
  target: string;
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  invariants: Invariant[];
  changes: ChangeRecord[];
}): ContextPack {
  const query = normalize(args.target);
  const queryTokens = tokenize(args.target);
  const conceptScores = args.concepts
    .map(concept => ({ item: concept, score: scoreConcept(concept, query, queryTokens) }))
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(conceptName));
  const conceptFileSet = new Set(conceptScores.flatMap(scored => scored.item.relatedFiles));
  const conceptNodeSet = new Set(conceptScores.flatMap(scored => scored.item.relatedNodeIds));

  const nodeScores = args.nodes
    .map(node => {
      const files = nodeFiles(node);
      const conceptOverlap = files.filter(file => conceptFileSet.has(file)).length;
      const conceptNodeBoost = conceptNodeSet.has(node.id) ? 10 : 0;
      return {
        item: node,
        score: scoreNode(node, query, queryTokens) + conceptOverlap * 5 + conceptNodeBoost
      };
    })
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(nodeName));
  const relevantNodes = uniqueBy(nodeScores.map(scored => scored.item), node => node.id).slice(0, 30);

  const nodeFileSet = new Set(relevantNodes.flatMap(nodeFiles));
  const fileScores = args.files
    .map(file => {
      const ownershipBoost = nodeFileSet.has(file.path) ? 8 : 0;
      const conceptBoost = conceptFileSet.has(file.path) ? 8 : 0;
      return {
        item: file,
        score: scoreFile(file, query, queryTokens) + ownershipBoost + conceptBoost
      };
    })
    .filter(scored => scored.score > 0)
    .sort(byScoreThenName(file => file.path));
  const relevantFiles = uniqueBy(fileScores.map(scored => scored.item), file => file.path).slice(0, 50);

  const fileSet = new Set(relevantFiles.map(file => file.path));
  for (const node of relevantNodes) {
    for (const filePath of nodeFiles(node)) fileSet.add(filePath);
  }
  const relevantConcepts = uniqueBy([
    ...conceptScores.map(scored => scored.item),
    ...args.concepts.filter(c => c.relatedFiles.some(file => fileSet.has(file)))
  ], concept => concept.id);
  const nodeIds = new Set(relevantNodes.map(n => n.id));
  const invariants = args.invariants.filter(i => i.nodeIds.some(id => nodeIds.has(id)) || i.filePaths.some(f => fileSet.has(f)));

  return {
    id: `context.${Date.now()}`,
    createdAt: new Date().toISOString(),
    target: args.target,
    projectSummary: args.nodes.find(n => n.id === "project.intent")?.summary ?? "Project context pack.",
    relevantNodes,
    relevantFiles,
    relevantConcepts,
    invariants,
    recentChanges: args.changes.slice(-10),
    agentInstructions: [
      "Use the relevant abstraction nodes as the change boundary.",
      "Preserve listed invariants unless the user explicitly asks to change them.",
      "Avoid touching files outside allowed ownership unless dependency analysis requires it.",
      "After code changes, update `.abstraction-tree/` files and write a semantic change record."
    ]
  };
}

function nodeName(node: TreeNode): string {
  return node.name ?? node.title;
}

function nodeFiles(node: TreeNode): string[] {
  return node.sourceFiles ?? node.ownedFiles ?? [];
}

function scoreNode(node: TreeNode, query: string, queryTokens: string[]): number {
  return [
    scoreText(nodeName(node), query, queryTokens, 4),
    scoreText(node.summary, query, queryTokens, 3),
    scoreList(nodeFiles(node), query, queryTokens, 3),
    scoreList(node.responsibilities ?? [], query, queryTokens, 2),
    scoreList(node.dependencies ?? node.dependsOn ?? [], query, queryTokens, 1)
  ].reduce((sum, value) => sum + value, 0);
}

function scoreFile(file: FileSummary, query: string, queryTokens: string[]): number {
  return [
    scoreText(file.path, query, queryTokens, 4),
    scoreText(file.summary, query, queryTokens, 2),
    scoreList(file.symbols, query, queryTokens, 3),
    scoreList(file.exports, query, queryTokens, 3),
    scoreList(file.imports, query, queryTokens, 1)
  ].reduce((sum, value) => sum + value, 0);
}

function scoreConcept(concept: Concept, query: string, queryTokens: string[]): number {
  return [
    scoreText(concept.title, query, queryTokens, 5),
    scoreText(concept.summary, query, queryTokens, 3),
    scoreList(concept.tags, query, queryTokens, 4),
    scoreList(concept.relatedFiles, query, queryTokens, 2)
  ].reduce((sum, value) => sum + value, 0);
}

function scoreList(values: string[] = [], query: string, queryTokens: string[], weight: number): number {
  return values.reduce((sum, value) => sum + scoreText(value, query, queryTokens, weight), 0);
}

function scoreText(value: string | undefined, query: string, queryTokens: string[], weight: number): number {
  const text = normalize(value ?? "");
  if (!text) return 0;
  const textTokens = new Set(tokenize(text));
  let score = query && text.includes(query) ? 5 * weight : 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) score += 3 * weight;
    else if (text.includes(token)) score += weight;
  }
  return score;
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

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function conceptName(concept: Concept): string {
  return concept.title;
}
