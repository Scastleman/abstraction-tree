#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has("--json") || args.has("-json") || args.has("-Json");
const inputJsonPath = inputJsonArgument(process.argv.slice(2));

let diffSummary;
try {
  diffSummary = await import("../packages/core/dist/diffSummary.js");
} catch {
  console.error("diff:summary requires built core artifacts. Run `npm run build` first.");
  process.exit(1);
}

const {
  buildDiffChangesFromGitOutput,
  buildDiffSummary,
  formatDiffSummary
} = diffSummary;

const input = inputJsonPath ? await readInputJson(inputJsonPath) : await collectGitInput();
const changes = buildDiffChangesFromGitOutput({
  numstat: input.numstat,
  nameStatus: input.nameStatus,
  untrackedFiles: input.untrackedFiles,
  untrackedLineCounts: input.untrackedLineCounts
});
const summary = buildDiffSummary(changes, {
  maxDiffLines: integerConfig(input.config?.max_diff_lines)
});

if (jsonOutput) {
  console.log(JSON.stringify({ base: input.base.trim(), ...summary }, null, 2));
} else {
  process.stdout.write(formatDiffSummary(summary, { base: input.base.trim() }));
}

async function collectGitInput() {
  const [base, numstat, nameStatus, untrackedFiles, config] = await Promise.all([
    git(["log", "--oneline", "-1"]),
    git(["-c", "core.safecrlf=false", "diff", "--numstat"]),
    git(["-c", "core.safecrlf=false", "diff", "--name-status"]),
    git(["ls-files", "--others", "--exclude-standard"]),
    readLoopConfig()
  ]);
  const untrackedLineCounts = await lineCountsForUntracked(untrackedFiles);
  return { base, numstat, nameStatus, untrackedFiles, untrackedLineCounts, config };
}

async function git(gitArgs) {
  const { stdout } = await execFileAsync("git", gitArgs, {
    cwd: repoRoot,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout.trimEnd();
}

async function readLoopConfig() {
  try {
    return JSON.parse(await readFile(path.join(repoRoot, ".abstraction-tree", "automation", "loop-config.json"), "utf8"));
  } catch {
    return {};
  }
}

async function lineCountsForUntracked(untrackedFilesOutput) {
  const counts = {};
  const files = untrackedFilesOutput.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  await Promise.all(files.map(async filePath => {
    counts[filePath.replaceAll("\\", "/")] = await textLineCount(path.join(repoRoot, filePath));
  }));
  return counts;
}

async function textLineCount(filePath) {
  try {
    const buffer = await readFile(filePath);
    if (buffer.length === 0 || buffer.includes(0)) return 0;
    let lines = 0;
    for (const byte of buffer) {
      if (byte === 10) lines += 1;
    }
    return buffer.at(-1) === 10 ? lines : lines + 1;
  } catch {
    return 0;
  }
}

function integerConfig(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

async function readInputJson(filePath) {
  const input = JSON.parse(await readFile(filePath, "utf8"));
  return {
    base: stringField(input.base),
    numstat: stringField(input.numstat),
    nameStatus: stringField(input.nameStatus),
    untrackedFiles: stringField(input.untrackedFiles),
    untrackedLineCounts: recordField(input.untrackedLineCounts),
    config: recordField(input.config)
  };
}

function inputJsonArgument(rawArgs) {
  const index = rawArgs.indexOf("--input-json");
  return index >= 0 ? rawArgs[index + 1] : undefined;
}

function stringField(value) {
  return typeof value === "string" ? value : "";
}

function recordField(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
