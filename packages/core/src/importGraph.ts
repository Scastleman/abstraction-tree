import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ExternalImport,
  FileSummary,
  ImportCycle,
  ImportGraph,
  ImportGraphEdge,
  ImportGraphEdgeKind,
  UnresolvedImport,
  WorkspacePackage
} from "./schema.js";

export interface BuildImportGraphOptions {
  workspacePackages?: WorkspacePackage[];
}

type PackageManifest = Record<string, unknown>;
interface GeneratedPackageArtifactResolution {
  to: string;
  packageName: string;
}

const JAVASCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const RESOLUTION_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const EXTENSION_ALIASES: Record<string, string[]> = {
  ".js": [".ts", ".tsx", ".js", ".jsx"],
  ".jsx": [".tsx", ".jsx"],
  ".mjs": [".mts", ".mjs", ".ts", ".js"],
  ".cjs": [".cts", ".cjs", ".ts", ".js"]
};
const GENERATED_PACKAGE_BUILD_DIRS = new Set(["dist", "dist-ts"]);

export function emptyImportGraph(): ImportGraph {
  return {
    edges: [],
    externalImports: [],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: []
  };
}

export async function buildImportGraph(projectRoot: string, files: FileSummary[]): Promise<ImportGraph> {
  const workspacePackages = await discoverWorkspacePackages(projectRoot, files);
  return buildImportGraphFromFiles(files, { workspacePackages });
}

export function buildImportGraphFromFiles(files: FileSummary[], options: BuildImportGraphOptions = {}): ImportGraph {
  const fileSet = new Set(files.map(file => file.path));
  const workspacePackages = normalizeWorkspacePackages(options.workspacePackages ?? []);
  const workspaceByName = new Map(workspacePackages.map(pkg => [pkg.name, pkg]));
  const edges: ImportGraphEdge[] = [];
  const externalImports: ExternalImport[] = [];
  const unresolvedImports: UnresolvedImport[] = [];

  for (const file of files.filter(isJavaScriptFile).sort((a, b) => a.path.localeCompare(b.path))) {
    for (const specifier of [...file.imports].sort()) {
      if (isRelativeSpecifier(specifier)) {
        const to = resolveRelativeSpecifier(file.path, specifier, fileSet);
        if (to) {
          edges.push({ from: file.path, to, specifier, kind: "relative" });
        } else {
          const generatedArtifact = resolveGeneratedPackageArtifactSpecifier(file.path, specifier, workspacePackages, fileSet);
          if (generatedArtifact) {
            edges.push({
              from: file.path,
              to: generatedArtifact.to,
              specifier,
              kind: "workspace-package",
              packageName: generatedArtifact.packageName
            });
            continue;
          }
          unresolvedImports.push(unresolved(file.path, specifier, "relative", "Relative import could not be resolved to a scanned repository file."));
        }
        continue;
      }

      const packageName = packageNameFromSpecifier(specifier);
      const workspacePackage = packageName ? workspaceByName.get(packageName) : undefined;
      if (workspacePackage) {
        const workspaceResolution = resolveWorkspaceSpecifier(specifier, workspacePackage, fileSet);
        if (workspaceResolution) {
          edges.push({
            from: file.path,
            to: workspaceResolution,
            specifier,
            kind: "workspace-package",
            packageName
          });
        } else {
          unresolvedImports.push(unresolved(
            file.path,
            specifier,
            "workspace-package",
            "Workspace package import was recognized, but its subpath could not be resolved.",
            packageName
          ));
        }
        continue;
      }

      if (packageName) {
        externalImports.push({ from: file.path, specifier, packageName });
      }
    }
  }

  const uniqueEdges = uniqueBy(edges, edgeKey).sort(byEdge);
  return {
    edges: uniqueEdges,
    externalImports: uniqueBy(externalImports, item => `${item.from}|${item.specifier}|${item.packageName}`).sort(byExternalImport),
    unresolvedImports: uniqueBy(unresolvedImports, item => `${item.from}|${item.specifier}|${item.kind}|${item.packageName ?? ""}`).sort(byUnresolvedImport),
    cycles: detectImportCycles(uniqueEdges, fileSet),
    workspacePackages
  };
}

export async function discoverWorkspacePackages(projectRoot: string, files: FileSummary[]): Promise<WorkspacePackage[]> {
  const rootManifest = await readPackageManifest(projectRoot);
  const patterns = workspacePatterns(rootManifest);
  if (!patterns.length) return [];

  const roots = new Set<string>();
  for (const pattern of patterns) {
    for (const root of await expandWorkspacePattern(projectRoot, pattern)) {
      roots.add(root);
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

function isJavaScriptFile(file: FileSummary): boolean {
  return JAVASCRIPT_EXTENSIONS.has(file.extension.toLowerCase());
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function resolveRelativeSpecifier(from: string, specifier: string, fileSet: Set<string>): string | undefined {
  const candidate = relativeSpecifierCandidate(from, specifier);
  return candidate ? resolvePathCandidate(candidate, fileSet) : undefined;
}

function relativeSpecifierCandidate(from: string, specifier: string): string | undefined {
  const fromDir = path.posix.dirname(from);
  const candidate = normalizeRepoPath(path.posix.normalize(path.posix.join(fromDir, specifier)));
  if (isOutsideRepo(candidate)) return undefined;
  return candidate;
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

function resolveWorkspaceSpecifier(specifier: string, workspacePackage: WorkspacePackage, fileSet: Set<string>): string | undefined {
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

function resolvePathCandidate(candidate: string, fileSet: Set<string>): string | undefined {
  const normalized = normalizeRepoPath(candidate);
  if (isOutsideRepo(normalized)) return undefined;

  const candidates = candidatePaths(normalized);
  return candidates.find(candidatePath => fileSet.has(candidatePath));
}

function candidatePaths(candidate: string): string[] {
  const ext = path.posix.extname(candidate);
  const candidates: string[] = [];

  if (ext) {
    candidates.push(candidate);
    for (const alias of EXTENSION_ALIASES[ext] ?? []) {
      candidates.push(candidate.slice(0, -ext.length) + alias);
    }
    return uniqueStrings(candidates);
  }

  for (const extension of RESOLUTION_EXTENSIONS) {
    candidates.push(`${candidate}${extension}`);
  }
  for (const extension of RESOLUTION_EXTENSIONS) {
    candidates.push(repoJoin(candidate, `index${extension}`));
  }

  return uniqueStrings(candidates);
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

function packageNameFromSpecifier(specifier: string): string | undefined {
  if (!specifier || specifier.startsWith("node:")) return specifier || undefined;
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

function workspacePatterns(manifest: PackageManifest | undefined): string[] {
  const workspaces = manifest?.workspaces;
  if (Array.isArray(workspaces)) return workspaces.filter(isString).filter(pattern => !pattern.startsWith("!"));

  const workspaceRecord = objectRecord(workspaces);
  const packages = workspaceRecord?.packages;
  return Array.isArray(packages) ? packages.filter(isString).filter(pattern => !pattern.startsWith("!")) : [];
}

async function expandWorkspacePattern(projectRoot: string, pattern: string): Promise<string[]> {
  const normalized = normalizeRepoPath(pattern).replace(/\/+$/g, "").replace(/^\.\//, "");
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
  packageName?: string
): UnresolvedImport {
  return { from, specifier, kind, reason, ...(packageName ? { packageName } : {}) };
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
  const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*");
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
  return `${edge.from}|${edge.to}|${edge.specifier}|${edge.kind}|${edge.packageName ?? ""}`;
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
