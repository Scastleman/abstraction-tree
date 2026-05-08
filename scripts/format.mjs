#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { listProjectFiles, maxTextBytes, supportsTextProcessing } from "./project-text-files.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--check") ? "check" : "write";

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

async function main() {
  const files = await listProjectFiles(repoRoot);
  const changed = [];
  const failures = [];

  for (const filePath of files) {
    if (!supportsTextProcessing(filePath)) continue;

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
