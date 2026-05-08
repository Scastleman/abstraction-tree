#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  publishablePackages,
  resolveExpectedVersion,
  validateReleaseChangelog,
  validateSynchronizedVersions
} from "./check-changelog.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCliPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

async function main(args = process.argv.slice(2), root = repoRoot) {
  const expectedVersion = await resolveExpectedVersion(root, args);
  const issues = [
    ...await validateSynchronizedVersions(root, expectedVersion),
    ...await validateReleaseChangelog(root, expectedVersion)
  ];

  if (issues.length) {
    throw new Error(`Release dry run failed before npm publish checks:\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }

  for (const packageInfo of publishablePackages) {
    const publishArgs = ["publish", "--dry-run"];
    if (packageInfo.access) publishArgs.push("--access", packageInfo.access);

    await runCommand(
      process.execPath,
      [npmCliPath, ...publishArgs],
      path.join(root, packageInfo.directory),
      `${packageInfo.name}: npm publish --dry-run`
    );
    console.log(`release dry-run: ${packageInfo.name} publish dry-run passed`);
  }
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
