import path from "node:path";
import type { Concept, FileSummary, Invariant, TreeNode } from "./schema.js";

export interface BuildTreeResult {
  nodes: TreeNode[];
  concepts: Concept[];
  invariants: Invariant[];
  files: FileSummary[];
}

export function buildDeterministicTree(projectName: string, files: FileSummary[]): BuildTreeResult {
  const rootId = "project.intent";
  const nodes = new Map<string, TreeNode>();

  const root = node(rootId, projectName, "intent", `Top-level intent and semantic map for ${projectName}.`);
  nodes.set(root.id, root);

  const domain = node("project.domain", "Domain Concepts", "domain", "Human-level concepts inferred from names, folders, and code symbols.", root.id);
  const arch = node("project.architecture", "Architecture", "architecture", "Major project areas and implementation boundaries.", root.id);
  const code = node("project.code", "Code Structure", "module", "Folder and file ownership extracted from the repository.", root.id);
  for (const n of [domain, arch, code]) nodes.set(n.id, n);
  root.children.push(domain.id, arch.id, code.id);

  const topFolders = new Set<string>();
  for (const f of files) topFolders.add(f.path.includes("/") ? f.path.split("/")[0] : "root");

  for (const folder of [...topFolders].sort()) {
    const id = `module.${slug(folder)}`;
    const n = node(id, titleize(folder), "module", `Files and functionality under ${folder}.`, code.id);
    n.ownedFiles = files.filter(f => (folder === "root" ? !f.path.includes("/") : f.path.startsWith(folder + "/"))).map(f => f.path);
    n.changePolicy.allowedToChange = [...n.ownedFiles];
    nodes.set(id, n);
    code.children.push(id);
  }

  for (const f of files) {
    const folder = f.path.includes("/") ? f.path.split("/")[0] : "root";
    const parentId = `module.${slug(folder)}`;
    const id = `file.${slug(f.path)}`;
    const n = node(id, path.basename(f.path), "file", f.summary, parentId);
    n.ownedFiles = [f.path];
    n.changePolicy.allowedToChange = [f.path];
    n.dependsOn = f.imports.map(i => `import:${i}`);
    nodes.set(id, n);
    nodes.get(parentId)?.children.push(id);
    f.ownedByNodeIds = [id, parentId];
  }

  const concepts = inferConcepts(files, [...nodes.values()]);
  for (const c of concepts) domain.children.push(`concept-node.${c.id}`);
  for (const c of concepts) {
    const cn = node(`concept-node.${c.id}`, c.title, "domain", c.summary, domain.id);
    cn.ownedFiles = c.relatedFiles;
    cn.dependsOn = c.relatedNodeIds;
    nodes.set(cn.id, cn);
  }

  const invariants = inferInvariants(files, [...nodes.values()]);
  for (const inv of invariants) {
    for (const nodeId of inv.nodeIds) nodes.get(nodeId)?.invariants.push(inv.id);
  }

  return { nodes: [...nodes.values()], concepts, invariants, files };
}

function inferConcepts(files: FileSummary[], nodes: TreeNode[]): Concept[] {
  const keywords = ["auth", "user", "checkout", "payment", "order", "api", "database", "schema", "config", "test", "ui", "component", "service", "agent", "tree", "context", "scan", "visual"];
  const concepts: Concept[] = [];
  for (const kw of keywords) {
    const related = files.filter(f => f.path.toLowerCase().includes(kw) || f.symbols.some(s => s.toLowerCase().includes(kw)));
    if (!related.length) continue;
    concepts.push({
      id: slug(kw),
      title: titleize(kw),
      summary: `Cross-cutting concept inferred from files and symbols containing "${kw}".`,
      relatedNodeIds: nodes.filter(n => n.ownedFiles.some(of => related.some(f => f.path === of))).map(n => n.id),
      relatedFiles: related.map(f => f.path),
      tags: [kw]
    });
  }
  return concepts;
}

function inferInvariants(files: FileSummary[], nodes: TreeNode[]): Invariant[] {
  const inv: Invariant[] = [];
  const testFiles = files.filter(f => f.isTest);
  if (testFiles.length) {
    inv.push({
      id: "invariant.tests-reflect-behavior",
      title: "Tests should reflect behavior changes",
      description: "When implementation behavior changes, nearby tests should be updated or added.",
      nodeIds: nodes.filter(n => n.level === "module" || n.level === "file").map(n => n.id),
      filePaths: testFiles.map(f => f.path),
      severity: "medium"
    });
  }
  inv.push({
    id: "invariant.tree-updated-after-change",
    title: "Tree memory must be updated after meaningful changes",
    description: "Architecture, concept, or ownership changes should be reflected in `.abstraction-tree/` before completion.",
    nodeIds: ["project.intent", "project.architecture", "project.code"],
    filePaths: [".abstraction-tree/tree.json", ".abstraction-tree/files.json"],
    severity: "high"
  });
  return inv;
}

function node(id: string, title: string, level: TreeNode["level"], summary: string, parentId?: string): TreeNode {
  return {
    id,
    title,
    level,
    summary,
    parentId,
    children: [],
    ownedFiles: [],
    dependsOn: [],
    invariants: [],
    changePolicy: { allowedToChange: [], mustNotChange: [] },
    confidence: 0.65
  };
}

function slug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}

function titleize(input: string) {
  return input.replace(/[-_.]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
