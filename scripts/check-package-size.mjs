#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publishablePackages } from "./check-changelog.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCliPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

export const packageSizeBudgets = {
  "@abstraction-tree/core": {
    maxTarballBytes: 220_000,
    maxUnpackedBytes: 1_200_000
  },
  "@abstraction-tree/cli": {
    maxTarballBytes: 80_000,
    maxUnpackedBytes: 350_000
  },
  "@abstraction-tree/app": {
    maxTarballBytes: 90_000,
    maxUnpackedBytes: 250_000
  },
  "abstraction-tree": {
    maxTarballBytes: 5_000,
    maxUnpackedBytes: 10_000
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function main(root = repoRoot) {
  const results = [];
  for (const packageInfo of publishablePackages) {
    const packInfo = parseNpmPackJson(await npmPackDryRun(root, packageInfo), packageInfo.name);
    results.push({
      name: packageInfo.name,
      tarballBytes: packInfo.size,
      unpackedBytes: packInfo.unpackedSize
    });
  }

  const { lines, issues } = evaluatePackageSizes(results, packageSizeBudgets);
  for (const line of lines) console.log(line);

  if (issues.length) {
    throw new Error(`Package size check failed:\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }

  console.log("Package size check passed.");
}

export function parseNpmPackJson(stdout, packageName) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`${packageName}: npm pack did not return JSON.`);
  }

  const entry = parsed?.[0];
  if (!entry || typeof entry.size !== "number" || typeof entry.unpackedSize !== "number") {
    throw new Error(`${packageName}: npm pack JSON was missing size or unpackedSize.`);
  }

  return entry;
}

export function evaluatePackageSizes(results, budgets = packageSizeBudgets) {
  const lines = [];
  const issues = [];

  for (const result of results) {
    const budget = budgets[result.name];
    if (!budget) {
      issues.push(`${result.name}: missing package size budget.`);
      continue;
    }

    lines.push(
      [
        `${result.name}:`,
        `tarball ${formatBytes(result.tarballBytes)} / ${formatBytes(budget.maxTarballBytes)}`,
        `installed ${formatBytes(result.unpackedBytes)} / ${formatBytes(budget.maxUnpackedBytes)}`
      ].join(" ")
    );

    if (result.tarballBytes > budget.maxTarballBytes) {
      issues.push(
        `${result.name}: tarball ${formatBytes(result.tarballBytes)} exceeds ${formatBytes(budget.maxTarballBytes)}.`
      );
    }
    if (result.unpackedBytes > budget.maxUnpackedBytes) {
      issues.push(
        `${result.name}: installed ${formatBytes(result.unpackedBytes)} exceeds ${formatBytes(budget.maxUnpackedBytes)}.`
      );
    }
  }

  return { lines, issues };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(1)} MiB`;
}

async function npmPackDryRun(root, packageInfo) {
  const result = await runCommand(
    process.execPath,
    [npmCliPath, "pack", "--json", "--dry-run"],
    path.join(root, packageInfo.directory),
    `${packageInfo.name}: npm pack --dry-run`
  );
  return result.stdout;
}

function runCommand(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          npm_config_update_notifier: "false"
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      reject(new Error(`${label} failed to start: ${error.message}`));
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
      reject(new Error(`${label} failed to start: ${error.message}`));
    });
    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}.\n${stdout}\n${stderr}`.trim()));
    });
  });
}
