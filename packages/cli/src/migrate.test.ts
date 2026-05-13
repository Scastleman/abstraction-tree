import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { atreePath, ensureWorkspace, writeJson } from "@abstraction-tree/core";
import { formatMigrationResult, migrationExitCode, runMigrateCommand } from "./migrate.js";

test("migrate dry-run formats a clear no-op plan", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { projectName: "CLI Migration Fixture" });
  const before = await readFile(atreePath(root, "config.json"), "utf8");

  const result = await runMigrateCommand({ projectRoot: root, dryRun: true });
  const output = formatMigrationResult(result);
  const after = await readFile(atreePath(root, "config.json"), "utf8");

  assert.equal(after, before);
  assert.equal(migrationExitCode(result), 0);
  assert.match(output, /Schema: 0\.1\.0 -> 0\.1\.0/);
  assert.match(output, /Plan: already current/);
  assert.match(output, /Dry run complete; no files were written/);
});

test("migrate reports unsupported target versions as command failures", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { projectName: "CLI Migration Fixture" });

  const result = await runMigrateCommand({ projectRoot: root, toVersion: "0.2.0" });
  const output = formatMigrationResult(result);

  assert.equal(result.applied, false);
  assert.equal(migrationExitCode(result), 1);
  assert.match(output, /Target schema version 0\.2\.0 is newer than this CLI supports/);
});

test("migrate reports future workspace memory without rewriting config", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { projectName: "Future Fixture" });
  await writeJson(atreePath(root, "config.json"), {
    version: "9.0.0",
    projectName: "Future Fixture",
    createdAt: "2026-05-01T00:00:00.000Z",
    sourceRoot: ".",
    ignored: [],
    respectGitignore: false,
    treeBuilder: "deterministic",
    installMode: "core",
    visualApp: {
      enabled: false,
      defaultPort: 4317
    }
  });
  const before = await readFile(atreePath(root, "config.json"), "utf8");

  const result = await runMigrateCommand({ projectRoot: root });
  const after = await readFile(atreePath(root, "config.json"), "utf8");

  assert.equal(after, before);
  assert.equal(migrationExitCode(result), 1);
  assert.match(formatMigrationResult(result), /future schema version 9\.0\.0/);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-cli-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
