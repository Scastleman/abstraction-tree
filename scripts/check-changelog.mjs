#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const publishablePackages = [
  { name: "@abstraction-tree/core", directory: "packages/core", access: "public" },
  { name: "@abstraction-tree/cli", directory: "packages/cli", access: "public" },
  { name: "@abstraction-tree/app", directory: "packages/app", access: "public" },
  { name: "abstraction-tree", directory: "packages/full" }
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function main(args = process.argv.slice(2), root = repoRoot) {
  const expectedVersion = await resolveExpectedVersion(root, args);
  const issues = [
    ...await validateSynchronizedVersions(root, expectedVersion),
    ...await validateReleaseChangelog(root, expectedVersion)
  ];

  if (issues.length) {
    throw new Error(`Release changelog check failed:\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }

  console.log(`Release changelog check passed for ${expectedVersion}.`);
}

export async function resolveExpectedVersion(root, args = []) {
  const explicitVersion = optionValue(args, "--version");
  if (explicitVersion) return explicitVersion;

  const rootPackage = await readJson(path.join(root, "package.json"));
  return rootPackage.version;
}

export async function validateSynchronizedVersions(root, expectedVersion) {
  const issues = [];
  const rootPackage = await readJson(path.join(root, "package.json"));
  const packageLock = await readJson(path.join(root, "package-lock.json")).catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });

  if (rootPackage.version !== expectedVersion) {
    issues.push(`package.json version ${rootPackage.version} does not match expected ${expectedVersion}.`);
  }
  if (!packageLock) {
    issues.push("package-lock.json is missing; run npm install after version updates.");
  } else {
    issues.push(...validateManifestVersion("", packageLock.packages?.[""], "package-lock.json root", expectedVersion));
  }

  const internalNames = new Set(publishablePackages.map(packageInfo => packageInfo.name));
  for (const packageInfo of publishablePackages) {
    const packagePath = path.join(root, packageInfo.directory, "package.json");
    const packageJson = await readJson(packagePath);
    issues.push(
      ...validateManifestVersion(
        packageInfo.name,
        packageJson,
        `${packageInfo.directory}/package.json`,
        expectedVersion
      )
    );
    if (packageLock) {
      issues.push(
        ...validateManifestVersion(
          packageInfo.name,
          packageLock.packages?.[packageInfo.directory],
          `package-lock.json ${packageInfo.directory}`,
          expectedVersion
        )
      );
    }

    for (const dependencySection of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [dependencyName, dependencyVersion] of Object.entries(packageJson[dependencySection] ?? {})) {
        if (internalNames.has(dependencyName) && dependencyVersion !== expectedVersion) {
          issues.push(
            `${packageInfo.name} ${dependencySection}.${dependencyName} is ${dependencyVersion}; expected ${expectedVersion}.`
          );
        }
      }
    }
  }

  return issues;
}

function validateManifestVersion(expectedName, manifest, label, expectedVersion) {
  if (!manifest) return [`${label} is missing.`];

  const issues = [];
  if (expectedName && manifest.name !== expectedName) {
    issues.push(`${label} name ${manifest.name} does not match ${expectedName}.`);
  }
  if (manifest.version !== expectedVersion) {
    issues.push(`${label} version ${manifest.version} does not match expected ${expectedVersion}.`);
  }
  return issues;
}

export async function validateReleaseChangelog(root, expectedVersion) {
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8").catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });

  if (!changelog) return ["CHANGELOG.md is missing."];

  const issues = [];
  if (!/^# Changelog\s*$/m.test(changelog)) {
    issues.push("CHANGELOG.md must start with a Changelog heading.");
  }
  if (!/^## \[?Unreleased\]?\s*$/m.test(changelog)) {
    issues.push("CHANGELOG.md must keep an Unreleased section for the next release.");
  }

  const section = changelogSection(changelog, expectedVersion);
  if (!section) {
    issues.push(`CHANGELOG.md must include a section for ${expectedVersion}.`);
  } else if (!/^\s*-\s+\S/m.test(section)) {
    issues.push(`CHANGELOG.md section ${expectedVersion} must include at least one bullet entry.`);
  }

  return issues;
}

export function changelogSection(changelog, version) {
  const heading = new RegExp(`^## \\[?${escapeRegExp(version)}\\]?\\s*(?:-|$).*`, "m");
  const match = heading.exec(changelog);
  if (!match) return undefined;

  const nextHeading = /^##\s+/m;
  nextHeading.lastIndex = match.index + match[0].length;
  const remaining = changelog.slice(match.index + match[0].length);
  const nextMatch = nextHeading.exec(remaining);
  return nextMatch ? remaining.slice(0, nextMatch.index) : remaining;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
