import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ExternalImport,
  FileSummary,
  ImportClassification,
  ImportAliasPattern,
  ImportCycle,
  ImportGraph,
  ImportGraphEdge,
  ImportGraphEdgeKind,
  UnresolvedImport,
  WorkspacePackage
} from "./schema.js";
import { discoverImportResolution } from "./importAliases.js";

export interface BuildImportGraphOptions {
  workspacePackages?: WorkspacePackage[];
  importAliases?: ImportAliasPattern[];
  rootDirs?: string[];
  rustPackages?: RustPackageRoot[];
  goModules?: GoModuleRoot[];
}

type PackageManifest = Record<string, unknown>;
interface WorkspacePatternSpec {
  pattern: string;
  excluded: boolean;
}
interface GeneratedPackageArtifactResolution {
  to: string;
  packageName: string;
}
interface AliasRule extends ImportAliasPattern {
  order: number;
}
interface AliasMatch {
  candidate: string;
  rule: AliasRule;
}
interface AliasResolution {
  to?: string;
  rule?: AliasRule;
  matched: boolean;
}
interface PythonPackageRoot {
  name: string;
  root: string;
}
interface PythonResolution {
  to: string;
  packageName: string;
}
export interface RustPackageRoot {
  name: string;
  crateName: string;
  root: string;
  manifestPath: string;
  entrypoints: string[];
}
interface RustResolution {
  to: string;
  packageName: string;
}
export interface GoModuleRoot {
  modulePath: string;
  root: string;
  manifestPath: string;
}
interface GoResolution {
  to?: string;
  modulePath: string;
  matched: boolean;
}

const JAVASCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const PYTHON_EXTENSIONS = new Set([".py"]);
const RUST_EXTENSIONS = new Set([".rs"]);
const GO_EXTENSIONS = new Set([".go"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const IMPORT_GRAPH_EXTENSIONS = new Set([...JAVASCRIPT_EXTENSIONS, ...PYTHON_EXTENSIONS, ...RUST_EXTENSIONS, ...GO_EXTENSIONS, ...MARKDOWN_EXTENSIONS]);
const JAVASCRIPT_RESOLUTION_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const PYTHON_RESOLUTION_EXTENSIONS = [".py"];
const RUST_RESOLUTION_EXTENSIONS = [".rs"];
const MARKDOWN_RESOLUTION_EXTENSIONS = [
  ".md", ".mdx", ".rst",
  ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".json", ".toml", ".yaml", ".yml"
];
const STATIC_ASSET_EXTENSIONS = new Set([
  ".avif", ".bmp", ".css", ".gif", ".ico", ".jpeg", ".jpg", ".less", ".mp3", ".mp4",
  ".otf", ".pdf", ".png", ".sass", ".scss", ".svg", ".ttf", ".wasm", ".webp", ".woff",
  ".woff2", ".worker"
]);
const STATIC_ASSET_QUERY_KEYS = new Set(["asset", "component", "inline", "raw", "react", "sharedworker", "url", "worker"]);
const EXTENSION_ALIASES: Record<string, string[]> = {
  ".js": [".ts", ".tsx", ".js", ".jsx"],
  ".jsx": [".tsx", ".jsx"],
  ".mjs": [".mts", ".mjs", ".ts", ".js"],
  ".cjs": [".cts", ".cjs", ".ts", ".js"]
};
const GENERATED_PACKAGE_BUILD_DIRS = new Set(["dist", "dist-ts"]);
const GENERATED_ARTIFACT_DIRS = new Set([".vite", "build", "coverage", "dist", "dist-ts"]);

export function emptyImportGraph(): ImportGraph {
  return {
    edges: [],
    externalImports: [],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: []
  };
}

export async function buildImportGraph(projectRoot: string, files: FileSummary[], options: BuildImportGraphOptions = {}): Promise<ImportGraph> {
  const [workspacePackages, rustPackages, goModules, importResolution] = await Promise.all([
    options.workspacePackages ? Promise.resolve(normalizeWorkspacePackages(options.workspacePackages)) : discoverWorkspacePackages(projectRoot, files),
    options.rustPackages ? Promise.resolve(normalizeRustPackages(options.rustPackages)) : discoverRustPackageRoots(projectRoot, files),
    options.goModules ? Promise.resolve(normalizeGoModules(options.goModules)) : discoverGoModuleRoots(projectRoot, files),
    discoverImportResolution(projectRoot, files, options.importAliases ?? [])
  ]);
  return buildImportGraphFromFiles(files, {
    ...options,
    workspacePackages,
    rustPackages,
    goModules,
    importAliases: importResolution.importAliases,
    rootDirs: uniqueStrings([...(options.rootDirs ?? []), ...importResolution.rootDirs])
  });
}

export function buildImportGraphFromFiles(files: FileSummary[], options: BuildImportGraphOptions = {}): ImportGraph {
  const fileSet = new Set(files.map(file => file.path));
  const workspacePackages = normalizeWorkspacePackages(options.workspacePackages ?? []);
  const workspaceByName = new Map(workspacePackages.map(pkg => [pkg.name, pkg]));
  const aliasRules = normalizeAliasRules(options.importAliases ?? []);
  const rootDirs = normalizeRootDirs(options.rootDirs ?? []);
  const pythonPackages = inferPythonPackageRoots(files);
  const rustPackages = normalizeRustPackages(options.rustPackages ?? inferRustPackageRoots(files));
  const goModules = normalizeGoModules(options.goModules ?? inferGoModuleRoots(files));
  const edges: ImportGraphEdge[] = [];
  const externalImports: ExternalImport[] = [];
  const unresolvedImports: UnresolvedImport[] = [];

  for (const file of files.filter(isImportGraphFile).sort((a, b) => a.path.localeCompare(b.path))) {
    for (const specifier of [...file.imports].sort()) {
      const classification = classifyImportSpecifier(file.path, specifier, workspacePackages);
      if (classification === "virtual") {
        externalImports.push({
          from: file.path,
          specifier,
          packageName: "virtual",
          ...classificationField(classification)
        });
        continue;
      }

      if (isRelativeSpecifier(file.path, specifier)) {
        const edgeKind = relativeEdgeKindForFile(file.path);
        const to = resolveRelativeSpecifier(file.path, specifier, fileSet, rootDirs);
        if (to) {
          edges.push({ from: file.path, to, specifier, kind: edgeKind, ...classificationField(classification) });
        } else {
          const generatedArtifact = resolveGeneratedPackageArtifactSpecifier(file.path, specifier, workspacePackages, fileSet);
          if (generatedArtifact) {
            edges.push({
              from: file.path,
              to: generatedArtifact.to,
              specifier,
              kind: "workspace-package",
              ...classificationField("generated-artifact"),
              packageName: generatedArtifact.packageName
            });
            continue;
          }
          unresolvedImports.push(unresolved(
            file.path,
            specifier,
            edgeKind,
            unresolvedReasonForClassification(classification, `${edgeKind === "markdown-link" ? "Markdown link" : "Relative import"} could not be resolved to a scanned repository file.`),
            undefined,
            undefined,
            classification
          ));
        }
        continue;
      }

      const aliasResolution = resolveAliasSpecifier(specifier, aliasRules, fileSet);
      if (aliasResolution.to && aliasResolution.rule) {
        edges.push({
          from: file.path,
          to: aliasResolution.to,
          specifier,
          kind: "alias",
          ...classificationField(classification),
          aliasSource: aliasSource(aliasResolution.rule)
        });
        continue;
      }
      if (aliasResolution.matched && aliasResolution.rule) {
        unresolvedImports.push(unresolved(
          file.path,
          specifier,
          "alias",
          unresolvedReasonForClassification(classification, aliasUnresolvedReason(aliasResolution.rule)),
          undefined,
          aliasSource(aliasResolution.rule),
          classification
        ));
        continue;
      }
      if (looksLikeUnconfiguredAlias(specifier)) {
        unresolvedImports.push(unresolved(
          file.path,
          specifier,
          "alias",
          unresolvedReasonForClassification(classification, "Import looks like a local alias, but no TypeScript paths, bundler alias, or configured importAliases entry matched it. Configure compilerOptions.paths, a supported bundler resolve.alias, or .abstraction-tree config importAliases."),
          undefined,
          undefined,
          classification
        ));
        continue;
      }

      const goResolution = isGoFilePath(file.path)
        ? resolveGoModuleSpecifier(file.path, specifier, goModules, fileSet)
        : undefined;
      if (goResolution?.to) {
        edges.push({
          from: file.path,
          to: goResolution.to,
          specifier,
          kind: "go-package",
          ...classificationField(classification),
          packageName: goResolution.modulePath
        });
        continue;
      }
      if (goResolution?.matched) {
        unresolvedImports.push(unresolved(
          file.path,
          specifier,
          "go-package",
          unresolvedReasonForClassification(classification, "Go module import matched the local module path, but its package directory could not be resolved to a scanned Go file."),
          goResolution.modulePath,
          undefined,
          classification
        ));
        continue;
      }

      const packageName = packageNameFromSpecifier(file.path, specifier);
      const workspacePackage = packageName ? workspaceByName.get(packageName) : undefined;
      if (workspacePackage) {
        const workspaceResolution = resolveWorkspaceSpecifier(file.path, specifier, workspacePackage, fileSet);
        if (workspaceResolution) {
          edges.push({
            from: file.path,
            to: workspaceResolution,
            specifier,
            kind: "workspace-package",
            ...classificationField(classification),
            packageName
          });
        } else {
          unresolvedImports.push(unresolved(
            file.path,
            specifier,
            "workspace-package",
            unresolvedReasonForClassification(classification, "Workspace package import was recognized, but its subpath could not be resolved."),
            packageName,
            undefined,
            classification
          ));
        }
        continue;
      }

      const pythonResolution = isPythonFilePath(file.path)
        ? resolvePythonAbsoluteSpecifier(specifier, pythonPackages, fileSet)
        : undefined;
      if (pythonResolution) {
        edges.push({
          from: file.path,
          to: pythonResolution.to,
          specifier,
          kind: "workspace-package",
          ...classificationField(classification),
          packageName: pythonResolution.packageName
        });
        continue;
      }

      const rustResolution = isRustFilePath(file.path)
        ? resolveRustAbsoluteSpecifier(file.path, specifier, rustPackages, fileSet)
        : undefined;
      if (rustResolution) {
        edges.push({
          from: file.path,
          to: rustResolution.to,
          specifier,
          kind: "workspace-package",
          ...classificationField(classification),
          packageName: rustResolution.packageName
        });
        continue;
      }

      if (packageName) {
        externalImports.push({ from: file.path, specifier, packageName, ...classificationField(classification) });
      }
    }
  }

  const uniqueEdges = uniqueBy(edges, edgeKey).sort(byEdge);
  return {
    edges: uniqueEdges,
    externalImports: uniqueBy(externalImports, item => `${item.from}|${item.specifier}|${item.packageName}|${item.classification ?? ""}`).sort(byExternalImport),
    unresolvedImports: uniqueBy(unresolvedImports, item => `${item.from}|${item.specifier}|${item.kind}|${item.packageName ?? ""}|${item.aliasSource ?? ""}|${item.classification ?? ""}`).sort(byUnresolvedImport),
    cycles: detectImportCycles(uniqueEdges, fileSet),
    workspacePackages
  };
}

export async function discoverWorkspacePackages(projectRoot: string, files: FileSummary[]): Promise<WorkspacePackage[]> {
  const rootManifest = await readPackageManifest(projectRoot);
  const patterns = [
    ...packageJsonWorkspacePatterns(rootManifest),
    ...await pnpmWorkspacePatterns(projectRoot)
  ];
  if (!patterns.some(pattern => !pattern.excluded)) return [];

  const roots = new Set<string>();
  for (const { pattern, excluded } of patterns) {
    if (excluded) continue;
    for (const root of await expandWorkspacePattern(projectRoot, pattern)) {
      roots.add(root);
    }
  }

  const excludedPatterns = patterns.filter(pattern => pattern.excluded).map(pattern => pattern.pattern);
  for (const root of [...roots]) {
    if (excludedPatterns.some(pattern => workspacePatternMatchesRoot(root, pattern))) {
      roots.delete(root);
    }
  }

  const fileSet = new Set(files.map(file => file.path));
  const packages: WorkspacePackage[] = [];
  for (const root of [...roots].sort()) {
    const manifest = await readPackageManifest(path.join(projectRoot, repoPathToNative(root)));
    const name = stringField(manifest, "name");
    if (!name) continue;

    const entrypoint = resolvePackageEntrypoint(root, manifest, fileSet);
    packages.push({
      name,
      root,
      manifestPath: repoJoin(root, "package.json"),
      ...(entrypoint ? { entrypoint } : {}),
      ...optionalStringArrayFields({
        binCommands: packageBinCommands(manifest, name),
        scriptNames: packageScriptNames(manifest),
        dependencyPackageNames: packageDependencyNames(manifest)
      })
    });
  }

  return normalizeWorkspacePackages(packages);
}

async function discoverRustPackageRoots(projectRoot: string, files: FileSummary[]): Promise<RustPackageRoot[]> {
  const fileSet = new Set(files.map(file => file.path));
  const packages: RustPackageRoot[] = [];

  for (const file of files.filter(isRustManifestFile).sort((a, b) => a.path.localeCompare(b.path))) {
    const manifestPath = file.path;
    const root = path.posix.dirname(manifestPath);
    const normalizedRoot = root === "." ? "." : root;
    const raw = await readTextFile(path.join(projectRoot, repoPathToNative(manifestPath)));
    const parsed = raw ? parseCargoManifest(raw) : { binPaths: [] };
    const name = parsed.packageName ?? rustPackageNameFromSummary(file) ?? rustPackageNameFromRoot(normalizedRoot);
    if (!name) continue;
    packages.push({
      name,
      crateName: rustCrateName(name),
      root: normalizedRoot,
      manifestPath,
      entrypoints: rustEntrypointsForRoot(normalizedRoot, fileSet, parsed.binPaths)
    });
  }

  return normalizeRustPackages(packages);
}

async function discoverGoModuleRoots(projectRoot: string, files: FileSummary[]): Promise<GoModuleRoot[]> {
  const modules: GoModuleRoot[] = [];

  for (const file of files.filter(isGoModFile).sort((a, b) => a.path.localeCompare(b.path))) {
    const manifestPath = file.path;
    const root = path.posix.dirname(manifestPath);
    const normalizedRoot = root === "." ? "." : root;
    const raw = await readTextFile(path.join(projectRoot, repoPathToNative(manifestPath)));
    const modulePath = raw ? parseGoModulePath(raw) : goModulePathFromSummary(file);
    if (!modulePath) continue;
    modules.push({
      modulePath,
      root: normalizedRoot,
      manifestPath
    });
  }

  return normalizeGoModules(modules);
}

function inferRustPackageRoots(files: FileSummary[]): RustPackageRoot[] {
  const fileSet = new Set(files.map(file => file.path));
  return normalizeRustPackages(files
    .filter(isRustManifestFile)
    .map(file => {
      const root = path.posix.dirname(file.path);
      const normalizedRoot = root === "." ? "." : root;
      const name = rustPackageNameFromSummary(file) ?? rustPackageNameFromRoot(normalizedRoot);
      return {
        name,
        crateName: rustCrateName(name),
        root: normalizedRoot,
        manifestPath: file.path,
        entrypoints: rustEntrypointsForRoot(normalizedRoot, fileSet, rustBinPathsFromSummary(file))
      };
    }));
}

function inferGoModuleRoots(files: FileSummary[]): GoModuleRoot[] {
  return normalizeGoModules(files
    .filter(isGoModFile)
    .flatMap(file => {
      const modulePath = goModulePathFromSummary(file);
      if (!modulePath) return [];
      const root = path.posix.dirname(file.path);
      return [{
        modulePath,
        root: root === "." ? "." : root,
        manifestPath: file.path
      }];
    }));
}

function parseCargoManifest(raw: string): { packageName?: string; binPaths: string[] } {
  let section = "";
  let packageName: string | undefined;
  const binPaths: string[] = [];

  for (const rawLine of raw.split(/\r?\n/u)) {
    const line = yamlWithoutComment(rawLine).trim();
    const sectionMatch = line.match(/^\[\[?([A-Za-z0-9_.-]+)\]?\]\s*$/u);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const keyValue = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/u);
    if (!keyValue) continue;
    const key = keyValue[1];
    const value = keyValue[2];
    if (section === "package" && key === "name") packageName = value;
    if (section === "bin" && key === "path") binPaths.push(value);
  }

  return {
    ...(packageName ? { packageName } : {}),
    binPaths: uniqueStrings(binPaths)
  };
}

function parseGoModulePath(raw: string): string | undefined {
  for (const rawLine of raw.split(/\r?\n/u)) {
    const line = rawLine.replace(/\/\/.*$/u, "").trim();
    const moduleMatch = line.match(/^module\s+(\S+)/u);
    if (moduleMatch?.[1]) return moduleMatch[1];
  }
  return undefined;
}

function goModulePathFromSummary(file: FileSummary): string | undefined {
  const symbol = file.symbols.find(symbol => symbol.startsWith("go.module:"));
  return symbol?.slice("go.module:".length);
}

function rustPackageNameFromSummary(file: FileSummary): string | undefined {
  const symbol = file.symbols.find(symbol => symbol.startsWith("package.name:"));
  return symbol?.slice("package.name:".length);
}

function rustBinPathsFromSummary(file: FileSummary): string[] {
  return file.symbols
    .filter(symbol => symbol.startsWith("bin.path:"))
    .map(symbol => normalizeRepoPath(symbol.slice("bin.path:".length)));
}

function rustEntrypointsForRoot(root: string, fileSet: Set<string>, binPaths: string[] = []): string[] {
  const explicit = binPaths.map(binPath => repoJoin(root, binPath));
  const defaults = [
    repoJoin(root, "src/lib.rs"),
    repoJoin(root, "src/main.rs"),
    ...[...fileSet].filter(filePath => pathContains(repoJoin(root, "src/bin"), filePath) && path.posix.extname(filePath) === ".rs")
  ];
  return uniqueStrings([...explicit, ...defaults].filter(filePath => fileSet.has(filePath))).sort();
}

function rustPackageNameFromRoot(root: string): string {
  if (root === ".") return "crate";
  return path.posix.basename(root);
}

function rustCrateName(packageName: string): string {
  return packageName.replace(/-/gu, "_");
}

function isRustManifestFile(file: FileSummary): boolean {
  return path.posix.basename(file.path).toLowerCase() === "cargo.toml";
}

function isGoModFile(file: FileSummary): boolean {
  return path.posix.basename(file.path).toLowerCase() === "go.mod";
}

function inferPythonPackageRoots(files: FileSummary[]): PythonPackageRoot[] {
  const roots = new Map<string, PythonPackageRoot>();

  for (const file of files) {
    if (!isPythonFilePath(file.path) || file.isTest || isPythonProjectSupportFile(file.path)) continue;
    const root = pythonPackageRootForPath(file.path);
    if (!root) continue;
    roots.set(root.root, root);
  }

  return [...roots.values()].sort((a, b) => a.root.localeCompare(b.root));
}

function pythonPackageRootForPath(filePath: string): PythonPackageRoot | undefined {
  const normalized = normalizeRepoPath(filePath);
  const parts = normalized.split("/");
  const srcIndex = parts.lastIndexOf("src");
  if (srcIndex >= 0 && parts[srcIndex + 1] && isPythonPackageName(parts[srcIndex + 1])) {
    return {
      name: parts[srcIndex + 1],
      root: parts.slice(0, srcIndex + 2).join("/")
    };
  }

  const packageIndex = parts.findIndex(part => isPythonPackageName(part) && !PYTHON_NON_PACKAGE_DIRS.has(part.toLowerCase()));
  if (packageIndex >= 0 && parts.length > packageIndex + 1) {
    return {
      name: parts[packageIndex],
      root: parts.slice(0, packageIndex + 1).join("/")
    };
  }

  return undefined;
}

function isPythonProjectSupportFile(filePath: string): boolean {
  const basename = path.posix.basename(filePath).toLowerCase();
  return ["setup.py", "noxfile.py", "conftest.py"].includes(basename) || /(^|\/)docs\/conf\.py$/u.test(filePath.toLowerCase());
}

const PYTHON_NON_PACKAGE_DIRS = new Set([
  ".github", "build", "dist", "docs", "examples", "scripts", "test", "tests", "tools"
]);

function isPythonPackageName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value) && !value.startsWith("_");
}

