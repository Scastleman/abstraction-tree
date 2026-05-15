#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const releaseGateCommands = [
  npmCommand("npm run format:check", ["run", "format:check"]),
  npmCommand("npm run check:unicode", ["run", "check:unicode"]),
  npmCommand("npm run docs:commands", ["run", "docs:commands"]),
  npmCommand("npm run lint", ["run", "lint"]),
  npmCommand("npm run audit:security", ["run", "audit:security"]),
  npmCommand("npm run typecheck", ["run", "typecheck"]),
  npmCommand("npm run build", ["run", "build"]),
  npmCommand("npm run coverage", ["run", "coverage"]),
  npmCommand("npm run package:size", ["run", "package:size"]),
  npmCommand("npm run pack:smoke", ["run", "pack:smoke"]),
  versionedNpmCommand("npm run release:dry-run -- --version {version}", version => [
    "run",
    "release:dry-run",
    "--",
    "--version",
    version
  ]),
  npmCommand("npm run atree:scan", ["run", "atree:scan"]),
  npmCommand("npm run atree:validate", ["run", "atree:validate"]),
  npmCommand("npm run atree:evaluate", ["run", "atree:evaluate"]),
  npmCommand("npm run atree -- doctor --project . --strict", [
    "run",
    "atree",
    "--",
    "doctor",
    "--project",
    ".",
    "--strict"
  ]),
  npmCommand("npm run diff:summary", ["run", "diff:summary"])
];

export const installCommand = npmCommand("npm ci", ["ci"]);

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function main(args = process.argv.slice(2), root = repoRoot) {
  const options = await parseArgs(args, root);
  if (options.help) {
    console.log(helpText());
    return;
  }

  const result = await captureReleaseGateEvidence(options);
  console.log(`Release-gate evidence written to ${normalizeEvidencePath(root, result.outputPath)}`);
  console.log(`Result: ${result.status}`);
  if (result.status !== "pass") process.exitCode = 1;
}

