import path from "node:path";
import type { AbstractionOntologyLevel, Concept, ConceptEvidence, ConceptEvidenceKind, FileSummary, ImportGraph, Invariant, TreeNode, WorkspacePackage } from "./schema.js";

export interface BuildTreeResult {
  ontology: AbstractionOntologyLevel[];
  nodes: TreeNode[];
  concepts: Concept[];
  invariants: Invariant[];
  files: FileSummary[];
}

export interface BuildTreeOptions {
  importGraph?: ImportGraph;
}

export function buildDeterministicTree(projectName: string, files: FileSummary[], options: BuildTreeOptions = {}): BuildTreeResult {
  const ontology = inferOntology(files);
  const levels = Object.fromEntries(ontology.map(level => [level.rank, level.id])) as Record<number, string>;
  const rootId = "project.intent";
  const nodes = new Map<string, TreeNode>();

  const root = node(rootId, projectName, levels[0], inferProjectSummary(projectName, files));
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

  const architectureNodes = inferArchitectureNodes(files, levels[2], arch.id, options.importGraph);
  for (const architectureNode of architectureNodes) {
    nodes.set(architectureNode.id, architectureNode);
    arch.children.push(architectureNode.id);
    for (const sourceFile of architectureNode.sourceFiles) {
      const file = files.find(candidate => candidate.path === sourceFile);
      if (file) file.ownedByNodeIds = uniqueStrings([...file.ownedByNodeIds, architectureNode.id]);
    }
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

function inferProjectSummary(projectName: string, files: FileSummary[]): string {
  const readme = files.find(file => file.path.toLowerCase() === "readme.md");
  if (readme && !readme.summary.startsWith("README.md is ")) return readme.summary;
  return `Top-level purpose and semantic map for ${projectName}.`;
}

interface ConceptCandidate {
  term: string;
  files: Set<string>;
  score: number;
  signals: Set<ConceptEvidenceKind>;
  tags: Set<string>;
  evidence: ConceptEvidence[];
}

const CONCEPT_STOP_WORDS = new Set([
  "src", "lib", "app", "apps", "pkg", "package", "packages", "index", "main", "test", "tests", "spec", "dist",
  "build", "types", "type", "utils", "util", "helper", "helpers", "common", "shared", "file", "files",
  "node", "nodes", "module", "modules", "service", "services", "component", "components", "tsx", "jsx",
  "json", "yaml", "yml", "markdown", "md", "mjs", "js", "ts", "example", "examples", "small", "web",
  "name", "names", "level", "levels", "path", "paths", "set", "sets", "score", "scores", "summary",
  "summaries", "value", "values", "root", "project", "projects", "repo", "repository", "core", "full", "script", "scripts",
  "fixture", "fixtures", "folder", "folders", "dir", "dirs", "directory",
  "directories", "source", "target", "input", "inputs", "output", "outputs", "option", "options",
  "field", "fields", "id", "ids", "item", "items", "data", "result", "results", "default", "defaults", "local",
  "readme", "license", "contributing", "docs", "doc", "documentation", "guide", "guides", "overview",
  "section", "sections", "note", "notes", "usage", "user", "users"
]);

const SINGLE_WORD_CONCEPT_STOP_WORDS = new Set([
  ...CONCEPT_STOP_WORDS,
  "add", "added", "build", "builder", "check", "collect", "create", "delete", "detect", "ensure",
  "find", "format", "generated", "get", "handle", "handler", "kind", "list", "load", "make", "mode",
  "parse", "read", "record", "records", "render", "report", "reports", "review", "run", "runner",
  "save", "serve", "skip", "state", "store", "text", "update", "validate", "write", "concept",
  "config", "configuration", "extension", "issue", "line", "relative"
]);

const LEADING_ACTION_WORDS = new Set([
  "add", "build", "collect", "create", "delete", "detect", "ensure", "find", "format", "get",
  "handle", "infer", "list", "load", "make", "parse", "read", "render", "resolve", "run", "save",
  "scan", "serve", "set", "skip", "summarize", "update", "validate", "write"
]);

const DOC_FILLER_WORDS = new Set([
  "doc", "docs", "documentation", "guide", "overview", "readme", "section", "usage", "note", "notes",
  "example", "examples", "mission", "prompt", "task", "todo"
]);

const SHADOWED_BY_COMPOUND_WORDS = new Set(["graph", "import", "pack", "runtime", "schema"]);

const MAX_CONCEPTS = 32;
const MAX_CONCEPT_EVIDENCE = 40;
const CONCEPT_SIGNAL_WEIGHT: Record<ConceptEvidenceKind, number> = {
  path: 2,
  symbol: 3,
  export: 4,
  doc: 1
};

function inferConcepts(files: FileSummary[], nodes: TreeNode[]): Concept[] {
  const candidates = new Map<string, ConceptCandidate>();

  for (const file of files) {
    const pathSignal = isMarkdownFile(file) ? "doc" : "path";
    addConceptTerms(candidates, conceptTerms(file.path, { sourceKind: pathSignal }), file.path, file.path, pathSignal);
    for (const symbol of file.symbols) addConceptTerms(candidates, conceptTerms(symbol), file.path, symbol, "symbol");
    for (const exported of file.exports) addConceptTerms(candidates, conceptTerms(exported), file.path, exported, "export");
  }

  return pruneShadowedSingleConcepts([...candidates.values()].filter(isQualityConcept))
    .sort((a, b) => b.score - a.score || b.files.size - a.files.size || a.term.localeCompare(b.term))
    .slice(0, MAX_CONCEPTS)
    .map(candidate => {
      const relatedFiles = [...candidate.files].sort();
      const signals = [...candidate.signals].sort();
      return {
        id: slug(candidate.term),
        title: titleize(candidate.term),
        summary: `Durable concept inferred from ${relatedFiles.length} file(s) using ${signals.join(", ")} signals.`,
        relatedNodeIds: nodes.filter(n => n.ownedFiles.some(of => candidate.files.has(of))).map(n => n.id),
        relatedFiles,
        tags: sortedTags(candidate),
        evidence: sortedConceptEvidence(candidate.evidence).slice(0, MAX_CONCEPT_EVIDENCE)
      };
    });
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
    filePaths: [".abstraction-tree/tree.json", ".abstraction-tree/files.json", ".abstraction-tree/import-graph.json"],
    severity: "high"
  });
  return inv;
}

