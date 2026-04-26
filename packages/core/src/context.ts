import type { ChangeRecord, Concept, ContextPack, FileSummary, Invariant, TreeNode } from "./schema.js";

export function buildContextPack(args: {
  target: string;
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  invariants: Invariant[];
  changes: ChangeRecord[];
}): ContextPack {
  const q = args.target.toLowerCase();
  const relevantNodes = args.nodes.filter(n =>
    n.title.toLowerCase().includes(q) ||
    n.summary.toLowerCase().includes(q) ||
    n.ownedFiles.some(f => f.toLowerCase().includes(q))
  ).slice(0, 30);

  const fileSet = new Set(relevantNodes.flatMap(n => n.ownedFiles));
  const relevantFiles = args.files.filter(f => fileSet.has(f.path) || f.path.toLowerCase().includes(q)).slice(0, 50);
  const relevantConcepts = args.concepts.filter(c =>
    c.title.toLowerCase().includes(q) ||
    c.relatedFiles.some(f => fileSet.has(f))
  );
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
