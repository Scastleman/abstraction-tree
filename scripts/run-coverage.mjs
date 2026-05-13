#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultCoverageDirectory = path.join("coverage", "v8");

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

export async function main(root = process.cwd()) {
  const coverageDirectoryPath = coverageDirectory(root);
  await rm(coverageDirectoryPath, { recursive: true, force: true });
  await mkdir(coverageDirectoryPath, { recursive: true });

  const testScriptPath = path.resolve(root, "scripts", "run-tests.mjs");
  const exitCode = await runNode([testScriptPath], {
    cwd: root,
    env: buildCoverageEnv(root),
    stdio: "inherit"
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }

  const artifacts = await readdir(coverageDirectoryPath);
  const coverageArtifacts = artifacts.filter(isCoverageArtifact);

  if (coverageArtifacts.length === 0) {
    console.error(`No V8 coverage artifacts were written to ${formatPath(root, coverageDirectoryPath)}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Coverage data written to ${formatPath(root, coverageDirectoryPath)}.`);
}

export function coverageDirectory(root = process.cwd()) {
  return path.resolve(root, defaultCoverageDirectory);
}

export function buildCoverageEnv(root = process.cwd(), env = process.env) {
  return {
    ...env,
    NODE_V8_COVERAGE: coverageDirectory(root)
  };
}

export function isCoverageArtifact(fileName) {
  return /^coverage-\d+-\d+-\d+\.json$/u.test(fileName);
}

function runNode(args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, options);

    child.on("error", reject);
    child.on("close", code => {
      resolve(code ?? 1);
    });
  });
}

function formatPath(root, filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}