interface ArchitectureSpec {
  id: string;
  title: string;
  summary: string;
  sourceFiles: string[];
  responsibilities: string[];
  dependencies?: string[];
  confidence?: number;
}

function inferArchitectureNodes(
  files: FileSummary[],
  architectureLevel: TreeNode["level"],
  parentId: string,
  importGraph?: ImportGraph
): TreeNode[] {
  const workspacePackages = importGraph?.workspacePackages ?? [];
  const specs: ArchitectureSpec[] = [];

  const cliPackages = workspacePackages.filter(pkg =>
    Boolean(pkg.binCommands?.length) || packageLeaf(pkg).includes("cli")
  );
  const cliFiles = uniqueFilePaths([
    ...filesForPackages(files, cliPackages),
    ...files.filter(file => isCliSurfaceFile(file))
  ]);
  if (cliFiles.length) {
    specs.push({
      id: "architecture.cli.surface",
      title: "CLI Surface",
      summary: "Command entrypoints and command handlers inferred from package bin metadata, CLI package paths, and command framework imports.",
      sourceFiles: cliFiles,
      responsibilities: [
        "Expose command-line entrypoints and dispatch user-facing repository operations.",
        "Bridge package metadata, command handlers, local scanning, validation, context, and serve commands."
      ],
      dependencies: packageEvidence(cliPackages),
      confidence: 0.78
    });
  }

  const corePackages = workspacePackages.filter(pkg => packageLeaf(pkg) === "core");
  const coreFiles = uniqueFilePaths(filesForPackages(files, corePackages));
  if (coreFiles.length) {
    specs.push({
      id: "architecture.core.engine",
      title: "Core Engine",
      summary: "Reusable deterministic engine inferred from the core workspace package, package entrypoint, and exported core modules.",
      sourceFiles: coreFiles,
      responsibilities: [
        "Own deterministic scanning, import resolution, tree construction, validation, context, evaluation, and memory helpers.",
        "Stay independent from the CLI process, visual app framework, and provider-specific LLM adapters."
      ],
      dependencies: packageEvidence(corePackages),
      confidence: 0.76
    });
  }

  const pipelineFiles = uniqueFilePaths(files.filter(file => isPipelineFile(file)));
  if (pipelineFiles.length) {
    specs.push({
      id: "architecture.scanner.tree.context.pipeline",
      title: "Scanner / Tree / Context Pipeline",
      summary: "File scan to import graph to deterministic tree to context-pack flow inferred from pipeline module names and imports.",
      sourceFiles: pipelineFiles,
      responsibilities: [
        "Transform scanned file facts into ontology, architecture, code, concept, invariant, and context outputs.",
        "Keep deterministic project memory grounded in paths, symbols, imports, and resolved local dependencies."
      ],
      confidence: 0.74
    });
  }

  const uiPackages = workspacePackages.filter(pkg =>
    packageLeaf(pkg) === "app" || hasAny(pkg.dependencyPackageNames, ["react", "react-dom", "vite"])
  );
  const uiFiles = uniqueFilePaths([
    ...filesForPackages(files, uiPackages),
    ...files.filter(file => isUiFile(file))
  ]);
  const serverApiFiles = uniqueFilePaths(files.filter(file => isLocalServerFile(file)));
  if (serverApiFiles.length && uiFiles.length) {
    specs.push({
      id: "architecture.visual.app.api",
      title: "Visual App API",
      summary: "Local visual-app API inferred from server/runtime imports, serve command code, and the UI package that consumes project memory.",
      sourceFiles: uniqueStrings([
        ...serverApiFiles,
        ...uiFiles.filter(filePath => /(^|\/)types\.(ts|tsx|js|jsx)$/.test(filePath) || filePath.endsWith("package.json"))
      ]).sort(),
      responsibilities: [
        "Serve local project memory to the browser app through the local API boundary.",
        "Keep local API exposure explicit and tied to the CLI serve runtime."
      ],
      dependencies: ["api-route:/api/state"],
      confidence: 0.7
    });
  }

  if (uiFiles.length) {
    specs.push({
      id: "architecture.visual.app.ui",
      title: "Visual App UI",
      summary: "Browser interface inferred from UI entrypoints, component files, and React/Vite package dependencies.",
      sourceFiles: uiFiles,
      responsibilities: [
        "Render the abstraction hierarchy, files, concepts, invariants, change history, and automation health for human inspection.",
        "Consume local project state exposed by the visual app API when present."
      ],
      dependencies: ["api-route:/api/state", ...packageEvidence(uiPackages)],
      confidence: 0.72
    });
  }

  const localApiFiles = uniqueFilePaths(files.filter(file => isApiRouteFile(file)));
  if (localApiFiles.length) {
    specs.push({
      id: "architecture.local.api.routes",
      title: "Local API Routes",
      summary: "Local API boundary inferred from source files under API or route folders.",
      sourceFiles: localApiFiles,
      responsibilities: [
        "Handle local request/response entrypoints represented by API route files.",
        "Delegate request work to nearby services through resolved local imports when available."
      ],
      confidence: 0.7
    });
  }

  const dataflowFiles = uniqueFilePaths(inferRuntimeDataflowFiles(files, importGraph));
  if (dataflowFiles.length >= 2) {
    specs.push({
      id: "architecture.runtime.dataflow",
      title: "Runtime Dataflow",
      summary: "Runtime data movement inferred from resolved imports between API/route entrypoints and service or data modules.",
      sourceFiles: dataflowFiles,
      responsibilities: [
        "Connect local entrypoints to service, data, model, or pipeline modules that perform request work.",
        "Expose dependency edges that are visible through deterministic import resolution."
      ],
      confidence: 0.68
    });
  }

  const distributionFiles = uniqueFilePaths([
    ...files.filter(file => isPackageManifestFile(file)),
    ...files.filter(file => /(^|\/)package-lock\.json$/.test(file.path)),
    ...workspacePackages.flatMap(pkg => files.filter(file => file.path === pkg.entrypoint))
  ]);
  if (distributionFiles.length) {
    specs.push({
      id: "architecture.package.distribution",
      title: "Package Distribution",
      summary: "Published package and workspace boundaries inferred from package manifests, npm workspace metadata, entrypoints, and bin commands.",
      sourceFiles: distributionFiles,
      responsibilities: [
        "Represent installable package boundaries, published entrypoints, package scripts, and command aliases.",
        "Connect package manifests to the runtime surfaces they expose."
      ],
      dependencies: workspacePackages.flatMap(packageDistributionEvidence),
      confidence: workspacePackages.length ? 0.78 : 0.62
    });
  }

  return specs.map(spec => architectureNode(spec, architectureLevel, parentId, files, importGraph));
}