export async function captureReleaseGateEvidence(options = {}) {
  const root = path.resolve(options.root ?? repoRoot);
  const now = options.now ?? new Date();
  const version = options.version ?? await readPackageVersion(root);
  const outputPath = path.resolve(options.outputPath ?? defaultEvidencePath(root, now));
  const commandSpecs = options.commandSpecs ?? buildGateCommands({ version, includeInstall: options.includeInstall });
  const startedAt = formatEvidenceTimestamp(now);
  const environment = await collectEnvironment(root, options);
  const results = await runGateCommands(commandSpecs, {
    ...options,
    root,
    stopOnFailure: options.stopOnFailure ?? false
  });
  const endedAt = formatEvidenceTimestamp(options.nowFn?.() ?? new Date());
  const status = results.every(result => result.exitCode === 0) ? "pass" : "fail";
  const provisionalFinalGitStatus = {
    stdout: "(capturing final status after evidence file write)\n",
    stderr: "",
    exitCode: 0
  };
  const provisionalMarkdown = renderEvidenceMarkdown({
    status,
    version,
    root,
    outputPath,
    startedAt,
    endedAt,
    environment,
    results,
    finalGitStatus: provisionalFinalGitStatus
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, provisionalMarkdown, "utf8");

  const finalGitStatus = await captureTextCommand("git", ["status", "--short", "--branch"], root);
  const markdown = renderEvidenceMarkdown({
    status,
    version,
    root,
    outputPath,
    startedAt,
    endedAt,
    environment,
    results,
    finalGitStatus
  });

  await writeFile(outputPath, markdown, "utf8");
  return { status, outputPath, results };
}

export function buildGateCommands(options = {}) {
  const version = options.version ?? "{version}";
  const commands = options.includeInstall ? [installCommand, ...releaseGateCommands] : [...releaseGateCommands];
  return commands.map(command => materializeCommand(command, version));
}

export async function runGateCommands(commandSpecs, options = {}) {
  const results = [];
  const runner = options.runner ?? runCommandWithCapture;

  for (const spec of commandSpecs) {
    const result = await runner(spec, options);
    results.push(result);
    if (options.stopOnFailure && result.exitCode !== 0) break;
  }

  return results;
}

export async function runCommandWithCapture(spec, options = {}) {
  const root = path.resolve(options.root ?? repoRoot);
  const invocation = buildCommandInvocation(spec, options);
  const cwd = path.resolve(spec.cwd ? path.join(root, spec.cwd) : root);
  const startTime = formatEvidenceTimestamp(options.nowFn?.() ?? new Date());

  return new Promise(resolve => {
    let child;
    try {
      child = spawn(invocation.command, invocation.args, {
        cwd,
        env: {
          ...process.env,
          ...options.env,
          npm_config_update_notifier: "false"
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      resolve(commandStartFailure(spec, cwd, startTime, error));
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      resolve(commandStartFailure(spec, cwd, startTime, error));
    });
    child.on("close", (code, signal) => {
      resolve({
        command: spec.display,
        cwd,
        startTime,
        endTime: formatEvidenceTimestamp(options.nowFn?.() ?? new Date()),
        exitCode: code,
        signal,
        stdout,
        stderr
      });
    });
  });
}

export function buildCommandInvocation(spec, options = {}) {
  if (spec.kind !== "npm") {
    throw new Error(`Unsupported release-gate command kind: ${spec.kind}`);
  }

  const npm = resolveNpmInvocation({
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
    execPath: options.execPath ?? process.execPath
  });
  return {
    command: npm.command,
    args: [...npm.args, ...spec.args]
  };
}

export function resolveNpmInvocation(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;

  if (env.npm_execpath) {
    return { command: execPath, args: [env.npm_execpath] };
  }

  const npmCliPath = path.join(path.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(npmCliPath)) {
    return { command: execPath, args: [npmCliPath] };
  }

  return { command: platform === "win32" ? "npm.cmd" : "npm", args: [] };
}

export function formatEvidenceTimestamp(date) {
  return date.toISOString();
}

export function defaultEvidencePath(root, date = new Date()) {
  return path.join(root, "docs", "release-evidence", `${date.toISOString().slice(0, 10)}-current-gate.md`);
}

export function normalizeEvidencePath(root, filePath) {
  const absoluteRoot = path.resolve(root);
  const absoluteFile = path.resolve(filePath);
  const relative = path.relative(absoluteRoot, absoluteFile);
  if (relative === "") return ".";
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return normalizePathSeparators(relative);
  }
  return normalizePathSeparators(filePath);
}

export function normalizePathSeparators(value) {
  return value.replaceAll("\\", "/");
}

export function renderEvidenceMarkdown(input) {
  const commandRows = input.results
    .map(result => {
      const status = result.exitCode === 0 ? "Pass" : "Fail";
      const exitCode = result.exitCode === null || result.exitCode === undefined ? "not started" : String(result.exitCode);
      return `| \`${result.command}\` | ${status} | ${exitCode} |`;
    })
    .join("\n");
  const commandSections = input.results.map(renderCommandSection).join("\n\n");
  const gitStatusBefore = input.environment.gitStatus.stdout.trim() || "(clean)";
  const gitStatusAfter = input.finalGitStatus.stdout.trim() || "(clean)";

  return `# Current Release Gate Evidence

> Candidate evidence only. This file does not declare v1 readiness; maintainer signoff is still required.

Result: ${input.status}

This evidence captures the documented v1 release-gate command list for the current working tree. A failed command is recorded as blocker evidence, not hidden or converted into a pass.

## Run Metadata

- Started: ${input.startedAt}
- Ended: ${input.endedAt}
- Repository: ${input.root}
- Evidence file: ${normalizeEvidencePath(input.root, input.outputPath)}
- Candidate version: ${input.version}
- Git HEAD: ${input.environment.gitHead.stdout.trim() || "unavailable"}
- Git branch: ${input.environment.gitBranch.stdout.trim() || "unavailable"}

## Environment

- OS: ${os.type()} ${os.release()} ${os.arch()}
- Platform: ${process.platform}
- Node: ${process.version}
- npm: ${input.environment.npmVersion.stdout.trim() || "unavailable"}
- Git: ${input.environment.gitVersion.stdout.trim() || "unavailable"}

## Git Status Before

\`\`\`text
${gitStatusBefore}
\`\`\`

## Command Summary

| Command | Status | Exit code |
| --- | --- | --- |
${commandRows}

## Git Status After

\`\`\`text
${gitStatusAfter}
\`\`\`

## Command Outputs

${commandSections}
`;
}

function renderCommandSection(result) {
  const exitCode = result.exitCode === null || result.exitCode === undefined ? "not started" : String(result.exitCode);
  const signal = result.signal ? `\nSIGNAL: ${result.signal}` : "";
  const error = result.error ? `\nERROR: ${result.error}` : "";
  return `### ${result.command}

\`\`\`\`text
COMMAND: ${result.command}
CWD: ${result.cwd}
START: ${result.startTime}

STDOUT:
${fenceText(result.stdout)}

STDERR:
${fenceText(result.stderr)}

EXIT CODE: ${exitCode}${signal}${error}
END: ${result.endTime}
\`\`\`\``;
}

function fenceText(value) {
  if (!value?.length) return "(empty)";
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n*$/u, "");
  return normalized || "(empty)";
}

async function collectEnvironment(root, options = {}) {
  return {
    gitHead: await captureTextCommand("git", ["rev-parse", "HEAD"], root),
    gitBranch: await captureTextCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], root),
    gitStatus: await captureTextCommand("git", ["status", "--short", "--branch"], root),
    gitVersion: await captureTextCommand("git", ["--version"], root),
    npmVersion: await captureNpmVersion(root, options)
  };
}

