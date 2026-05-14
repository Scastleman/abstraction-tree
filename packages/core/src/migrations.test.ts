import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { CURRENT_ATREE_SCHEMA_VERSION, validateAtreeConfigSchema } from "./runtimeSchema.js";
import { atreePath, readJson, writeJson } from "./workspace.js";
import { migrateAtreeWorkspace, planAtreeMigration } from "./migrations.js";

test("current-version memory plans no migration changes", async () => {
  const config = await readFixtureConfig();

  const plan = planAtreeMigration({ config });

  assert.equal(plan.fromVersion, CURRENT_ATREE_SCHEMA_VERSION);
  assert.equal(plan.toVersion, CURRENT_ATREE_SCHEMA_VERSION);
  assert.deepEqual(plan.steps, []);
  assert.deepEqual(plan.changedFiles, []);
  assert.deepEqual(plan.issues, []);
});

test("future memory versions block migration with an actionable issue", async t => {
  const root = await workspace(t);
  const config = { ...await readFixtureConfig(), version: "0.2.0" };
  await writeConfig(root, config);

  const result = await migrateAtreeWorkspace(root);
  const written = await readJson<Record<string, unknown>>(atreePath(root, "config.json"), {});

  assert.equal(result.applied, false);
  assert.ok(result.plan.issues.some(issue => /future schema version 0\.2\.0/.test(issue.message)));
  assert.match(result.plan.issues[0]?.recoveryHint ?? "", /atree migrate --dry-run/);
  assert.equal(written.version, "0.2.0");
});

test("dry run does not write memory files", async t => {
  const root = await workspace(t);
  await copyFixtureMemory(root);
  const configPath = atreePath(root, "config.json");
  const before = await readFile(configPath, "utf8");

  const result = await migrateAtreeWorkspace(root, {
    dryRun: true,
    fromVersion: CURRENT_ATREE_SCHEMA_VERSION,
    toVersion: CURRENT_ATREE_SCHEMA_VERSION
  });
  const after = await readFile(configPath, "utf8");

  assert.equal(result.dryRun, true);
  assert.equal(result.applied, false);
  assert.equal(after, before);
  assert.deepEqual(result.plan.issues, []);
});

test("workspace migration validates current-version fixture output", async t => {
  const root = await workspace(t);
  await copyFixtureMemory(root);

  const result = await migrateAtreeWorkspace(root, {
    fromVersion: CURRENT_ATREE_SCHEMA_VERSION,
    toVersion: CURRENT_ATREE_SCHEMA_VERSION
  });
  const config = await readJson<unknown>(atreePath(root, "config.json"), undefined);

  assert.equal(result.applied, false);
  assert.deepEqual(result.plan.issues, []);
  assert.deepEqual(result.preValidationIssues, []);
  assert.deepEqual(result.postValidationIssues, []);
  assert.deepEqual(validateAtreeConfigSchema(config), []);
});

test("requested source version must match the workspace config", async t => {
  const root = await workspace(t);
  await copyFixtureMemory(root);

  const result = await migrateAtreeWorkspace(root, { fromVersion: "0.0.9" });

  assert.equal(result.applied, false);
  assert.ok(result.plan.issues.some(issue => /Requested --from 0\.0\.9/.test(issue.message)));
});

test("unsupported older schema versions require an explicit migration path", async t => {
  const root = await workspace(t);
  const config = { ...await readFixtureConfig(), version: "0.0.9" };
  await writeConfig(root, config);

  const result = await migrateAtreeWorkspace(root);
  const written = await readJson<Record<string, unknown>>(atreePath(root, "config.json"), {});

  assert.equal(result.applied, false);
  assert.ok(result.plan.issues.some(issue => /No migration path from schema version 0\.0\.9/.test(issue.message)));
  assert.equal(written.version, "0.0.9");
});

test("current-version no-op migration does not create backups", async t => {
  const root = await workspace(t);
  await copyFixtureMemory(root);

  const result = await migrateAtreeWorkspace(root, {
    fromVersion: CURRENT_ATREE_SCHEMA_VERSION,
    toVersion: CURRENT_ATREE_SCHEMA_VERSION
  });

  assert.equal(result.applied, false);
  assert.equal(result.backupDir, undefined);
  assert.equal(existsSync(atreePath(root, "backups")), false);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-migrations-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function copyFixtureMemory(root: string): Promise<void> {
  await mkdir(atreePath(root), { recursive: true });
  await writeFile(
    atreePath(root, "config.json"),
    await readFile(path.join(fixtureRoot(), ".abstraction-tree", "config.json"), "utf8"),
    "utf8"
  );
}

async function readFixtureConfig(): Promise<Record<string, unknown>> {
  return readJson<Record<string, unknown>>(
    path.join(fixtureRoot(), ".abstraction-tree", "config.json"),
    {}
  );
}

async function writeConfig(root: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(atreePath(root), { recursive: true });
  await writeJson(atreePath(root, "config.json"), config);
}

function fixtureRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/fixtures/memory-v0.1.0");
}
