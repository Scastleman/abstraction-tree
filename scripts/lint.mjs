#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ts from "typescript";
import { listProjectFiles, maxTextBytes, normalizePath } from "./project-text-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const lintableExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const lintablePrefixes = ["packages/", "scripts/", "examples/"];
const nodeNextImportPrefixes = ["packages/", "scripts/"];
const generatedSegments = ["/dist/", "/dist-ts/"];
const sourceImportExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);
const focusedTestNames = new Set(["describe", "it", "test"]);

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

export async function main(root = repoRoot) {
  const result = await lintProject(root);

  if (result.issues.length) {
    console.error(`Lint failed with ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}:`);
    for (const issue of result.issues) {
      console.error(`${issue.filePath}:${issue.line}:${issue.column} ${issue.rule} ${issue.message}`);
    }
    process.exit(1);
  }

  console.log(`Lint passed (${result.checkedFiles.length} files checked).`);
}

export async function lintProject(root = repoRoot) {
  const projectFiles = await listProjectFiles(root);
  const checkedFiles = [];
  const issues = [];

  for (const filePath of projectFiles) {
    if (!isLintableProjectFile(filePath)) continue;

    const absolutePath = path.join(root, filePath);
    const fileStat = await stat(absolutePath).catch(() => undefined);
    if (!fileStat?.isFile() || fileStat.size > maxTextBytes) continue;

    const sourceText = await readFile(absolutePath, "utf8");
    checkedFiles.push(filePath);
    issues.push(...lintSourceText(filePath, sourceText));
  }

  issues.sort(compareIssues);
  return { checkedFiles, issues };
}

export function isLintableProjectFile(filePath) {
  const normalizedPath = normalizePath(filePath);
  const extension = path.posix.extname(normalizedPath).toLowerCase();

  return (
    lintableExtensions.has(extension) &&
    lintablePrefixes.some(prefix => normalizedPath.startsWith(prefix)) &&
    !generatedSegments.some(segment => normalizedPath.includes(segment))
  );
}

export function lintSourceText(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath)
  );
  const issues = [];

  visit(sourceFile);
  return issues;

  function visit(node) {
    if (ts.isDebuggerStatement(node)) {
      issues.push(issueAt(sourceFile, node.getStart(sourceFile), "no-debugger", "`debugger` statements must not be committed."));
    }

    if (isFocusedTestCall(node)) {
      issues.push(issueAt(sourceFile, node.expression.name.getStart(sourceFile), "no-focused-tests", "Focused tests must not be committed."));
    }

    const moduleSpecifier = moduleSpecifierText(node);
    if (moduleSpecifier !== undefined && shouldLintNodeNextImportExtensions(filePath)) {
      const importIssue = lintRelativeImportSpecifier(moduleSpecifier);
      if (importIssue) {
        issues.push(issueAt(sourceFile, node.getStart(sourceFile), "node-next-import-extension", importIssue));
      }
    }

    ts.forEachChild(node, visit);
  }
}

export function shouldLintNodeNextImportExtensions(filePath) {
  const normalizedPath = normalizePath(filePath);
  return nodeNextImportPrefixes.some(prefix => normalizedPath.startsWith(prefix));
}

export function lintRelativeImportSpecifier(specifier) {
  if (!specifier.startsWith(".")) return undefined;

  const specifierPath = specifier.split("?")[0].split("#")[0];
  const extension = path.posix.extname(specifierPath).toLowerCase();
  if (!extension) {
    return `Relative ESM imports must include the emitted runtime extension: ${JSON.stringify(specifier)}.`;
  }
  if (sourceImportExtensions.has(extension)) {
    return `Relative TypeScript source imports must use the emitted runtime extension instead of ${extension}: ${JSON.stringify(specifier)}.`;
  }
  return undefined;
}

function moduleSpecifierText(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }

  return undefined;
}

function isFocusedTestCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "only" &&
    ts.isIdentifier(node.expression.expression) &&
    focusedTestNames.has(node.expression.expression.text)
  );
}

function issueAt(sourceFile, position, rule, message) {
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  return {
    filePath: normalizePath(sourceFile.fileName),
    line: location.line + 1,
    column: location.character + 1,
    rule,
    message
  };
}

function scriptKindFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".cts":
    case ".mts":
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.JS;
  }
}

function compareIssues(left, right) {
  return (
    left.filePath.localeCompare(right.filePath) ||
    left.line - right.line ||
    left.column - right.column ||
    left.rule.localeCompare(right.rule)
  );
}