function isImportGraphFile(file: FileSummary): boolean {
  return IMPORT_GRAPH_EXTENSIONS.has(file.extension.toLowerCase());
}

function isPythonFilePath(filePath: string): boolean {
  return path.posix.extname(filePath).toLowerCase() === ".py";
}

function isRustFilePath(filePath: string): boolean {
  return path.posix.extname(filePath).toLowerCase() === ".rs";
}

function isGoFilePath(filePath: string): boolean {
  return path.posix.extname(filePath).toLowerCase() === ".go";
}

function isMarkdownFilePath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase());
}

function resolutionExtensionsForFile(filePath: string): string[] {
  if (isRustFilePath(filePath)) return RUST_RESOLUTION_EXTENSIONS;
  if (isMarkdownFilePath(filePath)) return MARKDOWN_RESOLUTION_EXTENSIONS;
  return isPythonFilePath(filePath) ? PYTHON_RESOLUTION_EXTENSIONS : JAVASCRIPT_RESOLUTION_EXTENSIONS;
}

function isRelativeSpecifier(from: string, specifier: string): boolean {
  return specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    (isPythonFilePath(from) && specifier.startsWith(".")) ||
    (isRustFilePath(from) && isRustRelativeModuleSpecifier(specifier)) ||
    (isMarkdownFilePath(from) && isMarkdownLocalLinkSpecifier(specifier));
}

function relativeEdgeKindForFile(filePath: string): ImportGraphEdgeKind {
  return isMarkdownFilePath(filePath) ? "markdown-link" : "relative";
}

function classifyImportSpecifier(from: string, specifier: string, workspacePackages: WorkspacePackage[]): ImportClassification {
  if (isVirtualSpecifier(specifier)) return "virtual";
  if (isStaticAssetSpecifier(specifier)) return "static-asset";
  if (isGeneratedArtifactSpecifier(from, specifier, workspacePackages)) return "generated-artifact";
  return "source";
}

function classificationField(classification: ImportClassification): { classification?: ImportClassification } {
  return classification === "source" ? {} : { classification };
}

function isVirtualSpecifier(specifier: string): boolean {
  return specifier.startsWith("virtual:") ||
    specifier.startsWith("\0") ||
    specifier.startsWith("/@vite/") ||
    specifier.startsWith("/@react-refresh") ||
    specifier === "@vite/client" ||
    specifier === "@vite/env" ||
    specifier === "vite/modulepreload-polyfill";
}

function isStaticAssetSpecifier(specifier: string): boolean {
  const { path: specifierPath, queryKeys } = splitSpecifierForClassification(specifier);
  if ([...queryKeys].some(key => STATIC_ASSET_QUERY_KEYS.has(key.toLowerCase()))) return true;

  return STATIC_ASSET_EXTENSIONS.has(path.posix.extname(specifierPath).toLowerCase());
}