function architectureNode(
  spec: ArchitectureSpec,
  architectureLevel: TreeNode["level"],
  parentId: string,
  files: FileSummary[],
  importGraph?: ImportGraph
): TreeNode {
  const sourceFiles = existingFilePaths(spec.sourceFiles, files);
  const n = node(spec.id, spec.title, architectureLevel, spec.summary, parentId);
  n.sourceFiles = sourceFiles;
  n.ownedFiles = sourceFiles;
  n.changePolicy.allowedToChange = [...sourceFiles];
  n.responsibilities = spec.responsibilities;
  n.dependencies = uniqueStrings([
    ...sourceFiles.map(filePath => fileNodeId(filePath)),
    ...dependencyRefsForFiles(sourceFiles, files, importGraph),
    ...(spec.dependencies ?? [])
  ]).sort();
  n.dependsOn = n.dependencies;
  n.confidence = spec.confidence ?? 0.68;
  return n;
}

function dependencyRefsForFiles(sourceFiles: string[], files: FileSummary[], importGraph?: ImportGraph): string[] {
  const sourceFileSet = new Set(sourceFiles);
  const fileByPath = new Map(files.map(file => [file.path, file]));
  const refs: string[] = [];

  for (const filePath of sourceFiles) {
    const file = fileByPath.get(filePath);
    refs.push(...(file?.imports ?? []).map(specifier => `import:${specifier}`));
  }

  for (const edge of importGraph?.edges ?? []) {
    if (!sourceFileSet.has(edge.from)) continue;
    refs.push(fileNodeId(edge.to), `import:${edge.specifier}`);
    if (edge.packageName) refs.push(`package:${edge.packageName}`);
  }

  for (const externalImport of importGraph?.externalImports ?? []) {
    if (sourceFileSet.has(externalImport.from)) refs.push(`package:${externalImport.packageName}`);
  }

  for (const pkg of importGraph?.workspacePackages ?? []) {
    if (!sourceFiles.some(filePath => filePath === pkg.manifestPath || filePath === pkg.entrypoint || isUnderRepoPath(filePath, pkg.root))) continue;
    refs.push(...packageEvidence([pkg]));
  }

  return refs;
}

