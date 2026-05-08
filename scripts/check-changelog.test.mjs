import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  validateReleaseChangelog,
  validateSynchronizedVersions
} from "./check-changelog.mjs";

test("release checks accept synchronized package versions with a changelog entry", async t => {
  const root = await createReleaseFixture(t);

  assert.deepEqual(await validateSynchronizedVersions(root, "1.2.3"), []);
  assert.deepEqual(await validateReleaseChangelog(root, "1.2.3"), []);
});

test("release checks reject missing changelog entries and version drift", async t => {
  const root = await createReleaseFixture(t, {
    cliVersion: "1.2.4",
    changelog: [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "- Pending change.",
      ""
    ].join("\n")
  });

  const versionIssues = await validateSynchronizedVersions(root, "1.2.3");
  assert.match(versionIssues.join("\n"), /packages\/cli\/package\.json version 1\.2\.4/);
  assert.match(versionIssues.join("\n"), /package-lock\.json packages\/cli version 1\.2\.4/);

  const changelogIssues = await validateReleaseChangelog(root, "1.2.3");
  assert.match(changelogIssues.join("\n"), /section for 1\.2\.3/);
});

async function createReleaseFixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "atree-release-check-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const version = "1.2.3";
  await writeJson(path.join(root, "package.json"), {
    name: "abstraction-tree-monorepo",
    version,
    private: true,
    workspaces: [
      "packages/core",
      "packages/cli",
      "packages/app",
      "packages/full"
    ]
  });
  await writeJson(path.join(root, "package-lock.json"), {
    name: "abstraction-tree-monorepo",
    version,
    lockfileVersion: 3,
    packages: {
      "": {
        name: "abstraction-tree-monorepo",
        version
      },
      "packages/core": {
        name: "@abstraction-tree/core",
        version
      },
      "packages/cli": {
        name: "@abstraction-tree/cli",
        version: options.cliVersion ?? version
      },
      "packages/app": {
        name: "@abstraction-tree/app",
        version
      },
      "packages/full": {
        name: "abstraction-tree",
        version
      }
    }
  });

  await writePackage(root, "packages/core", {
    name: "@abstraction-tree/core",
    version
  });
  await writePackage(root, "packages/cli", {
    name: "@abstraction-tree/cli",
    version: options.cliVersion ?? version,
    dependencies: {
      "@abstraction-tree/core": version
    }
  });
  await writePackage(root, "packages/app", {
    name: "@abstraction-tree/app",
    version
  });
  await writePackage(root, "packages/full", {
    name: "abstraction-tree",
    version,
    dependencies: {
      "@abstraction-tree/cli": version,
      "@abstraction-tree/app": version
    }
  });

  await writeFile(
    path.join(root, "CHANGELOG.md"),
    options.changelog ?? [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "- Pending change.",
      "",
      "## [1.2.3] - 2026-05-08",
      "",
      "- Release entry.",
      ""
    ].join("\n")
  );

  return root;
}

async function writePackage(root, directory, packageJson) {
  const packageDir = path.join(root, directory);
  await mkdir(packageDir, { recursive: true });
  await writeJson(path.join(packageDir, "package.json"), packageJson);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