function isGeneratedArtifactSpecifier(from: string, specifier: string, workspacePackages: WorkspacePackage[]): boolean {
  if (isRelativeSpecifier(from, specifier)) {
    const candidate = relativeSpecifierCandidate(from, specifier);
    return candidate ? isGeneratedArtifactPath(candidate, workspacePackages) : false;
  }

  const packageName = packageNameFromSpecifier(from, specifier);
  const workspacePackage = packageName ? workspacePackages.find(pkg => pkg.name === packageName) : undefined;
  if (workspacePackage) {
    const subpath = specifier.slice(workspacePackage.name.length + 1);
    return pathStartsWithGeneratedArtifactDir(subpath);
  }

  return pathStartsWithGeneratedArtifactDir(splitSpecifierForClassification(specifier).path);
}

function splitSpecifierForClassification(specifier: string): { path: string; queryKeys: Set<string> } {
  const [withoutHash] = specifier.split("#", 1);
  const queryIndex = withoutHash.indexOf("?");
  if (queryIndex === -1) return { path: withoutHash, queryKeys: new Set() };

  const query = withoutHash.slice(queryIndex + 1);
  return {
    path: withoutHash.slice(0, queryIndex),
    queryKeys: new Set(query.split("&").map(part => part.split("=", 1)[0]).filter(Boolean))
  };
}

function isGeneratedArtifactPath(candidate: string, workspacePackages: WorkspacePackage[]): boolean {
  if (pathStartsWithGeneratedArtifactDir(candidate)) return true;

  for (const workspacePackage of workspacePackagesBySpecificRoot(workspacePackages)) {
    const packageRelativePath = pathRelativeToPackage(candidate, workspacePackage.root);
    if (packageRelativePath && pathStartsWithGeneratedArtifactDir(packageRelativePath)) return true;
  }

  return false;
}

function pathStartsWithGeneratedArtifactDir(specifierPath: string): boolean {
  const normalized = normalizeRepoPath(specifierPath);
  if (!normalized || normalized === "." || isOutsideRepo(normalized)) return false;

  const segments = normalized.split("/");
  return segments.length > 1 && GENERATED_ARTIFACT_DIRS.has(segments[0]);
}

function unresolvedReasonForClassification(classification: ImportClassification, fallback: string): string {
  switch (classification) {
    case "static-asset":
      return "Static asset import is not resolved to a scanned source file; it is classified separately from unresolved source imports.";
    case "generated-artifact":
      return "Generated artifact import points at build output that is commonly ignored by the scanner; it is classified separately from unresolved source imports.";
    case "virtual":
      return "Virtual module import is supplied by a bundler or runtime plugin and is classified separately from unresolved source imports.";
    case "source":
      return fallback;
  }
}

function resolveRelativeSpecifier(from: string, specifier: string, fileSet: Set<string>, rootDirs: string[] = []): string | undefined {
  const candidate = relativeSpecifierCandidate(from, specifier);
  if (!candidate) return undefined;
  return resolvePathCandidate(candidate, fileSet, resolutionExtensionsForFile(from)) ?? resolveRootDirsCandidate(from, candidate, rootDirs, fileSet);
}

function relativeSpecifierCandidate(from: string, specifier: string): string | undefined {
  if (isRustFilePath(from) && isRustRelativeModuleSpecifier(specifier)) {
    return rustRelativeSpecifierCandidate(from, specifier);
  }

  if (isPythonFilePath(from) && specifier.startsWith(".") && !specifier.startsWith("./") && !specifier.startsWith("../")) {
    return pythonRelativeSpecifierCandidate(from, specifier);
  }

  if (isMarkdownFilePath(from) && isMarkdownLocalLinkSpecifier(specifier)) {
    return markdownRelativeSpecifierCandidate(from, specifier);
  }

  const fromDir = path.posix.dirname(from);
  const candidate = normalizeRepoPath(path.posix.normalize(path.posix.join(fromDir, specifier)));
  if (isOutsideRepo(candidate)) return undefined;
  return candidate;
}

function isRustRelativeModuleSpecifier(specifier: string): boolean {
  return specifier.startsWith("mod:") ||
    specifier.startsWith("self::") ||
    specifier.startsWith("super::");
}

function rustRelativeSpecifierCandidate(from: string, specifier: string): string | undefined {
  let baseDir = path.posix.dirname(from);
  const moduleSpecifier = specifier.startsWith("mod:") ? specifier.slice("mod:".length) : specifier;
  const parts = moduleSpecifier.split("::").filter(Boolean);
  while (parts[0] === "super") {
    baseDir = path.posix.dirname(baseDir);
    parts.shift();
  }
  if (parts[0] === "self") parts.shift();
  if (!parts.length) return undefined;

  const candidate = normalizeRepoPath(path.posix.normalize(path.posix.join(baseDir, parts.join("/"))));
  if (isOutsideRepo(candidate)) return undefined;
  return candidate;
}

function pythonRelativeSpecifierCandidate(from: string, specifier: string): string | undefined {
  const leadingDotMatch = specifier.match(/^\.+/u);
  const leadingDots = leadingDotMatch?.[0].length ?? 0;
  if (!leadingDots) return undefined;

  let baseDir = path.posix.dirname(from);
  for (let index = 1; index < leadingDots; index += 1) {
    baseDir = path.posix.dirname(baseDir);
  }

  const modulePath = specifier.slice(leadingDots).replaceAll(".", "/");
  const candidate = normalizeRepoPath(path.posix.normalize(path.posix.join(baseDir, modulePath)));
  if (isOutsideRepo(candidate)) return undefined;
  return candidate;
}

function isMarkdownLocalLinkSpecifier(specifier: string): boolean {
  const linkPath = markdownLinkSpecifierPath(specifier);
  if (!linkPath) return false;
  if (linkPath.startsWith("#")) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(linkPath) || linkPath.startsWith("//")) return false;
  return true;
}

function markdownRelativeSpecifierCandidate(from: string, specifier: string): string | undefined {
  const linkPath = markdownLinkSpecifierPath(specifier);
  if (!linkPath || !isMarkdownLocalLinkSpecifier(linkPath)) return undefined;

  const decoded = decodeRepoUriPath(linkPath);
  const candidate = decoded.startsWith("/")
    ? normalizeRepoPath(decoded.slice(1))
    : normalizeRepoPath(path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded)));
  if (isOutsideRepo(candidate)) return undefined;
  return candidate;
}

function markdownLinkSpecifierPath(specifier: string): string | undefined {
  const trimmed = specifier.trim().replace(/^<|>$/gu, "");
  if (!trimmed) return undefined;
  const [withoutHash] = trimmed.split("#", 1);
  const [withoutQuery] = withoutHash.split("?", 1);
  return withoutQuery || undefined;
}

function decodeRepoUriPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveGeneratedPackageArtifactSpecifier(
  from: string,
  specifier: string,
  workspacePackages: WorkspacePackage[],
  fileSet: Set<string>
): GeneratedPackageArtifactResolution | undefined {
  const candidate = relativeSpecifierCandidate(from, specifier);
  if (!candidate) return undefined;

  for (const workspacePackage of workspacePackagesBySpecificRoot(workspacePackages)) {
    const artifactSubpath = generatedPackageArtifactSubpath(candidate, workspacePackage);
    if (!artifactSubpath) continue;

    return {
      to: resolveGeneratedPackageArtifactSource(workspacePackage, artifactSubpath, fileSet),
      packageName: workspacePackage.name
    };
  }

  return undefined;
}

function workspacePackagesBySpecificRoot(workspacePackages: WorkspacePackage[]): WorkspacePackage[] {
  return [...workspacePackages].sort((a, b) => b.root.length - a.root.length || a.name.localeCompare(b.name));
}

