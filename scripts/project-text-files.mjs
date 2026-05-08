import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const maxTextBytes = 1024 * 1024;

export const ignoredRelativeFiles = new Set([
  ".abstraction-tree/automation/loop-runtime.json",
  ".abstraction-tree/automation/mission-runtime.json"
]);

export const ignoredRelativePrefixes = [
  ".abstraction-tree/automation/mission-logs/"
];

export const supportedTextExtensions = new Set([
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

export function supportsTextProcessing(filePath) {
  return supportedTextExtensions.has(path.extname(filePath).toLowerCase());
}

export async function listProjectFiles(root, options = {}) {
  if (options.git !== false) {
    try {
      const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: root,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024
      });
      return stdout.split("\0").filter(Boolean).map(normalizePath).sort();
    } catch {
      // Fall through to filesystem walking when git is unavailable or root is not a worktree.
    }
  }

  return listFallbackProjectFiles(root);
}

export async function listFallbackProjectFiles(root) {
  return walkProject(root, root);
}

export function shouldIgnoreFallbackPath(filePath) {
  const normalized = normalizePath(filePath);
  return ignoredRelativeFiles.has(normalized) || ignoredRelativePrefixes.some(prefix => normalized.startsWith(prefix));
}

export function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

async function walkProject(root, dir) {
  const ignoredDirectories = new Set([".git", "node_modules", "dist", "dist-ts", "build", "coverage"]);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkProject(root, absolutePath));
      continue;
    }
    if (entry.isFile()) {
      const relativePath = normalizePath(path.relative(root, absolutePath));
      if (!shouldIgnoreFallbackPath(relativePath)) files.push(relativePath);
    }
  }

  return files.sort();
}
