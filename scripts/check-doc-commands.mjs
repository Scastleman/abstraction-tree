#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const knownAtreeCommands = new Set([
  "changes",
  "context",
  "doctor",
  "evaluate",
  "export",
  "goal",
  "init",
  "migrate",
  "mode",
  "propose",
  "route",
  "scan",
  "scope",
  "serve",
  "validate"
]);

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function main(root = repoRoot) {
  const issues = await checkDocCommands(root);
  if (issues.length) {
    throw new Error(`Documentation command check failed:\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }
  console.log("Documentation command check passed.");
}

export async function checkDocCommands(root = repoRoot) {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const scripts = new Set(Object.keys(packageJson.scripts ?? {}));
  const markdownFiles = await collectMarkdownFiles(root);
  const issues = [];

  for (const relativePath of markdownFiles) {
    const absolutePath = path.join(root, relativePath);
    const text = await readFile(absolutePath, "utf8");
    issues.push(...checkNpmRunScripts(relativePath, text, scripts));
    issues.push(...checkAtreeCommands(relativePath, text));
    issues.push(...checkMarkdownLinks(root, relativePath, text));
  }

  return issues.sort();
}

async function collectMarkdownFiles(root) {
  const files = ["README.md"];
  for (const docFile of await filesUnder(path.join(root, "docs"))) {
    if (docFile.endsWith(".md")) files.push(path.relative(root, docFile).replaceAll(path.sep, "/"));
  }
  return files.sort();
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(filePath));
    else if (entry.isFile()) files.push(filePath);
  }
  return files;
}

function checkNpmRunScripts(relativePath, text, scripts) {
  const issues = [];
  for (const match of text.matchAll(/\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g)) {
    const scriptName = match[1];
    if (!scripts.has(scriptName)) {
      issues.push(`${relativePath}: documented npm script \`${scriptName}\` is not in package.json.`);
    }
  }
  return issues;
}

function checkAtreeCommands(relativePath, text) {
  const issues = [];
  const patterns = [
    /\bnpx\s+atree\s+([a-z][a-z:-]*)/g,
    /^\s*atree\s+([a-z][a-z:-]*)/gm,
    /\bnpm\s+run\s+atree\s+--\s+([a-z][a-z:-]*)/g
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const commandName = match[1];
      if (!knownAtreeCommands.has(commandName)) {
        issues.push(`${relativePath}: documented atree command \`${commandName}\` is not in the known CLI surface.`);
      }
    }
  }
  return issues;
}

function checkMarkdownLinks(root, relativePath, text) {
  const issues = [];
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^[a-z]+:\/\//i.test(target)) continue;
    const cleanTarget = target.replace(/^<|>$/g, "");
    const resolved = path.resolve(root, path.dirname(relativePath), cleanTarget);
    if (!existsSync(resolved)) {
      issues.push(`${relativePath}: linked Markdown file does not exist: ${target}`);
    }
  }
  return issues;
}