function generatedPackageArtifactSubpath(candidate: string, workspacePackage: WorkspacePackage): string | undefined {
  const packageRelativePath = pathRelativeToPackage(candidate, workspacePackage.root);
  if (!packageRelativePath) return undefined;

  const [buildDir, ...artifactParts] = packageRelativePath.split("/");
  if (!GENERATED_PACKAGE_BUILD_DIRS.has(buildDir) || !artifactParts.length) return undefined;

  return artifactParts.join("/");
}

function pathRelativeToPackage(candidate: string, packageRoot: string): string | undefined {
  const root = normalizeRepoPath(packageRoot);
  if (root === ".") return candidate;
  return candidate.startsWith(`${root}/`) ? candidate.slice(root.length + 1) : undefined;
}

function resolveGeneratedPackageArtifactSource(
  workspacePackage: WorkspacePackage,
  artifactSubpath: string,
  fileSet: Set<string>
): string {
  const sourceEntrypoint = scannedPackageEntrypoint(workspacePackage, fileSet);
  if (isPackageEntrypointArtifact(artifactSubpath) && sourceEntrypoint) return sourceEntrypoint;

  return (
    resolvePathCandidate(repoJoin(workspacePackage.root, "src", artifactSubpath), fileSet) ??
    sourceEntrypoint ??
    workspacePackage.root
  );
}

function scannedPackageEntrypoint(workspacePackage: WorkspacePackage, fileSet: Set<string>): string | undefined {
  return workspacePackage.entrypoint && fileSet.has(workspacePackage.entrypoint)
    ? workspacePackage.entrypoint
    : undefined;
}

function isPackageEntrypointArtifact(artifactSubpath: string): boolean {
  return path.posix.dirname(artifactSubpath) === "." &&
    path.posix.basename(artifactSubpath, path.posix.extname(artifactSubpath)) === "index";
}

function resolveWorkspaceSpecifier(from: string, specifier: string, workspacePackage: WorkspacePackage, fileSet: Set<string>): string | undefined {
  if (isPythonFilePath(from)) return resolvePythonWorkspaceSpecifier(specifier, workspacePackage, fileSet);

  if (specifier === workspacePackage.name) {
    return workspacePackage.entrypoint ?? workspacePackage.root;
  }

  const subpath = specifier.slice(workspacePackage.name.length + 1);
  if (!subpath) return workspacePackage.entrypoint ?? workspacePackage.root;
  return (
    resolvePathCandidate(repoJoin(workspacePackage.root, subpath), fileSet) ??
    (workspacePackage.entrypoint
      ? resolvePathCandidate(repoJoin(path.posix.dirname(workspacePackage.entrypoint), subpath), fileSet)
      : undefined)
  );
}

function resolvePythonWorkspaceSpecifier(specifier: string, workspacePackage: WorkspacePackage, fileSet: Set<string>): string | undefined {
  if (specifier === workspacePackage.name) {
    return workspacePackage.entrypoint ?? resolvePathCandidate(workspacePackage.root, fileSet, PYTHON_RESOLUTION_EXTENSIONS) ?? workspacePackage.root;
  }

  const subpath = specifier.slice(workspacePackage.name.length).replace(/^\./u, "").replaceAll(".", "/");
  if (!subpath) return workspacePackage.entrypoint ?? workspacePackage.root;
  return resolvePathCandidate(repoJoin(workspacePackage.root, subpath), fileSet, PYTHON_RESOLUTION_EXTENSIONS);
}

function resolvePythonAbsoluteSpecifier(
  specifier: string,
  packages: PythonPackageRoot[],
  fileSet: Set<string>
): PythonResolution | undefined {
  if (!specifier || specifier.startsWith(".")) return undefined;
  const [packageName, ...subpathParts] = specifier.split(".");
  const pythonPackage = packages.find(pkg => pkg.name === packageName);
  if (!pythonPackage) return undefined;

  const subpath = subpathParts.join("/");
  const to = subpath
    ? resolvePathCandidate(repoJoin(pythonPackage.root, subpath), fileSet, PYTHON_RESOLUTION_EXTENSIONS)
    : resolvePathCandidate(pythonPackage.root, fileSet, PYTHON_RESOLUTION_EXTENSIONS);
  return to ? { to, packageName } : undefined;
}

function resolveRustAbsoluteSpecifier(
  from: string,
  specifier: string,
  packages: RustPackageRoot[],
  fileSet: Set<string>
): RustResolution | undefined {
  if (!specifier.includes("::")) return undefined;
  const parts = specifier.split("::").filter(Boolean);
  if (!parts.length) return undefined;

  const [first, ...moduleParts] = parts;
  const rustPackage = first === "crate"
    ? rustPackageForPath(from, packages)
    : packages.find(pkg => pkg.crateName === first || pkg.name === first);
  if (!rustPackage) return undefined;

  const to = resolveRustModulePath(rustPackage, moduleParts, fileSet);
  return to ? { to, packageName: rustPackage.name } : undefined;
}

function resolveGoModuleSpecifier(
  from: string,
  specifier: string,
  modules: GoModuleRoot[],
  fileSet: Set<string>
): GoResolution | undefined {
  const goModule = goModuleForSpecifier(from, specifier, modules);
  if (!goModule) return undefined;

  const subpath = specifier === goModule.modulePath
    ? ""
    : specifier.slice(goModule.modulePath.length + 1);
  const packageDir = subpath ? repoJoin(goModule.root, subpath) : goModule.root;
  return {
    modulePath: goModule.modulePath,
    matched: true,
    to: resolveGoPackageFile(packageDir, fileSet)
  };
}

function goModuleForSpecifier(from: string, specifier: string, modules: GoModuleRoot[]): GoModuleRoot | undefined {
  return [...modules]
    .sort((a, b) => b.modulePath.length - a.modulePath.length || b.root.length - a.root.length || a.modulePath.localeCompare(b.modulePath))
    .find(module => pathContains(module.root, from) && (specifier === module.modulePath || specifier.startsWith(`${module.modulePath}/`)));
}

function resolveGoPackageFile(packageDir: string, fileSet: Set<string>): string | undefined {
  const normalizedDir = normalizeRepoPath(packageDir);
  const files = [...fileSet]
    .filter(filePath => path.posix.dirname(filePath) === normalizedDir && isGoFilePath(filePath))
    .sort((a, b) => goPackageFileRank(a) - goPackageFileRank(b) || a.localeCompare(b));
  return files[0];
}

function goPackageFileRank(filePath: string): number {
  const basename = path.posix.basename(filePath).toLowerCase();
  if (basename.endsWith("_test.go")) return 3;
  if (basename === "doc.go") return 2;
  if (basename === "main.go") return 1;
  return 0;
}

function resolveRustModulePath(
  rustPackage: RustPackageRoot,
  moduleParts: string[],
  fileSet: Set<string>
): string | undefined {
  if (!moduleParts.length) return rustPackage.entrypoints.find(entrypoint => fileSet.has(entrypoint));

  for (let count = moduleParts.length; count > 0; count -= 1) {
    const modulePath = moduleParts.slice(0, count).join("/");
    const candidates = [
      repoJoin(rustPackage.root, "src", modulePath),
      repoJoin(rustPackage.root, modulePath)
    ];
    for (const candidate of candidates) {
      const resolved = resolvePathCandidate(candidate, fileSet, RUST_RESOLUTION_EXTENSIONS);
      if (resolved) return resolved;
    }
  }

  return undefined;
}

function rustPackageForPath(filePath: string, packages: RustPackageRoot[]): RustPackageRoot | undefined {
  return [...packages]
    .sort((a, b) => b.root.length - a.root.length || a.name.localeCompare(b.name))
    .find(pkg => pathContains(pkg.root, filePath));
}

