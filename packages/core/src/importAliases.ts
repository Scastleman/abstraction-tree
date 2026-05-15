import { readFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import type { FileSummary, ImportAliasPattern } from "./schema.js";

export interface ImportResolutionDiscovery {
  importAliases: ImportAliasPattern[];
  rootDirs: string[];
}

interface TypeScriptResolutionDiscovery {
  importAliases: ImportAliasPattern[];
  rootDirs: string[];
}

interface EvaluatedPath {
  path: string;
  local: boolean;
}

interface ExpressionContext {
  projectRoot: string;
  configDir: string;
  constants: Map<string, ts.Expression>;
  seenConstants: Set<string>;
}

const TSCONFIG_PATTERN = /(^|\/)tsconfig(?:\.[^/]+)?\.json$/u;
const BUNDLER_CONFIG_PATTERN = /(^|\/)(vite|webpack|esbuild)(?:\.[^/]+)?\.config\.(?:cjs|cts|js|mjs|mts|ts)$/u;
const LOCAL_ALIAS_TARGET_SEGMENTS = new Set([
  "app",
  "apps",
  "client",
  "components",
  "generated",
  "lib",
  "packages",
  "server",
  "shared",
  "src"
]);

export async function discoverImportResolution(
  projectRoot: string,
  files: FileSummary[],
  customAliases: ImportAliasPattern[] = []
): Promise<ImportResolutionDiscovery> {
  const [typescriptResolution, bundlerAliases] = await Promise.all([
    discoverTypeScriptResolution(projectRoot, files),
    discoverBundlerAliases(projectRoot, files)
  ]);

  return {
    importAliases: uniqueAliases([
      ...typescriptResolution.importAliases,
      ...bundlerAliases,
      ...customAliases.map(alias => normalizeCustomAlias(alias)).filter((alias): alias is ImportAliasPattern => Boolean(alias))
    ]),
    rootDirs: uniqueStrings(typescriptResolution.rootDirs).sort()
  };
}

async function discoverTypeScriptResolution(projectRoot: string, files: FileSummary[]): Promise<TypeScriptResolutionDiscovery> {
  const importAliases: ImportAliasPattern[] = [];
  const rootDirs: string[] = [];

  for (const configPath of tsconfigPaths(files)) {
    const config = readTypeScriptConfig(projectRoot, configPath);
    if (!config) continue;

    const compilerOptions = config.options as ts.CompilerOptions & { pathsBasePath?: string };
    const paths = compilerOptions.paths ?? {};
    const baseDir = compilerOptions.baseUrl ?? compilerOptions.pathsBasePath ?? path.dirname(projectFile(projectRoot, configPath));
    const baseDirRepoPath = absoluteToRepoPath(projectRoot, baseDir);
    if (!baseDirRepoPath) continue;

    for (const [find, replacements] of Object.entries(paths)) {
      for (const replacement of replacements) {
        const repoReplacement = absoluteToRepoPath(projectRoot, path.resolve(baseDir, replacement));
        if (!repoReplacement) continue;
        importAliases.push({
          find,
          replacement: repoReplacement,
          source: "typescript",
          configPath
        });
      }
    }

    for (const rootDir of compilerOptions.rootDirs ?? []) {
      const repoRootDir = absoluteToRepoPath(projectRoot, rootDir);
      if (repoRootDir) rootDirs.push(repoRootDir);
    }
  }

  return {
    importAliases: uniqueAliases(importAliases),
    rootDirs: uniqueStrings(rootDirs)
  };
}

function readTypeScriptConfig(projectRoot: string, configPath: string): ts.ParsedCommandLine | undefined {
  const absoluteConfigPath = projectFile(projectRoot, configPath);
  const configFile = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
  if (configFile.error) return undefined;

  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(absoluteConfigPath),
    undefined,
    absoluteConfigPath
  );
}