function inferRuntimeDataflowFiles(files: FileSummary[], importGraph?: ImportGraph): FileSummary[] {
  const fileByPath = new Map(files.map(file => [file.path, file]));
  const entrypointPaths = new Set(files.filter(file => isApiRouteFile(file)).map(file => file.path));
  const paths = new Set<string>(entrypointPaths);

  for (const edge of importGraph?.edges ?? []) {
    if (!entrypointPaths.has(edge.from)) continue;
    const target = fileByPath.get(edge.to);
    if (target && isRuntimeDataModule(target)) paths.add(target.path);
  }

  return [...paths].map(filePath => fileByPath.get(filePath)).filter((file): file is FileSummary => Boolean(file));
}

function filesForPackages(files: FileSummary[], packages: WorkspacePackage[]): FileSummary[] {
  return packages.flatMap(pkg =>
    files.filter(file =>
      file.path === pkg.manifestPath ||
      file.path === pkg.entrypoint ||
      (isUnderRepoPath(file.path, pkg.root) && !file.isTest && isSourceOrBinFile(file))
    )
  );
}

function packageEvidence(packages: WorkspacePackage[]): string[] {
  return packages.flatMap(pkg => [
    `package:${pkg.name}`,
    `manifest:${pkg.manifestPath}`,
    ...(pkg.entrypoint ? [`entrypoint:${pkg.entrypoint}`] : []),
    ...(pkg.binCommands ?? []).map(command => `bin:${command}`)
  ]);
}

function packageDistributionEvidence(pkg: WorkspacePackage): string[] {
  return [
    ...packageEvidence([pkg]),
    ...(pkg.scriptNames ?? []).map(script => `script:${pkg.name}:${script}`),
    ...(pkg.dependencyPackageNames ?? []).map(dependency => `package:${dependency}`)
  ];
}

function isCliSurfaceFile(file: FileSummary): boolean {
  return !file.isTest && (
    /(^|\/)(cli|bin)\//.test(file.path) ||
    hasAny(file.imports, ["commander", "yargs", "cac", "meow"])
  );
}

