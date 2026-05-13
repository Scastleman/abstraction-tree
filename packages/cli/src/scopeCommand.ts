import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  atreePath,
  buildDiffChangesFromGitOutput,
  buildScopeContract,
  checkScope,
  formatScopeCheckMarkdown,
  formatScopeContractMarkdown,
  readConcepts,
  readFileSummaries,
  readJson,
  readTreeNodes,
  writeJson,
  type GitDiffOutputs,
  type ScopeCheckReport,
  type ScopeContract
} from "@abstraction-tree/core";

export interface ScopeCreateCommandOptions {
  projectRoot: string;
  prompt: string;
  json?: boolean;
}

export interface ScopeCheckCommandOptions {
  projectRoot: string;
  scope?: string;
  json?: boolean;
}

export interface ScopeCommandIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export type GitInputProvider = (projectRoot: string) => Promise<GitDiffOutputs>;

const execFileAsync = promisify(execFile);

export async function runScopeCreateCommand(
  options: ScopeCreateCommandOptions,
  io: ScopeCommandIo = defaultIo
): Promise<number> {
  if (!options.prompt.trim()) {
    io.stderr("Scope prompt must be a non-empty string.");
    return 1;
  }

  const [nodes, files, concepts] = await Promise.all([
    readTreeNodes(options.projectRoot),
    readFileSummaries(options.projectRoot),
    readConcepts(options.projectRoot)
  ]);
  const contract = buildScopeContract({
    prompt: options.prompt,
    nodes,
    files,
    concepts
  });
  const written = await writeScopeContract(options.projectRoot, contract);
  io.stdout(options.json
    ? `${JSON.stringify({ contract, ...written }, null, 2)}\n`
    : `${formatScopeContractMarkdown(contract)}\nWrote scope contract to ${written.jsonPath}\n`);
  return contract.requiresClarification ? 2 : 0;
}

export async function runScopeCheckCommand(
  options: ScopeCheckCommandOptions,
  gitInputProvider: GitInputProvider = collectGitInput,
  io: ScopeCommandIo = defaultIo
): Promise<number> {
  const contractPath = await resolveScopePath(options.projectRoot, options.scope);
  if (!contractPath) {
    io.stderr("No scope contract found. Run `atree scope --prompt \"...\"` first.");
    return 1;
  }

  const contract = await readJson<ScopeContract>(contractPath, undefined as unknown as ScopeContract);
  const gitInput = await gitInputProvider(options.projectRoot);
  const report = checkScope({
    contract,
    changes: buildDiffChangesFromGitOutput(gitInput)
  });
  const written = await writeScopeCheckReport(options.projectRoot, report);
  io.stdout(options.json
    ? `${JSON.stringify({ report, ...written }, null, 2)}\n`
    : `${formatScopeCheckMarkdown(report)}\nWrote scope check to ${written.jsonPath}\n`);
  return report.status === "blocked" ? 1 : 0;
}

export async function latestScopeSummary(projectRoot: string): Promise<{
  file: string;
  contract: ScopeContract;
  report?: ScopeCheckReport;
} | undefined> {
  const contractPath = await resolveScopePath(projectRoot, "latest");
  if (!contractPath) return undefined;
  const contract = await readJson<ScopeContract>(contractPath, undefined as unknown as ScopeContract);
  const reportPath = atreePath(projectRoot, "scopes", `${contract.id}-check.json`);
  const report = existsSync(reportPath)
    ? await readJson<ScopeCheckReport>(reportPath, undefined as unknown as ScopeCheckReport)
    : undefined;
  return {
    file: relativeAtree(projectRoot, contractPath),
    contract,
    report
  };
}

async function writeScopeContract(projectRoot: string, contract: ScopeContract): Promise<{ jsonPath: string; markdownPath: string }> {
  const dir = atreePath(projectRoot, "scopes");
  await mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, `${contract.id}.json`);
  const markdownPath = path.join(dir, `${contract.id}.md`);
  await writeJson(jsonPath, contract);
  await writeFile(markdownPath, formatScopeContractMarkdown(contract), "utf8");
  return {
    jsonPath: relativeAtree(projectRoot, jsonPath),
    markdownPath: relativeAtree(projectRoot, markdownPath)
  };
}

async function writeScopeCheckReport(projectRoot: string, report: ScopeCheckReport): Promise<{ jsonPath: string; markdownPath: string }> {
  const dir = atreePath(projectRoot, "scopes");
  await mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, `${report.id}.json`);
  const markdownPath = path.join(dir, `${report.id}.md`);
  await writeJson(jsonPath, report);
  await writeFile(markdownPath, formatScopeCheckMarkdown(report), "utf8");
  return {
    jsonPath: relativeAtree(projectRoot, jsonPath),
    markdownPath: relativeAtree(projectRoot, markdownPath)
  };
}

async function resolveScopePath(projectRoot: string, scope: string | undefined): Promise<string | undefined> {
  if (scope && scope !== "latest") {
    const candidate = path.resolve(projectRoot, scope);
    return existsSync(candidate) ? candidate : undefined;
  }

  const dir = atreePath(projectRoot, "scopes");
  if (!existsSync(dir)) return undefined;
  const names = (await readdir(dir))
    .filter(name => name.endsWith("-scope.json"))
    .sort();
  const latest = names.at(-1);
  return latest ? path.join(dir, latest) : undefined;
}

async function collectGitInput(projectRoot: string): Promise<GitDiffOutputs> {
  const [numstat, nameStatus, untrackedFiles] = await Promise.all([
    git(projectRoot, ["-c", "core.safecrlf=false", "diff", "--numstat"]),
    git(projectRoot, ["-c", "core.safecrlf=false", "diff", "--name-status"]),
    git(projectRoot, ["ls-files", "--others", "--exclude-standard"])
  ]);
  return {
    numstat,
    nameStatus,
    untrackedFiles,
    untrackedLineCounts: await lineCountsForUntracked(projectRoot, untrackedFiles)
  };
}

async function git(projectRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout.trimEnd();
}

async function lineCountsForUntracked(projectRoot: string, untrackedFilesOutput: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const files = untrackedFilesOutput.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  await Promise.all(files.map(async filePath => {
    const normalized = filePath.replaceAll("\\", "/");
    counts[normalized] = await textLineCount(path.join(projectRoot, normalized));
  }));
  return counts;
}

async function textLineCount(filePath: string): Promise<number> {
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

function relativeAtree(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, "/");
}

const defaultIo: ScopeCommandIo = {
  stdout: text => process.stdout.write(text),
  stderr: text => process.stderr.write(`${text}\n`)
};