function tsconfigPaths(files: FileSummary[]): string[] {
  return uniqueStrings([
    "tsconfig.json",
    ...files.map(file => normalizeRepoPath(file.path)).filter(filePath => TSCONFIG_PATTERN.test(filePath))
  ]).sort();
}

async function discoverBundlerAliases(projectRoot: string, files: FileSummary[]): Promise<ImportAliasPattern[]> {
  const fileSet = new Set(files.map(file => normalizeRepoPath(file.path)));
  const aliases: ImportAliasPattern[] = [];

  for (const configPath of bundlerConfigPaths(files)) {
    const text = await readFile(projectFile(projectRoot, configPath), "utf8").catch(() => undefined);
    if (!text) continue;
    aliases.push(...extractBundlerAliases(projectRoot, fileSet, configPath, text));
  }

  return uniqueAliases(aliases);
}

function bundlerConfigPaths(files: FileSummary[]): string[] {
  return uniqueStrings(
    files
      .map(file => normalizeRepoPath(file.path))
      .filter(filePath => BUNDLER_CONFIG_PATTERN.test(filePath))
  ).sort();
}

function extractBundlerAliases(projectRoot: string, fileSet: Set<string>, configPath: string, text: string): ImportAliasPattern[] {
  const scriptKind = scriptKindForConfig(configPath);
  const sourceFile = ts.createSourceFile(configPath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const configDir = normalizeRepoPath(path.posix.dirname(configPath));
  const constants = collectTopLevelConstants(sourceFile);
  const context: ExpressionContext = {
    projectRoot,
    configDir: configDir === "." ? "" : configDir,
    constants,
    seenConstants: new Set()
  };
  const source = bundlerSource(configPath);
  const aliases: ImportAliasPattern[] = [];

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      const resolveAlias = resolveAliasInitializer(node);
      if (resolveAlias) {
        aliases.push(...aliasPatternsFromInitializer(resolveAlias, context, fileSet, source, configPath));
      }
    }

    if (ts.isCallExpression(node) && isAliasPluginCall(node)) {
      const aliasMap = node.arguments[0];
      if (aliasMap) {
        aliases.push(...aliasPatternsFromInitializer(aliasMap, context, fileSet, source, configPath));
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return uniqueAliases(aliases);
}

function scriptKindForConfig(configPath: string): ts.ScriptKind {
  const extension = path.posix.extname(configPath).toLowerCase();
  if (extension === ".ts" || extension === ".mts" || extension === ".cts") return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function collectTopLevelConstants(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        constants.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return constants;
}

function resolveAliasInitializer(object: ts.ObjectLiteralExpression): ts.Expression | undefined {
  const resolveProperty = objectProperty(object, "resolve");
  const resolveObject = expressionAsObject(resolveProperty);
  return resolveObject ? objectProperty(resolveObject, "alias") : undefined;
}

function aliasPatternsFromInitializer(
  initializer: ts.Expression,
  context: ExpressionContext,
  fileSet: Set<string>,
  source: string,
  configPath: string
): ImportAliasPattern[] {
  const expression = resolveIdentifier(initializer, context);
  if (!expression) return [];

  if (ts.isObjectLiteralExpression(expression)) {
    return expression.properties.flatMap(property => {
      if (!ts.isPropertyAssignment(property)) return [];
      const find = propertyNameText(property.name);
      if (!find) return [];

      const replacement = evaluatePathExpression(property.initializer, context);
      if (!replacement || !isLocalAliasTarget(replacement, fileSet)) return [];
      return [{ find, replacement: replacement.path, source, configPath }];
    });
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.flatMap(element => {
      const aliasObject = expressionAsObject(element);
      if (!aliasObject) return [];
      const find = aliasFindValue(objectProperty(aliasObject, "find"), context);
      const replacementExpression = objectProperty(aliasObject, "replacement");
      if (!find || !replacementExpression) return [];

      const replacement = evaluatePathExpression(replacementExpression, context);
      if (!replacement || !isLocalAliasTarget(replacement, fileSet)) return [];
      return [{ find, replacement: replacement.path, source, configPath }];
    });
  }

  return [];
}

function aliasFindValue(expression: ts.Expression | undefined, context: ExpressionContext): string | undefined {
  const resolved = expression ? resolveIdentifier(expression, context) : undefined;
  if (!resolved) return undefined;
  if (isStringLiteralLike(resolved)) return resolved.text;
  return undefined;
}

function evaluatePathExpression(expression: ts.Expression, context: ExpressionContext): EvaluatedPath | undefined {
  const resolved = resolveIdentifier(expression, context);
  if (!resolved) return undefined;

  if (isStringLiteralLike(resolved)) {
    return normalizeStringPath(resolved.text, context);
  }

  if (ts.isIdentifier(resolved) && resolved.text === "__dirname") {
    return { path: context.configDir || ".", local: true };
  }

  if (ts.isCallExpression(resolved)) {
    if (isProcessCwdCall(resolved)) return { path: ".", local: true };

    if (isPathCall(resolved, "resolve") || isPathCall(resolved, "join")) {
      return evaluatePathJoinCall(resolved, context);
    }

    if (callName(resolved.expression) === "fileURLToPath" && resolved.arguments[0]) {
      return evaluatePathExpression(resolved.arguments[0], context);
    }
  }

  if (ts.isNewExpression(resolved) && expressionName(resolved.expression) === "URL") {
    return evaluateNewUrlExpression(resolved, context);
  }

  if (ts.isPropertyAccessExpression(resolved) && resolved.name.text === "pathname") {
    return evaluatePathExpression(resolved.expression, context);
  }

  return undefined;
}

function normalizeStringPath(value: string, context: ExpressionContext): EvaluatedPath {
  const normalized = normalizeRepoPath(value);
  if (isNativeAbsolutePath(value)) {
    return {
      path: absoluteToRepoPath(context.projectRoot, value) ?? normalized,
      local: true
    };
  }
  if (value.startsWith(".") || value.startsWith("/")) {
    return {
      path: value.startsWith("/") ? normalized : repoJoin(context.configDir, value),
      local: true
    };
  }
  return { path: normalized, local: false };
}

function evaluatePathJoinCall(call: ts.CallExpression, context: ExpressionContext): EvaluatedPath | undefined {
  const parts: EvaluatedPath[] = [];
  for (const argument of call.arguments) {
    const part = evaluatePathFragmentExpression(argument, context);
    if (!part) return undefined;
    parts.push(part);
  }

  const pathValue = parts.reduce((current, part) => {
    if (part.path === ".") return current || ".";
    if (!current || current === ".") return normalizeRepoPath(part.path);
    return repoJoin(current, part.path);
  }, "");

  return {
    path: pathValue || ".",
    local: true
  };
}

function evaluatePathFragmentExpression(expression: ts.Expression, context: ExpressionContext): EvaluatedPath | undefined {
  const resolved = resolveIdentifier(expression, context);
  if (!resolved) return undefined;

  if (isStringLiteralLike(resolved)) {
    return { path: normalizeRepoPath(resolved.text), local: true };
  }

  if (ts.isIdentifier(resolved) && resolved.text === "__dirname") {
    return { path: context.configDir || ".", local: true };
  }

  if (ts.isCallExpression(resolved) && isProcessCwdCall(resolved)) {
    return { path: ".", local: true };
  }

  return evaluatePathExpression(resolved, context);
}

function evaluateNewUrlExpression(expression: ts.NewExpression, context: ExpressionContext): EvaluatedPath | undefined {
  const [relativeArgument, baseArgument] = expression.arguments ?? [];
  if (!relativeArgument || !isStringLiteralLike(relativeArgument)) return undefined;
  if (baseArgument && !isImportMetaUrl(baseArgument)) return undefined;
  return {
    path: repoJoin(context.configDir, relativeArgument.text),
    local: true
  };
}

function resolveIdentifier(expression: ts.Expression, context: ExpressionContext): ts.Expression | undefined {
  if (!ts.isIdentifier(expression)) return expression;
  if (expression.text === "__dirname") return expression;

  const initializer = context.constants.get(expression.text);
  if (!initializer || context.seenConstants.has(expression.text)) return expression;

  context.seenConstants.add(expression.text);
  const resolved = resolveIdentifier(initializer, context);
  context.seenConstants.delete(expression.text);
  return resolved;
}

function isAliasPluginCall(call: ts.CallExpression): boolean {
  const name = callName(call.expression).toLowerCase();
  return name === "alias" || name.endsWith("alias") || name.includes("aliasplugin");
}

function isPathCall(call: ts.CallExpression, method: string): boolean {
  return ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === method;
}

function isProcessCwdCall(call: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === "cwd" &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === "process";
}

function isImportMetaUrl(expression: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "url" &&
    expression.getText() === "import.meta.url";
}

function callName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return "";
}

function expressionName(expression: ts.Expression): string {
  return ts.isIdentifier(expression) ? expression.text : "";
}

function objectProperty(object: ts.ObjectLiteralExpression, field: string): ts.Expression | undefined {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyNameText(property.name) === field) return property.initializer;
  }
  return undefined;
}