function isPipelineFile(file: FileSummary): boolean {
  if (file.isTest) return false;
  return new Set(["scanner.ts", "importGraph.ts", "treeBuilder.ts", "context.ts", "contextLimits.ts"]).has(path.basename(file.path));
}

function isLocalServerFile(file: FileSummary): boolean {
  if (file.isTest) return false;
  return hasAny(file.imports, ["node:http", "http", "sirv", "express", "fastify", "hono", "koa"]);
}

function isApiRouteFile(file: FileSummary): boolean {
  return !file.isTest && /(^|\/)(api|routes?)\//.test(file.path);
}

function isRuntimeDataModule(file: FileSummary): boolean {
  return !file.isTest && /(^|\/)(services?|data|models?|pipeline|features?)\//.test(file.path);
}

function isUiFile(file: FileSummary): boolean {
  if (file.isTest) return false;
  return /\.(tsx|jsx|vue|svelte)$/.test(file.path) || /(^|\/)(components?|pages?|views?|app)\//.test(file.path);
}

function isPackageManifestFile(file: FileSummary): boolean {
  return /(^|\/)package\.json$/.test(file.path);
}

function isSourceOrBinFile(file: FileSummary): boolean {
  return /(^|\/)(src|bin)\//.test(file.path) || isPackageManifestFile(file);
}

function existingFilePaths(sourceFiles: string[], files: FileSummary[]): string[] {
  const filePaths = new Set(files.map(file => file.path));
  return uniqueStrings(sourceFiles.filter(filePath => filePaths.has(filePath))).sort();
}

function uniqueFilePaths(files: FileSummary[]): string[] {
  return uniqueStrings(files.map(file => file.path)).sort();
}

function fileNodeId(filePath: string): string {
  return `file.${slug(filePath)}`;
}

function packageLeaf(pkg: WorkspacePackage): string {
  const leaf = pkg.name.includes("/") ? pkg.name.split("/").at(-1) ?? pkg.name : path.posix.basename(pkg.root);
  return leaf.toLowerCase();
}

function isUnderRepoPath(filePath: string, root: string): boolean {
  return filePath === root || filePath.startsWith(root.replace(/\/+$/g, "") + "/");
}

function hasAny(values: string[] | undefined, candidates: string[]): boolean {
  const valueSet = new Set(values ?? []);
  return candidates.some(candidate => valueSet.has(candidate));
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function addConceptTerms(
  candidates: Map<string, ConceptCandidate>,
  terms: string[],
  filePath: string,
  value: string,
  kind: ConceptEvidenceKind
) {
  for (const term of terms) addConceptSignal(candidates, term, filePath, value, kind);
}

function addConceptSignal(
  candidates: Map<string, ConceptCandidate>,
  term: string,
  filePath: string,
  value: string,
  kind: ConceptEvidenceKind
) {
  if (!term || isStoppedConceptTerm(term)) return;
  const score = conceptSignalScore(kind, term);
  if (score <= 0) return;

  const existing = candidates.get(term) ?? {
    term,
    files: new Set<string>(),
    score: 0,
    signals: new Set<ConceptEvidenceKind>(),
    tags: new Set<string>(),
    evidence: []
  };
  const evidenceKey = conceptEvidenceKey(kind, filePath, value, term);
  const hasEvidence = existing.evidence.some(evidence => conceptEvidenceKey(evidence.kind, evidence.filePath, evidence.value, evidence.term) === evidenceKey);

  existing.files.add(filePath);
  existing.score += score;
  existing.signals.add(kind);
  existing.tags.add(term);
  if (!hasEvidence) existing.evidence.push({ kind, filePath, value, term, score });
  candidates.set(term, existing);
}

function conceptTerms(input: string, options: { sourceKind?: ConceptEvidenceKind } = {}): string[] {
  if (options.sourceKind === "path" || options.sourceKind === "doc") {
    return uniqueStrings(input.split(/[\\/]+/).flatMap(segment => termsFromWords(conceptWords(segment))));
  }

  return termsFromWords(conceptWords(input));
}

function termsFromWords(inputWords: string[]): string[] {
  const words = trimLeadingActionWords(inputWords);
  const terms: string[] = [];

  for (const word of words) {
    if (!SINGLE_WORD_CONCEPT_STOP_WORDS.has(word)) terms.push(word);
  }

  for (const compound of adjacentCompounds(words, 2, 3)) {
    if (isUsefulCompound(compound)) terms.push(compound.join(" "));
  }

  return uniqueStrings(terms).filter(term => !isStoppedConceptTerm(term));
}

function conceptWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(singularizeConceptWord)
    .filter(token => token.length >= 3 && !CONCEPT_STOP_WORDS.has(token));
}

