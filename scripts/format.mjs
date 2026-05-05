#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--check") ? "check" : "write";
const maxTextBytes = 1024 * 1024;
const ignoredRelativeFiles = new Set([
  ".abstraction-tree/automation/loop-runtime.json",
  ".abstraction-tree/automation/mission-runtime.json"
]);
const ignoredRelativePrefixes = [
  ".abstraction-tree/automation/mission-logs/"
];

const supportedExtensions = new Set([
  ".bash",
  ".cjs",
  ".cmd",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".markdown",
  ".mjs",
  ".ps1",
  ".psd1",
  ".psm1",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export function formatText(filePath, text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (path.extname(filePath).toLowerCase() === ".json") {
    return JSON.stringify(JSON.parse(normalized), null, 2) + "\n";
  }

  if (!normalized.length) return "";

  return normalized
    .split("\n")
    .map(line => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n*$/u, "\n");
}

export function readableTextIssue(filePath, text) {
  const contentLines = text.split("\n").filter(line => line.trim().length > 0);
  if (contentLines.length === 1 && contentLines[0].length > 240) {
    return "supported text file looks like a compressed one-line blob";
  }
  return undefined;
}

function shouldFormat(filePath) {
  return supportedExtensions.has(path.extname(filePath).toLowerCase());
}

async function main() {
  const files = await listProjectFiles();
  const changed = [];
  const failures = [];

  for (const filePath of files) {
    if (!shouldFormat(filePath)) continue;

    const absolutePath = path.join(repoRoot, filePath);
    const fileStat = await stat(absolutePath).catch(() => undefined);
    if (!fileStat?.isFile() || fileStat.size > maxTextBytes) continue;

    const buffer = await readFile(absolutePath).catch(error => {
      failures.push(`${filePath}: ${error.message}`);
      return undefined;
    });
    if (!buffer || buffer.includes(0)) continue;

    const original = buffer.toString("utf8");
    let formatted;
    try {
      formatted = formatText(filePath, original);
    } catch (error) {
      failures.push(`${filePath}: ${error.message}`);
      continue;
    }

    const readabilityIssue = readableTextIssue(filePath, formatted);
    if (readabilityIssue) {
      failures.push(`${filePath}: ${readabilityIssue}`);
      continue;
    }

    if (formatted === original) continue;

    changed.push(filePath);
    if (mode === "write") {
      await writeFile(absolutePath, formatted, "utf8");
    }
  }

  if (failures.length) {
    console.error("Formatting failed:");
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  if (changed.length && mode === "check") {
    console.error("Files need formatting:");
    for (const filePath of changed) console.error(`  ${filePath}`);
    console.error("Run `npm run format` to update them.");
    process.exit(1);
  }

  if (changed.length) {
    console.log(`Formatted ${changed.length} file${changed.length === 1 ? "" : "s"}.`);
  } else {
    console.log("Formatting check passed.");
  }
}

async function listProjectFiles() {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: repoRoot,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });
    return stdout.split("\0").filter(Boolean).map(normalizePath).sort();
  } catch {
    return walkProject(repoRoot);
  }
}

async function walkProject(dir) {
  const ignoredDirectories = new Set([".git", "node_modules", "dist", "dist-ts", "build", "coverage"]);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkProject(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      const relativePath = normalizePath(path.relative(repoRoot, absolutePath));
      if (!shouldIgnoreFallbackPath(relativePath)) files.push(relativePath);
    }
  }

  return files.sort();
}

function shouldIgnoreFallbackPath(filePath) {
  const normalized = normalizePath(filePath);
  return ignoredRelativeFiles.has(normalized) || ignoredRelativePrefixes.some(prefix => normalized.startsWith(prefix));
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}