function resolvePackageEntrypoint(packageRoot: string, manifest: PackageManifest | undefined, fileSet: Set<string>): string | undefined {
  const candidates = [
    ...packageEntrypointCandidates(manifest),
    "src/index",
    "index"
  ];

  for (const candidate of candidates) {
    const relativeCandidate = cleanPackagePath(candidate);
    if (!relativeCandidate) continue;
    const resolved = resolvePathCandidate(repoJoin(packageRoot, relativeCandidate), fileSet);
    if (resolved) return resolved;
  }

  return undefined;
}

function resolvePathCandidate(candidate: string, fileSet: Set<string>, extensions: string[] = JAVASCRIPT_RESOLUTION_EXTENSIONS): string | undefined {
  const normalized = normalizeRepoPath(candidate);
  if (isOutsideRepo(normalized)) return undefined;

  const candidates = candidatePaths(normalized, extensions);
  return candidates.find(candidatePath => fileSet.has(candidatePath));
}

function candidatePaths(candidate: string, extensions: string[] = JAVASCRIPT_RESOLUTION_EXTENSIONS): string[] {
  const ext = path.posix.extname(candidate);
  const candidates: string[] = [];

  if (ext) {
    candidates.push(candidate);
    for (const alias of EXTENSION_ALIASES[ext] ?? []) {
      candidates.push(candidate.slice(0, -ext.length) + alias);
    }
    return uniqueStrings(candidates);
  }

  for (const extension of extensions) {
    candidates.push(`${candidate}${extension}`);
  }
  for (const extension of extensions) {
    candidates.push(repoJoin(candidate, `index${extension}`));
  }
  if (extensions.includes(".py")) candidates.push(repoJoin(candidate, "__init__.py"));
  if (extensions.includes(".rs")) candidates.push(repoJoin(candidate, "mod.rs"));

  return uniqueStrings(candidates);
}

function resolveAliasSpecifier(specifier: string, aliasRules: AliasRule[], fileSet: Set<string>): AliasResolution {
  const matches = aliasRules.flatMap(rule => aliasMatchesForRule(specifier, rule));
  for (const match of matches) {
    const resolved = resolvePathCandidate(match.candidate, fileSet);
    if (resolved) return { to: resolved, rule: match.rule, matched: true };
  }

  return matches[0]
    ? { matched: true, rule: matches[0].rule }
    : { matched: false };
}

function aliasMatchesForRule(specifier: string, rule: AliasRule): AliasMatch[] {
  const exactOnly = rule.find.endsWith("$");
  const find = exactOnly ? rule.find.slice(0, -1) : rule.find;
  if (!find) return [];

  if (find.includes("*")) {
    const match = specifier.match(aliasWildcardRegex(find));
    if (!match) return [];
    const wildcard = match[1] ?? "";
    return [{ candidate: normalizeRepoPath(rule.replacement.replaceAll("*", wildcard)), rule }];
  }

  if (specifier === find) return [{ candidate: rule.replacement, rule }];
  if (!exactOnly && specifier.startsWith(`${find}/`)) {
    return [{ candidate: repoJoin(rule.replacement, specifier.slice(find.length + 1)), rule }];
  }

  return [];
}

function aliasWildcardRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "(.*)");
  return new RegExp(`^${escaped}$`);
}

function normalizeAliasRules(patterns: ImportAliasPattern[]): AliasRule[] {
  return patterns
    .map((pattern, order) => ({
      find: pattern.find.trim(),
      replacement: normalizeRepoPath(pattern.replacement.trim()),
      ...(pattern.source ? { source: pattern.source.trim() } : {}),
      ...(pattern.configPath ? { configPath: normalizeRepoPath(pattern.configPath) } : {}),
      order
    }))
    .filter(pattern => pattern.find && pattern.replacement)
    .sort(byAliasSpecificity);
}

