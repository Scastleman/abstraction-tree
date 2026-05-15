#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultCoverageDirectory = path.join("coverage", "c8");

export const coverageThresholds = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80
};

export const coverageExcludes = [
  "scripts/**",
  "adapters/**",
  "**/*.test.*",
  "examples/**/tests/**"
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function main(root = process.cwd()) {
  const coverageDirectoryPath = coverageDirectory(root);
  await rm(coverageDirectoryPath, { recursive: true, force: true });
  await mkdir(coverageDirectoryPath, { recursive: true });

  const testScriptPath = path.resolve(root, "scripts", "run-tests.mjs");
  const c8CliPath = resolveC8CliPath(root);
  if (!existsSync(c8CliPath)) {
    throw new Error("Coverage requires c8. Run `npm ci` before `npm run coverage`.");
  }

  const exitCode = await runNode([testScriptPath], {
    cwd: root,
    c8CliPath,
    stdio: "inherit"
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }

  console.log(`Coverage thresholds passed; report written to ${formatPath(root, coverageDirectoryPath)}.`);
}

export function coverageDirectory(root = process.cwd()) {
  return path.resolve(root, defaultCoverageDirectory);
}

export function resolveC8CliPath(root = process.cwd()) {
  return path.resolve(root, "node_modules", "c8", "bin", "c8.js");
}

export function buildCoverageArgs(root = process.cwd()) {
  const coverageDirectoryPath = coverageDirectory(root);
  return [
    "--clean",
    "--check-coverage",
    "--reporter=text",
    "--reporter=json-summary",
    "--report-dir",
    coverageDirectoryPath,
    "--temp-directory",
    path.join(coverageDirectoryPath, "tmp"),
    "--statements",
    String(coverageThresholds.statements),
    "--branches",
    String(coverageThresholds.branches),
    "--functions",
    String(coverageThresholds.functions),
    "--lines",
    String(coverageThresholds.lines),
    ...coverageExcludes.flatMap(pattern => ["--exclude", pattern])
  ];
}

function runNode(testScriptArgs, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        options.c8CliPath,
        ...buildCoverageArgs(options.cwd),
        process.execPath,
        ...testScriptArgs
      ],
      {
        cwd: options.cwd,
        stdio: options.stdio,
        windowsHide: true
      }
    );

    child.on("error", reject);
    child.on("close", code => {
      resolve(code ?? 1);
    });
  });
}

function formatPath(root, filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}