function expressionAsObject(expression: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined {
  if (!expression) return undefined;
  return ts.isObjectLiteralExpression(expression) ? expression : undefined;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function isStringLiteralLike(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function isLocalAliasTarget(replacement: EvaluatedPath, fileSet: Set<string>): boolean {
  if (replacement.local) return true;
  const base = replacement.path.split("*")[0]?.replace(/\/+$/u, "") ?? "";
  if (!base) return false;
  if (fileSet.has(base) || [...fileSet].some(filePath => filePath.startsWith(`${base}/`))) return true;

  const firstSegment = base.split("/")[0];
  return LOCAL_ALIAS_TARGET_SEGMENTS.has(firstSegment);
}

function bundlerSource(configPath: string): string {
  const basename = path.posix.basename(configPath).toLowerCase();
  if (basename.startsWith("vite")) return "vite";
  if (basename.startsWith("webpack")) return "webpack";
  if (basename.startsWith("esbuild")) return "esbuild";
  return "bundler";
}

function normalizeCustomAlias(alias: ImportAliasPattern): ImportAliasPattern | undefined {
  if (!alias.find.trim() || !alias.replacement.trim()) return undefined;
  return {
    find: alias.find.trim(),
    replacement: normalizeRepoPath(alias.replacement.trim()),
    source: alias.source?.trim() || "custom",
    ...(alias.configPath ? { configPath: normalizeRepoPath(alias.configPath) } : {})
  };
}

function uniqueAliases(aliases: ImportAliasPattern[]): ImportAliasPattern[] {
  return uniqueBy(
    aliases
      .filter(alias => alias.find.trim() && alias.replacement.trim())
      .map(alias => ({
        find: alias.find.trim(),
        replacement: normalizeRepoPath(alias.replacement.trim()),
        ...(alias.source ? { source: alias.source.trim() } : {}),
        ...(alias.configPath ? { configPath: normalizeRepoPath(alias.configPath) } : {})
      })),
    alias => `${alias.find}|${alias.replacement}|${alias.source ?? ""}|${alias.configPath ?? ""}`
  ).sort((a, b) =>
    a.find.localeCompare(b.find) ||
    a.replacement.localeCompare(b.replacement) ||
    (a.configPath ?? "").localeCompare(b.configPath ?? "")
  );
}

function projectFile(projectRoot: string, repoPath: string): string {
  return path.join(projectRoot, repoPathToNative(repoPath));
}

function absoluteToRepoPath(projectRoot: string, absolutePath: string): string | undefined {
  const relative = path.relative(projectRoot, path.resolve(absolutePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return normalizeRepoPath(relative || ".");
}

function isNativeAbsolutePath(input: string): boolean {
  return path.isAbsolute(input) || /^[A-Za-z]:[\\/]/u.test(input);
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