function trimLeadingActionWords(words: string[]): string[] {
  let start = 0;
  while (start < words.length - 1 && LEADING_ACTION_WORDS.has(words[start])) start += 1;
  return words.slice(start);
}

function adjacentCompounds(words: string[], minSize: number, maxSize: number): string[][] {
  const compounds: string[][] = [];
  for (let size = minSize; size <= maxSize; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      compounds.push(words.slice(index, index + size));
    }
  }
  return compounds;
}

function isUsefulCompound(words: string[]): boolean {
  if (words.length < 2) return false;
  if (words.every(word => SINGLE_WORD_CONCEPT_STOP_WORDS.has(word) || DOC_FILLER_WORDS.has(word))) return false;
  return words.some(word => !SINGLE_WORD_CONCEPT_STOP_WORDS.has(word));
}

function isStoppedConceptTerm(term: string): boolean {
  const words = term.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  if (words.some(word => CONCEPT_STOP_WORDS.has(word))) return true;
  return words.length === 1 && SINGLE_WORD_CONCEPT_STOP_WORDS.has(words[0]);
}

function isQualityConcept(candidate: ConceptCandidate): boolean {
  const words = candidate.term.split(/\s+/);
  const isCompound = words.length > 1;
  const hasCodeSignal = candidate.signals.has("symbol") || candidate.signals.has("export");
  const hasPathSignal = candidate.signals.has("path");
  const hasNonDocSignal = [...candidate.signals].some(signal => signal !== "doc");
  const docOnly = !hasNonDocSignal;

  if (docOnly) return isCompound && candidate.files.size >= 2 && candidate.score >= 6;
  if (isCompound) return candidate.score >= 4 && (hasCodeSignal || candidate.files.size >= 2 || candidate.signals.size >= 2);
  if (hasCodeSignal) return candidate.files.size >= 2 || candidate.score >= 7 || (hasPathSignal && candidate.score >= 5);
  return candidate.files.size >= 2 && candidate.score >= 4;
}

function pruneShadowedSingleConcepts(candidates: ConceptCandidate[]): ConceptCandidate[] {
  const compoundWords = new Set(
    candidates
      .filter(candidate => candidate.term.includes(" "))
      .flatMap(candidate => candidate.term.split(/\s+/))
  );

  return candidates.filter(candidate => {
    if (candidate.term.includes(" ")) return true;
    if (!SHADOWED_BY_COMPOUND_WORDS.has(candidate.term)) return true;
    return !compoundWords.has(candidate.term);
  });
}

function conceptSignalScore(kind: ConceptEvidenceKind, term: string): number {
  const baseScore = CONCEPT_SIGNAL_WEIGHT[kind];
  const words = term.split(/\s+/);
  const docPenalty = words.some(word => DOC_FILLER_WORDS.has(word)) ? 0.5 : 1;
  const singleGenericPenalty = words.length === 1 && SINGLE_WORD_CONCEPT_STOP_WORDS.has(words[0]) ? 0 : 1;
  return baseScore * docPenalty * singleGenericPenalty;
}

function sortedTags(candidate: ConceptCandidate): string[] {
  return uniqueStrings([candidate.term, ...candidate.tags]).sort((a, b) => a.localeCompare(b));
}

function sortedConceptEvidence(evidence: ConceptEvidence[]): ConceptEvidence[] {
  return [...evidence].sort((a, b) =>
    a.kind.localeCompare(b.kind) ||
    a.filePath.localeCompare(b.filePath) ||
    a.term.localeCompare(b.term) ||
    a.value.localeCompare(b.value)
  );
}

function conceptEvidenceKey(kind: ConceptEvidenceKind, filePath: string, value: string, term: string): string {
  return [kind, filePath, value, term].join("\0");
}

function singularizeConceptWord(word: string): string {
  if (word === "children") return "child";
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|xes|zes|ses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function isMarkdownFile(file: FileSummary): boolean {
  return file.extension.toLowerCase() === ".md" || file.language.toLowerCase() === "markdown";
}
