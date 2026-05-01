import path from "node:path";
import type { AbstractionOntologyLevel, Concept, FileSummary, Invariant, TreeNode } from "./schema.js";

export interface BuildTreeResult {
  ontology: AbstractionOntologyLevel[];
  nodes: TreeNode[];
  concepts: Concept[];
  invariants: Invariant[];
  files: FileSummary[];
}

export function buildDeterministicTree(projectName: string, files: FileSummary[]): BuildTreeResult {
  const ontology = inferOntology(files);
  const levels = Object.fromEntries(ontology.map(level => [level.rank, level.id])) as Record<number, string>;
  const rootId = "project.intent";
  const nodes = new Map<string, TreeNode>();

  const root = node(rootId, projectName, levels[0], `Top-level purpose and semantic map for ${projectName}.`);
  nodes.set(root.id, root);

  const domain = node("project.domain", ontology[1].name, levels[1], "Human-level concepts inferred from names, folders, and code symbols.", root.id);
  const arch = node("project.architecture", ontology[2].name, levels[2], "Runtime systems, dataflow, and implementation boundaries inferred from repository structure.", root.id);
  const code = node("project.code", ontology[3].name, levels[3], "Package, folder, and file ownership extracted from the repository.", root.id);
  for (const n of [domain, arch, code]) nodes.set(n.id, n);
  root.children.push(domain.id, arch.id, code.id);

  const topFolders = new Set<string>();
  for (const f of files) topFolders.add(f.path.includes("/") ? f.path.split("/")[0] : "root");

  for (const folder of [...topFolders].sort()) {
    const id = `module.${slug(folder)}`;
    const n = node(id, titleize(folder), levels[3], `Files and functionality under ${folder}.`, code.id);
    n.sourceFiles = files.filter(f => (folder === "root" ? !f.path.includes("/") : f.path.startsWith(folder + "/"))).map(f => f.path);
    n.ownedFiles = n.sourceFiles;
    n.changePolicy.allowedToChange = [...n.ownedFiles];
    n.responsibilities = [`Own files and behavior under ${folder}.`];
    nodes.set(id, n);
    code.children.push(id);
  }

  for (const f of files) {
    const folder = f.path.includes("/") ? f.path.split("/")[0] : "root";
    const parentId = `module.${slug(folder)}`;
    const id = `file.${slug(f.path)}`;
    const n = node(id, path.basename(f.path), levels[4], f.summary, parentId);
    n.sourceFiles = [f.path];
    n.ownedFiles = n.sourceFiles;
    n.changePolicy.allowedToChange = [f.path];
    n.dependencies = f.imports.map(i => `import:${i}`);
    n.dependsOn = n.dependencies;
    n.responsibilities = [f.summary];
    nodes.set(id, n);
    nodes.get(parentId)?.children.push(id);
    f.ownedByNodeIds = [id, parentId];
  }

  const concepts = inferConcepts(files, [...nodes.values()]);
  for (const c of concepts) domain.children.push(`concept-node.${c.id}`);
  for (const c of concepts) {
    const cn = node(`concept-node.${c.id}`, c.title, levels[1], c.summary, domain.id);
    cn.sourceFiles = c.relatedFiles;
    cn.ownedFiles = cn.sourceFiles;
    cn.dependencies = c.relatedNodeIds;
    cn.dependsOn = cn.dependencies;
    cn.responsibilities = [`Represent the cross-cutting ${c.title} concept across related files.`];
    nodes.set(cn.id, cn);
  }

  const invariants = inferInvariants(files, [...nodes.values()]);
  for (const inv of invariants) {
    for (const nodeId of inv.nodeIds) nodes.get(nodeId)?.invariants.push(inv.id);
  }

  return { ontology, nodes: [...nodes.values()], concepts, invariants, files };
}

function inferOntology(files: FileSummary[]): AbstractionOntologyLevel[] {
  const paths = files.map(f => f.path.toLowerCase());
  const languages = new Set(files.map(f => f.language));
  const hasUi = paths.some(p => /(^|\/)(components?|pages?|views?|app)\//.test(p) || /\.(tsx|jsx|vue|svelte)$/.test(p));
  const hasTests = files.some(f => f.isTest);
  const hasPackages = paths.some(p => p.startsWith("packages/") || p.startsWith("apps/"));
  const hasData = paths.some(p => /data|model|schema|migration|pipeline|feature|signal/.test(p));
  const runtimeName = hasData ? "Runtime / Dataflow Layer" : hasUi ? "Application / UI Runtime Layer" : "System Architecture Layer";
  const packageName = hasPackages ? "Package / Workspace Layer" : "Package / Module Layer";
  const codeName = hasUi ? "Component / File Layer" : "Component / Code Unit Layer";

  return [
    {
      id: "project-purpose",
      name: "Project Purpose Layer",
      description: "Why this repository exists and what durable outcome it serves.",
      rank: 0,
      signals: ["project name", "README", "package metadata"],
      confidence: 0.7
    },
    {
      id: "domain-concepts",
      name: "Domain Concept Layer",
      description: "Human-level concepts and cross-cutting ideas expressed by names, folders, tests, and symbols.",
      rank: 1,
      signals: ["file names", "folder names", "exported symbols", hasTests ? "tests" : "source files"],
      confidence: 0.65
    },
    {
      id: slug(runtimeName),
      name: runtimeName,
      description: "Major runtime systems, data movement, user flows, or architectural boundaries.",
      rank: 2,
      signals: [hasUi ? "UI components" : "source boundaries", hasData ? "data-oriented paths" : "imports"],
      confidence: 0.6
    },
    {
      id: slug(packageName),
      name: packageName,
      description: "Packages, workspaces, folders, and modules that organize implementation ownership.",
      rank: 3,
      signals: [hasPackages ? "packages/apps folders" : "top-level folders", `${languages.size} detected language(s)`],
      confidence: 0.7
    },
    {
      id: slug(codeName),
      name: codeName,
      description: "Concrete files, components, classes, functions, and other code units.",
      rank: 4,
      signals: ["source files", "imports", "exports", "symbols"],
      confidence: 0.75
    }
  ];
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
      nodeIds: nodes.filter(n => n.sourceFiles.length).map(n => n.id),
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
    name: title,
    title,
    abstractionLevel: level,
    level,
    summary,
    parent: parentId,
    parentId,
    children: [],
    sourceFiles: [],
    ownedFiles: [],
    responsibilities: [],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
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