async function captureNpmVersion(root, options = {}) {
  const npm = resolveNpmInvocation({
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
    execPath: options.execPath ?? process.execPath
  });
  return captureTextCommand(npm.command, [...npm.args, "--version"], root, options.env);
}

function captureTextCommand(command, args, cwd, env = {}) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...env,
          npm_config_update_notifier: "false"
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      resolve({ stdout: "", stderr: error.message, exitCode: null });
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      resolve({ stdout, stderr: stderr ? `${stderr}\n${error.message}` : error.message, exitCode: null });
    });
    child.on("close", code => {
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

async function parseArgs(args, root) {
  const parsed = {
    root,
    includeInstall: false,
    stopOnFailure: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--include-install") {
      parsed.includeInstall = true;
    } else if (arg === "--stop-on-failure") {
      parsed.stopOnFailure = true;
    } else if (arg === "--version") {
      parsed.version = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--output") {
      parsed.outputPath = path.resolve(root, requireValue(args, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

async function readPackageVersion(root) {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  return packageJson.version;
}

function npmCommand(display, args) {
  return { kind: "npm", display, args };
}

function versionedNpmCommand(displayTemplate, argsForVersion) {
  return { kind: "npm", displayTemplate, argsForVersion };
}

function materializeCommand(command, version) {
  if (!command.displayTemplate) return { ...command };
  return {
    kind: command.kind,
    display: command.displayTemplate.replace("{version}", version),
    args: command.argsForVersion(version)
  };
}

function commandStartFailure(spec, cwd, startTime, error) {
  return {
    command: spec.display,
    cwd,
    startTime,
    endTime: formatEvidenceTimestamp(new Date()),
    exitCode: null,
    signal: undefined,
    stdout: "",
    stderr: "",
    error: error.message
  };
}

function helpText() {
  return `Usage: node scripts/capture-release-gate-evidence.mjs [options]

Runs the documented v1 release-gate command list and writes candidate evidence.

Options:
  --version <version>       Candidate version for release:dry-run. Defaults to package.json version.
  --output <path>           Evidence Markdown path. Defaults to docs/release-evidence/<date>-current-gate.md.
  --include-install         Run npm ci before the documented gate commands.
  --stop-on-failure         Stop after the first failed command instead of collecting all command results.
  -h, --help                Show this help text.
`;
}