function normalizeRootDirs(rootDirs: string[]): string[] {
  return uniqueStrings(rootDirs.map(rootDir => normalizeRepoPath(rootDir)).filter(rootDir => rootDir && !isOutsideRepo(rootDir)))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function byAliasSpecificity(a: AliasRule, b: AliasRule): number {
  return aliasStaticPrefixLength(b.find) - aliasStaticPrefixLength(a.find) ||
    Number(aliasIsExact(b.find)) - Number(aliasIsExact(a.find)) ||
    a.order - b.order;
}

function aliasStaticPrefixLength(find: string): number {
  const normalized = find.endsWith("$") ? find.slice(0, -1) : find;
  const wildcardIndex = normalized.indexOf("*");
  return wildcardIndex === -1 ? normalized.length : wildcardIndex;
}

function aliasIsExact(find: string): boolean {
  return !find.includes("*") || find.endsWith("$");
}

function aliasSource(rule: AliasRule): string {
  const source = rule.source?.trim() || "custom";
  return rule.configPath ? `${source}:${rule.configPath}` : source;
}

function aliasUnresolvedReason(rule: AliasRule): string {
  return `Alias matched ${aliasSource(rule)}, but none of its target candidates resolved to a scanned repository file. Check the alias target, sourceRoot/ignored scan settings, or configure .abstraction-tree importAliases.`;
}

function looksLikeUnconfiguredAlias(specifier: string): boolean {
  return specifier.startsWith("@/") || specifier.startsWith("~/") || specifier.startsWith("#/");
}

function resolveRootDirsCandidate(from: string, candidate: string, rootDirs: string[], fileSet: Set<string>): string | undefined {
  if (!rootDirs.length) return undefined;

  const fromDir = normalizeRepoPath(path.posix.dirname(from));
  for (const sourceRoot of rootDirs) {
    if (!pathContains(sourceRoot, fromDir) || !pathContains(sourceRoot, candidate)) continue;
    const virtualPath = pathRelativeToRoot(candidate, sourceRoot);
    if (!virtualPath) continue;

    for (const targetRoot of rootDirs) {
      if (targetRoot === sourceRoot) continue;
      const resolved = resolvePathCandidate(repoJoin(targetRoot, virtualPath), fileSet, resolutionExtensionsForFile(from));
      if (resolved) return resolved;
    }
  }

  return undefined;
}

function pathContains(root: string, candidate: string): boolean {
  return root === "." || candidate === root || candidate.startsWith(`${root}/`);
}

function pathRelativeToRoot(candidate: string, root: string): string | undefined {
  if (root === ".") return candidate;
  return candidate === root ? "." : candidate.startsWith(`${root}/`) ? candidate.slice(root.length + 1) : undefined;
}

function packageEntrypointCandidates(manifest: PackageManifest | undefined): string[] {
  if (!manifest) return [];
  return uniqueStrings([
    ...exportsEntrypointCandidates(manifest.exports),
    ...binEntrypointCandidates(manifest),
    stringField(manifest, "source"),
    stringField(manifest, "module"),
    stringField(manifest, "main"),
    stringField(manifest, "types"),
    stringField(manifest, "typings"),
    "src/main"
  ].filter((value): value is string => Boolean(value)));
}

function exportsEntrypointCandidates(value: unknown): string[] {
  if (typeof value === "string") return [value];
  const record = objectRecord(value);
  if (!record) return [];

  const dotExport = record["."];
  if (typeof dotExport === "string") return [dotExport];
  const dotExportRecord = objectRecord(dotExport);
  if (dotExportRecord) {
    return ["source", "import", "module", "default", "types"]
      .map(key => dotExportRecord[key])
      .filter((candidate): candidate is string => typeof candidate === "string");
  }

  return [];
}

function cleanPackagePath(candidate: string): string | undefined {
  const normalized = normalizeRepoPath(candidate.replace(/^\.?\//, ""));
  if (!normalized || normalized === ".") return undefined;
  return normalized;
}

function binEntrypointCandidates(manifest: PackageManifest | undefined): string[] {
  const bin = manifest?.bin;
  if (typeof bin === "string") return [bin];
  const record = objectRecord(bin);
  return record ? Object.values(record).filter(isString) : [];
}

function packageBinCommands(manifest: PackageManifest | undefined, packageName: string): string[] {
  const bin = manifest?.bin;
  if (typeof bin === "string") return [commandNameFromPackageName(packageName)];
  const record = objectRecord(bin);
  return record ? Object.keys(record).filter(isString).sort() : [];
}

function packageScriptNames(manifest: PackageManifest | undefined): string[] {
  const scripts = objectRecord(manifest?.scripts);
  return scripts ? Object.keys(scripts).filter(isString).sort() : [];
}

function packageDependencyNames(manifest: PackageManifest | undefined): string[] {
  const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  return uniqueStrings(fields.flatMap(field => {
    const dependencies = objectRecord(manifest?.[field]);
    return dependencies ? Object.keys(dependencies).filter(isString) : [];
  })).sort();
}

function commandNameFromPackageName(packageName: string): string {
  return packageName.includes("/") ? packageName.split("/").at(-1) ?? packageName : packageName;
}

function packageNameFromSpecifier(from: string, specifier: string): string | undefined {
  if (!specifier || specifier.startsWith("node:")) return specifier || undefined;
  if (isRustFilePath(from)) {
    if (isRustRelativeModuleSpecifier(specifier) || specifier.startsWith("crate::")) return undefined;
    return specifier.split("::")[0] || undefined;
  }
  if (isPythonFilePath(from)) {
    if (specifier.startsWith(".")) return undefined;
    return specifier.split(".")[0] || undefined;
  }
  if (isGoFilePath(from)) return specifier || undefined;
  if (isMarkdownFilePath(from)) return undefined;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

async function readPackageManifest(directory: string): Promise<PackageManifest | undefined> {
  try {
    const raw = await readFile(path.join(directory, "package.json"), "utf8");
    return objectRecord(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function packageJsonWorkspacePatterns(manifest: PackageManifest | undefined): WorkspacePatternSpec[] {
  const workspaces = manifest?.workspaces;
  if (Array.isArray(workspaces)) return workspaces.filter(isString).flatMap(workspacePatternSpec);

  const workspaceRecord = objectRecord(workspaces);
  const packages = workspaceRecord?.packages;
  return Array.isArray(packages) ? packages.filter(isString).flatMap(workspacePatternSpec) : [];
}

async function pnpmWorkspacePatterns(projectRoot: string): Promise<WorkspacePatternSpec[]> {
  const patterns: WorkspacePatternSpec[] = [];
  for (const fileName of ["pnpm-workspace.yaml", "pnpm-workspace.yml"]) {
    const raw = await readTextFile(path.join(projectRoot, fileName));
    if (raw) patterns.push(...parsePnpmWorkspacePatterns(raw));
  }
  return patterns;
}

function parsePnpmWorkspacePatterns(raw: string): WorkspacePatternSpec[] {
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const packagesMatch = line.match(/^(\s*)packages\s*:\s*(.*)$/u);
    if (!packagesMatch || packagesMatch[1].length > 0) continue;

    const inlineValue = yamlWithoutComment(packagesMatch[2]).trim();
    if (inlineValue) return yamlWorkspacePatternValues(inlineValue).flatMap(workspacePatternSpec);

    const values: string[] = [];
    for (let itemIndex = index + 1; itemIndex < lines.length; itemIndex += 1) {
      const itemLine = lines[itemIndex];
      const trimmed = itemLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (leadingWhitespaceLength(itemLine) === 0) break;

      const itemMatch = itemLine.match(/^\s*-\s*(.*)$/u);
      if (itemMatch) values.push(...yamlWorkspacePatternValues(itemMatch[1]));
    }

    return values.flatMap(workspacePatternSpec);
  }

  return [];
}

function yamlWorkspacePatternValues(value: string): string[] {
  const trimmed = yamlWithoutComment(value).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return parseYamlInlineStringList(trimmed);

  const scalar = parseYamlScalarString(trimmed);
  return scalar ? [scalar] : [];
}

function parseYamlInlineStringList(value: string): string[] {
  const trimmed = yamlWithoutComment(value).trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];

  return splitYamlInlineListItems(trimmed.slice(1, -1))
    .map(item => parseYamlScalarString(item))
    .filter(isString);
}

function splitYamlInlineListItems(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote) {
      current += character;
      if (quote === "'" && character === "'" && value[index + 1] === "'") {
        current += value[index + 1];
        index += 1;
        continue;
      }
      if (quote === "\"" && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }
      if (character === quote && !escaped) quote = undefined;
      escaped = false;
      continue;
    }

    if (character === "'" || character === "\"") {
      quote = character;
      current += character;
      continue;
    }

    if (character === ",") {
      items.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  items.push(current);
  return items;
}

function parseYamlScalarString(value: string): string | undefined {
  const trimmed = yamlWithoutComment(value).trim().replace(/,$/u, "").trim();
  if (!trimmed || trimmed === "[]" || trimmed === "null" || trimmed === "~") return undefined;

  if (trimmed.startsWith("'")) {
    const end = findSingleQuotedYamlScalarEnd(trimmed);
    return end === -1 ? undefined : trimmed.slice(1, end).replace(/''/gu, "'").trim();
  }

  if (trimmed.startsWith("\"")) {
    const end = findDoubleQuotedYamlScalarEnd(trimmed);
    if (end === -1) return undefined;

    const quoted = trimmed.slice(0, end + 1);
    try {
      const parsed = JSON.parse(quoted);
      return typeof parsed === "string" ? parsed.trim() : undefined;
    } catch {
      return trimmed.slice(1, end).trim();
    }
  }

  return trimmed;
}

function findSingleQuotedYamlScalarEnd(value: string): number {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== "'") continue;
    if (value[index + 1] === "'") {
      index += 1;
      continue;
    }
    return index;
  }
  return -1;
}

function findDoubleQuotedYamlScalarEnd(value: string): number {
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (character === "\"" && !escaped) return index;
    escaped = false;
  }
  return -1;
}

function yamlWithoutComment(value: string): string {
  let quote: "'" | "\"" | undefined;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote) {
      if (quote === "'" && character === "'" && value[index + 1] === "'") {
        index += 1;
        continue;
      }
      if (quote === "\"" && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }
      if (character === quote && !escaped) quote = undefined;
      escaped = false;
      continue;
    }

    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }

    if (character === "#") return value.slice(0, index);
  }

  return value;
}

function leadingWhitespaceLength(value: string): number {
  return value.length - value.trimStart().length;
}

function workspacePatternSpec(pattern: string): WorkspacePatternSpec[] {
  const trimmed = pattern.trim();
  if (!trimmed) return [];

  const excluded = trimmed.startsWith("!");
  const normalizedPattern = excluded ? trimmed.slice(1).trim() : trimmed;
  return normalizedPattern ? [{ pattern: normalizedPattern, excluded }] : [];
}

async function expandWorkspacePattern(projectRoot: string, pattern: string): Promise<string[]> {
  const normalized = normalizeWorkspacePattern(pattern);
  if (!normalized || normalized === ".") return [];

  const segments = normalized.split("/");
  const roots: string[] = [];
  await expandWorkspaceSegments(projectRoot, "", segments, 0, roots);
  return roots;
}

async function expandWorkspaceSegments(
  projectRoot: string,
  relativeDir: string,
  segments: string[],
  index: number,
  roots: string[]
): Promise<void> {
  if (index >= segments.length) {
    if (await hasPackageManifest(path.join(projectRoot, repoPathToNative(relativeDir)))) {
      roots.push(relativeDir || ".");
    }
    return;
  }

  const segment = segments[index];
  if (segment === "**") {
    await expandWorkspaceSegments(projectRoot, relativeDir, segments, index + 1, roots);
    for (const child of await childDirectories(projectRoot, relativeDir)) {
      await expandWorkspaceSegments(projectRoot, child, segments, index, roots);
    }
    return;
  }

  if (segment.includes("*")) {
    const segmentRegex = wildcardSegmentRegex(segment);
    for (const child of await childDirectories(projectRoot, relativeDir)) {
      if (segmentRegex.test(path.posix.basename(child))) {
        await expandWorkspaceSegments(projectRoot, child, segments, index + 1, roots);
      }
    }
    return;
  }

  await expandWorkspaceSegments(projectRoot, repoJoin(relativeDir, segment), segments, index + 1, roots);
}

