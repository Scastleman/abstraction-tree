import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import * as ts from "typescript";
import type { FileSummary } from "./schema.js";
import { readConfig } from "./workspace.js";

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript React",
  ".js": "JavaScript",
  ".jsx": "JavaScript React",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".cpp": "C++",
  ".hpp": "C++",
  ".c": "C",
  ".h": "C/C++",
  ".cs": "C#",
  ".java": "Java",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".md": "Markdown",
  ".sql": "SQL"
};

const TEXT_EXTENSIONS = new Set(Object.keys(LANGUAGE_BY_EXT));
const TYPESCRIPT_AST_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

type ParseStrategy = NonNullable<FileSummary["parseStrategy"]>;

interface SourceFacts {
  imports: string[];
  exports: string[];
  symbols: string[];
  parseStrategy: ParseStrategy;
}

export interface ScanResult {
  files: FileSummary[];
}

export async function scanProject(projectRoot: string): Promise<ScanResult> {
  const config = await readConfig(projectRoot);
  const ignored = new Set(config.ignored);
  const files: FileSummary[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(projectRoot, abs).replaceAll(path.sep, "/");
      if (ignored.has(entry.name) || [...ignored].some(i => rel === i || rel.startsWith(i + "/"))) continue;
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        const s = await stat(abs);
        if (s.size > 512_000) continue;
        const text = await readFile(abs, "utf8").catch(() => "");
        files.push(summarizeFile(rel, ext, text, s.size));
      }
    }
  }

  await walk(projectRoot);
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

export function summarizeFile(filePath: string, extension: string, text: string, sizeBytes: number): FileSummary {
  const lines = text.split(/\r?\n/);
  const facts = extractSourceFacts(filePath, extension, text);

  const isTest = /(^|\/)(__tests__|tests?|spec)\//i.test(filePath) || /\.(test|spec)\.[tj]sx?$/.test(filePath);
  const language = LANGUAGE_BY_EXT[extension] ?? "Text";
  const summary = inferSummary(filePath, language, facts.symbols, facts.imports, isTest, facts.parseStrategy);

  return {
    path: filePath,
    extension,
    language,
    parseStrategy: facts.parseStrategy,
    contentHash: hashText(text),
    sizeBytes,
    lines: lines.length,
    imports: facts.imports,
    exports: facts.exports,
    symbols: facts.symbols,
    isTest,
    summary,
    ownedByNodeIds: []
  };
}

function hashText(text: string): string {
  return createHash("sha256").update(normalizeLineEndings(text)).digest("hex");
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function extractSourceFacts(filePath: string, extension: string, text: string): SourceFacts {
  if (TYPESCRIPT_AST_EXTENSIONS.has(extension)) {
    return extractTypeScriptFacts(filePath, extension, text);
  }

  return extractRegexFacts(text);
}

function extractTypeScriptFacts(filePath: string, extension: string, text: string): SourceFacts {
  const imports = new Set<string>();
  const exports = new Set<string>();
  const symbols = new Set<string>();
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKindFor(extension));

  function visit(node: ts.Node) {
    collectImport(node, imports);
    collectSymbol(node, symbols);
    collectExport(node, exports);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    imports: take(imports, 80),
    exports: take(exports, 80),
    symbols: take(symbols, 40),
    parseStrategy: "typescript-ast"
  };
}

function extractRegexFacts(text: string): SourceFacts {
  const imports = extractMatches(text, [
    /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    /require\(["']([^"']+)["']\)/g,
    /^from\s+([\w.]+)\s+import\s+/gm,
    /^import\s+([\w.]+)/gm,
    /^#include\s+[<"]([^>"]+)[>"]/gm
  ]);
  const exports = extractMatches(text, [
    /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+([A-Za-z0-9_]+)/g,
    /module\.exports\s*=\s*([A-Za-z0-9_]+)/g
  ]);
  const symbols = extractMatches(text, [
    /(?:class|interface|type|function)\s+([A-Za-z0-9_]+)/g,
    /(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/g,
    /^def\s+([A-Za-z0-9_]+)\s*\(/gm,
    /^class\s+([A-Za-z0-9_]+)/gm,
    /func\s+([A-Za-z0-9_]+)\s*\(/g
  ]).slice(0, 40);

  return { imports, exports, symbols, parseStrategy: "regex" };
}

function extractMatches(text: string, regexes: RegExp[]): string[] {
  const out = new Set<string>();
  for (const regex of regexes) {
    for (const m of text.matchAll(regex)) {
      if (m[1]) out.add(m[1]);
    }
  }
  return [...out].slice(0, 80);
}

function collectImport(node: ts.Node, imports: Set<string>) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    imports.add(node.moduleSpecifier.text);
    return;
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    node.arguments[0] &&
    isStringLiteralLike(node.arguments[0])
  ) {
    imports.add(node.arguments[0].text);
  }
}

function collectExport(node: ts.Node, exports: Set<string>) {
  if (hasExportModifier(node) && isNamedDeclaration(node) && node.name) {
    collectBindingName(node.name, exports);
  }

  if (ts.isVariableStatement(node) && hasExportModifier(node)) {
    for (const declaration of node.declarationList.declarations) {
      collectBindingName(declaration.name, exports);
    }
  }

  if (ts.isExportAssignment(node)) {
    exports.add(ts.isIdentifier(node.expression) ? node.expression.text : "default");
  }

  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const element of node.exportClause.elements) {
      exports.add(element.name.text);
    }
  }
}

function collectSymbol(node: ts.Node, symbols: Set<string>) {
  if (isNamedDeclaration(node) && node.name) {
    collectBindingName(node.name, symbols);
  }

  if (ts.isVariableDeclaration(node)) {
    collectBindingName(node.name, symbols);
  }
}

function collectBindingName(name: ts.BindingName | ts.PropertyName, out: Set<string>) {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }

  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    out.add(name.text);
    return;
  }

  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) collectBindingName(element.name, out);
    }
  }
}

function isNamedDeclaration(node: ts.Node): node is ts.Declaration & { name: ts.PropertyName | ts.BindingName } {
  return (
    ts.isClassDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) && Boolean(node.name);
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export);
}

function isStringLiteralLike(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function scriptKindFor(extension: string): ts.ScriptKind {
  switch (extension) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function take(values: Set<string>, limit: number): string[] {
  return [...values].filter(Boolean).slice(0, limit);
}

function inferSummary(filePath: string, language: string, symbols: string[], imports: string[], isTest: boolean, parseStrategy: ParseStrategy): string {
  const name = path.basename(filePath);
  const role = isTest ? "test coverage" : filePath.includes("config") ? "configuration" : filePath.includes("schema") ? "data/schema" : "implementation";
  const parserText = parseStrategy === "typescript-ast" ? " AST-backed scan." : "";
  const symbolText = symbols.length ? ` Defines ${symbols.slice(0, 5).join(", ")}.` : "";
  const importText = imports.length ? ` Depends on ${imports.slice(0, 4).join(", ")}.` : "";
  return `${name} is a ${language} ${role} file.${parserText}${symbolText}${importText}`;
}
