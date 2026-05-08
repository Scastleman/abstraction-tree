#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const exitCode = await main();
  process.exitCode = exitCode;
}

export async function main(rawArgs = process.argv.slice(2), streams = { stdout: process.stdout, stderr: process.stderr }) {
  const result = await runDiffSummary(rawArgs);
  if (result.error) {
    streams.stderr.write(`${result.error}\n`);
  } else {
    streams.stdout.write(result.output);
  }
  return result.exitCode;
}

export async function runDiffSummary(rawArgs = []) {
  const args = new Set(rawArgs);
  const jsonOutput = args.has("--json") || args.has("-json") || args.has("-Json");
  const inputJsonPath = inputJsonArgument(rawArgs);

  let diffSummary;
  try {
    diffSummary = await import("../packages/core/dist/diffSummary.js");
  } catch {
    return {
      exitCode: 1,
      output: "",
      error: "diff:summary requires built core artifacts. Run `npm run build` first."
    };
  }

  const {
    buildDiffChangesFromGitOutput,
    buildDiffSummary,
    formatDiffSummary
  } = diffSummary;

  try {
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

    return {
      exitCode: 0,
      output: jsonOutput
        ? `${JSON.stringify({ base: input.base.trim(), ...summary }, null, 2)}\n`
        : formatDiffSummary(summary, { base: input.base.trim() }),
      error: ""
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: "",
      error: `diff:summary failed to collect Git diff input: ${errorMessage(error)}`
    };
  }
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