function workspacePatternMatchesRoot(root: string, pattern: string): boolean {
  const normalizedPattern = normalizeWorkspacePattern(pattern);
  if (!normalizedPattern || normalizedPattern === ".") return normalizeRepoPath(root) === ".";

  const normalizedRoot = normalizeRepoPath(root).replace(/\/+$/u, "");
  const rootSegments = normalizedRoot === "." ? [] : normalizedRoot.split("/");
  return workspaceSegmentsMatch(normalizedPattern.split("/"), rootSegments);
}

function workspaceSegmentsMatch(patternSegments: string[], rootSegments: string[]): boolean {
  if (!patternSegments.length) return rootSegments.length === 0;

  const [segment, ...remainingPattern] = patternSegments;
  if (segment === "**") {
    return workspaceSegmentsMatch(remainingPattern, rootSegments) ||
      (rootSegments.length > 0 && workspaceSegmentsMatch(patternSegments, rootSegments.slice(1)));
  }

  if (!rootSegments.length) return false;
  return wildcardSegmentRegex(segment).test(rootSegments[0]) &&
    workspaceSegmentsMatch(remainingPattern, rootSegments.slice(1));
}

function normalizeWorkspacePattern(pattern: string): string {
  return normalizeRepoPath(pattern).replace(/\/+$/gu, "").replace(/^\.\//u, "");
}

async function hasPackageManifest(directory: string): Promise<boolean> {
  return Boolean(await readPackageManifest(directory));
}

async function childDirectories(projectRoot: string, relativeDir: string): Promise<string[]> {
  const absoluteDir = path.join(projectRoot, repoPathToNative(relativeDir));
  const entries = await readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => repoJoin(relativeDir, entry.name))
    .sort();
}

async function readTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function detectImportCycles(edges: ImportGraphEdge[], fileSet: Set<string>): ImportCycle[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!fileSet.has(edge.to)) continue;
    const current = adjacency.get(edge.from) ?? [];
    current.push(edge.to);
    adjacency.set(edge.from, current);
  }

  for (const [from, to] of adjacency) {
    adjacency.set(from, uniqueStrings(to).sort());
  }

  const visited = new Set<string>();
  const stackIndex = new Map<string, number>();
  const pathStack: string[] = [];
  const reported = new Set<string>();
  const cycles: ImportCycle[] = [];

  function visit(filePath: string): void {
    visited.add(filePath);
    stackIndex.set(filePath, pathStack.length);
    pathStack.push(filePath);

    for (const next of adjacency.get(filePath) ?? []) {
      const cycleStart = stackIndex.get(next);
      if (cycleStart !== undefined) {
        const files = pathStack.slice(cycleStart);
        const key = canonicalCycleKey(files);
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push({ files: rotateCycle(files) });
        }
        continue;
      }

      if (!visited.has(next)) visit(next);
    }

    pathStack.pop();
    stackIndex.delete(filePath);
  }

  for (const filePath of [...adjacency.keys()].sort()) {
    if (!visited.has(filePath)) visit(filePath);
  }

  return cycles.sort((a, b) => a.files.join("|").localeCompare(b.files.join("|")));
}

function canonicalCycleKey(files: string[]): string {
  return rotateCycle(files).join("|");
}

function rotateCycle(files: string[]): string[] {
  if (!files.length) return [];
  let start = 0;
  for (let index = 1; index < files.length; index += 1) {
    if (files[index].localeCompare(files[start]) < 0) start = index;
  }
  return [...files.slice(start), ...files.slice(0, start)];
}

function unresolved(
  from: string,
  specifier: string,
  kind: ImportGraphEdgeKind,
  reason: string,
  packageName?: string,
  aliasSource?: string,
  classification: ImportClassification = "source"
): UnresolvedImport {
  return {
    from,
    specifier,
    kind,
    ...classificationField(classification),
    reason,
    ...(packageName ? { packageName } : {}),
    ...(aliasSource ? { aliasSource } : {})
  };
}

function normalizeWorkspacePackages(packages: WorkspacePackage[]): WorkspacePackage[] {
  return uniqueBy(packages.map(pkg => ({
    name: pkg.name,
    root: normalizeRepoPath(pkg.root),
    manifestPath: normalizeRepoPath(pkg.manifestPath),
    ...(pkg.entrypoint ? { entrypoint: normalizeRepoPath(pkg.entrypoint) } : {}),
    ...optionalStringArrayFields({
      binCommands: pkg.binCommands,
      scriptNames: pkg.scriptNames,
      dependencyPackageNames: pkg.dependencyPackageNames
    })
  })), pkg => pkg.name).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeRustPackages(packages: RustPackageRoot[]): RustPackageRoot[] {
  return uniqueBy(packages.map(pkg => ({
    name: pkg.name,
    crateName: pkg.crateName || rustCrateName(pkg.name),
    root: normalizeRepoPath(pkg.root),
    manifestPath: normalizeRepoPath(pkg.manifestPath),
    entrypoints: uniqueStrings((pkg.entrypoints ?? []).map(normalizeRepoPath)).sort()
  })), pkg => `${pkg.root}|${pkg.name}`).sort((a, b) => a.root.localeCompare(b.root) || a.name.localeCompare(b.name));
}

function normalizeGoModules(modules: GoModuleRoot[]): GoModuleRoot[] {
  return uniqueBy(modules.map(module => ({
    modulePath: module.modulePath.trim(),
    root: normalizeRepoPath(module.root),
    manifestPath: normalizeRepoPath(module.manifestPath)
  })).filter(module => module.modulePath && module.root && module.manifestPath), module => `${module.root}|${module.modulePath}`)
    .sort((a, b) => a.root.localeCompare(b.root) || a.modulePath.localeCompare(b.modulePath));
}

function normalizeRepoPath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/^\/+/, "");
  return path.posix.normalize(normalized).replace(/^\.\//, "");
}

function repoJoin(...parts: string[]): string {
  return normalizeRepoPath(path.posix.join(...parts.filter(Boolean)));
}

function repoPathToNative(repoPath: string): string {
  return repoPath === "." ? "" : repoPath.replaceAll("/", path.sep);
}

function isOutsideRepo(repoPath: string): boolean {
  return repoPath === ".." || repoPath.startsWith("../") || path.posix.isAbsolute(repoPath);
}

function wildcardSegmentRegex(segment: string): RegExp {
  const escaped = segment
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]");
  return new RegExp(`^${escaped}$`);
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringField(record: PackageManifest | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
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

function optionalStringArrayFields<T extends Record<string, string[] | undefined>>(fields: T): {
  [K in keyof T]?: string[];
} {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, values]) => {
      const unique = uniqueStrings(values ?? []).sort();
      return unique.length ? [[key, unique]] : [];
    })
  ) as { [K in keyof T]?: string[] };
}

function edgeKey(edge: ImportGraphEdge): string {
  return `${edge.from}|${edge.to}|${edge.specifier}|${edge.kind}|${edge.packageName ?? ""}|${edge.aliasSource ?? ""}|${edge.classification ?? ""}`;
}

function byEdge(a: ImportGraphEdge, b: ImportGraphEdge): number {
  return a.from.localeCompare(b.from) || a.specifier.localeCompare(b.specifier) || a.to.localeCompare(b.to);
}

function byExternalImport(a: ExternalImport, b: ExternalImport): number {
  return a.from.localeCompare(b.from) || a.specifier.localeCompare(b.specifier);
}

function byUnresolvedImport(a: UnresolvedImport, b: UnresolvedImport): number {
  return a.from.localeCompare(b.from) || a.specifier.localeCompare(b.specifier);
}
