import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AtreeConfig, ValidationIssue } from "./schema.js";
import {
  ATREE_CONFIG_MIGRATIONS,
  CURRENT_ATREE_SCHEMA_VERSION,
  formatRuntimeValidationIssue,
  invalidJsonIssue,
  migrateAtreeConfig,
  validateAtreeConfigSchema
} from "./runtimeSchema.js";
import { atreePath, readJson, writeJson } from "./workspace.js";

const CONFIG_RELATIVE_PATH = ".abstraction-tree/config.json";
const MIGRATION_HINT = "Run `atree migrate --dry-run` to inspect the migration plan, then run `atree migrate` after committing or stashing local changes.";

export interface MigrationStep {
  id: string;
  fromVersion: string;
  toVersion: string;
  description: string;
  changedFiles: string[];
}

export interface MigrationPlan {
  fromVersion: string;
  toVersion: string;
  steps: MigrationStep[];
  changedFiles: string[];
  issues: ValidationIssue[];
}

export interface AtreeMigrationMemory {
  config: unknown;
}

export interface MigrationPlanOptions {
  fromVersion?: string;
  toVersion?: string;
}

export interface MigrateAtreeWorkspaceOptions extends MigrationPlanOptions {
  dryRun?: boolean;
  createBackup?: boolean;
  now?: () => Date;
}

export interface MigrationResult {
  projectRoot: string;
  dryRun: boolean;
  applied: boolean;
  backupDir?: string;
  plan: MigrationPlan;
  preValidationIssues: ValidationIssue[];
  postValidationIssues: ValidationIssue[];
}

export function planAtreeMigration(memory: AtreeMigrationMemory, options: MigrationPlanOptions = {}): MigrationPlan {
  const config = objectRecord(memory.config);
  const configVersion = typeof config?.version === "string" ? config.version : undefined;
  const fromVersion = options.fromVersion ?? configVersion ?? "unknown";
  const toVersion = options.toVersion ?? CURRENT_ATREE_SCHEMA_VERSION;
  const issues: ValidationIssue[] = [];

  if (!config) {
    issues.push(migrationIssue("$", "Config memory must be a JSON object."));
  } else if (!configVersion) {
    issues.push(migrationIssue("$.version", "Config memory must include a string schema version."));
  }

  if (options.fromVersion && configVersion && options.fromVersion !== configVersion) {
    issues.push(migrationIssue(
      "$.version",
      `Requested --from ${options.fromVersion}, but ${CONFIG_RELATIVE_PATH} uses schema version ${configVersion}.`
    ));
  }

  if (!semverParts(toVersion)) {
    issues.push(migrationIssue("$.version", `Target schema version ${toVersion} is not a valid SemVer version.`));
  } else if (compareVersions(toVersion, CURRENT_ATREE_SCHEMA_VERSION) > 0) {
    issues.push(migrationIssue(
      "$.version",
      `Target schema version ${toVersion} is newer than this CLI supports; maximum supported target is ${CURRENT_ATREE_SCHEMA_VERSION}.`
    ));
  } else if (compareVersions(toVersion, CURRENT_ATREE_SCHEMA_VERSION) < 0) {
    issues.push(migrationIssue(
      "$.version",
      `Downgrading to schema version ${toVersion} is not supported.`
    ));
  }

  if (configVersion && !semverParts(configVersion)) {
    issues.push(migrationIssue("$.version", `Source schema version ${configVersion} is not a valid SemVer version.`));
  } else if (configVersion && compareVersions(configVersion, CURRENT_ATREE_SCHEMA_VERSION) > 0) {
    issues.push(migrationIssue(
      "$.version",
      `${CONFIG_RELATIVE_PATH} uses future schema version ${configVersion}; this CLI supports up to ${CURRENT_ATREE_SCHEMA_VERSION}.`
    ));
  } else if (configVersion && compareVersions(configVersion, toVersion) > 0) {
    issues.push(migrationIssue(
      "$.version",
      `Downgrading from schema version ${configVersion} to ${toVersion} is not supported.`
    ));
  }

  const steps = issues.some(issue => issue.severity === "error") || !configVersion
    ? []
    : buildConfigMigrationSteps(configVersion, toVersion, issues);
  const changedFiles = unique(steps.flatMap(step => step.changedFiles));

  return {
    fromVersion,
    toVersion,
    steps,
    changedFiles,
    issues
  };
}

export async function migrateAtreeWorkspace(
  projectRoot: string,
  options: MigrateAtreeWorkspaceOptions = {}
): Promise<MigrationResult> {
  const root = path.resolve(projectRoot);
  const configPath = atreePath(root, "config.json");
  const dryRun = Boolean(options.dryRun);

  if (!existsSync(configPath)) {
    const plan: MigrationPlan = {
      fromVersion: options.fromVersion ?? "unknown",
      toVersion: options.toVersion ?? CURRENT_ATREE_SCHEMA_VERSION,
      steps: [],
      changedFiles: [],
      issues: [migrationIssue("$", `${CONFIG_RELATIVE_PATH} does not exist. Run \`atree init\` before migrating.`)]
    };
    return emptyResult(root, dryRun, plan);
  }

  let config: unknown;
  try {
    config = await readJson<unknown>(configPath, undefined);
  } catch {
    const plan: MigrationPlan = {
      fromVersion: options.fromVersion ?? "unknown",
      toVersion: options.toVersion ?? CURRENT_ATREE_SCHEMA_VERSION,
      steps: [],
      changedFiles: [],
      issues: [invalidJsonIssue(CONFIG_RELATIVE_PATH, "Fix the JSON syntax before running `atree migrate`.")]
    };
    return emptyResult(root, dryRun, plan);
  }

  const plan = planAtreeMigration({ config }, options);
  if (hasErrors(plan.issues)) {
    return emptyResult(root, dryRun, plan);
  }

  const preValidationIssues = filterMigratableVersionIssues(
    validateAtreeConfigSchema(config, CONFIG_RELATIVE_PATH),
    plan
  );
  if (hasErrors(preValidationIssues)) {
    return {
      projectRoot: root,
      dryRun,
      applied: false,
      plan,
      preValidationIssues,
      postValidationIssues: []
    };
  }

  if (!plan.changedFiles.length || dryRun) {
    return {
      projectRoot: root,
      dryRun,
      applied: false,
      plan,
      preValidationIssues,
      postValidationIssues: preValidationIssues
    };
  }

  let migratedConfig: AtreeConfig;
  try {
    migratedConfig = migrateAtreeConfig(config as AtreeConfig);
  } catch (error) {
    return {
      projectRoot: root,
      dryRun,
      applied: false,
      plan: {
        ...plan,
        issues: [...plan.issues, migrationIssue("$.version", error instanceof Error ? error.message : String(error))]
      },
      preValidationIssues,
      postValidationIssues: []
    };
  }

  const postValidationIssues = validateAtreeConfigSchema(migratedConfig, CONFIG_RELATIVE_PATH);
  if (hasErrors(postValidationIssues)) {
    return {
      projectRoot: root,
      dryRun,
      applied: false,
      plan,
      preValidationIssues,
      postValidationIssues
    };
  }

  const backupDir = options.createBackup === false
    ? undefined
    : await backupChangedFiles(root, plan.changedFiles, options.now ?? (() => new Date()));
  await writeJson(configPath, migratedConfig);

  return {
    projectRoot: root,
    dryRun,
    applied: true,
    backupDir,
    plan,
    preValidationIssues,
    postValidationIssues
  };
}

export function summarizeMigrationIssues(result: MigrationResult): string[] {
  return [
    ...result.plan.issues,
    ...result.preValidationIssues,
    ...result.postValidationIssues
  ].map(formatRuntimeValidationIssue);
}

function buildConfigMigrationSteps(sourceVersion: string, targetVersion: string, issues: ValidationIssue[]): MigrationStep[] {
  const steps: MigrationStep[] = [];
  const seen = new Set<string>();
  let currentVersion = sourceVersion;

  while (currentVersion !== targetVersion) {
    if (seen.has(currentVersion)) {
      issues.push(migrationIssue("$.version", `Migration cycle detected at schema version ${currentVersion}.`));
      return [];
    }
    seen.add(currentVersion);

    const migration = ATREE_CONFIG_MIGRATIONS.find(candidate => candidate.fromVersion === currentVersion);
    if (!migration) {
      issues.push(migrationIssue(
        "$.version",
        `No migration path from schema version ${currentVersion} to ${targetVersion}.`
      ));
      return [];
    }

    if (migration.toVersion === currentVersion) {
      issues.push(migrationIssue("$.version", `Migration ${currentVersion} -> ${migration.toVersion} does not advance the schema version.`));
      return [];
    }

    steps.push({
      id: `config.${migration.fromVersion}.to.${migration.toVersion}`,
      fromVersion: migration.fromVersion,
      toVersion: migration.toVersion,
      description: `Migrate ${CONFIG_RELATIVE_PATH} from schema ${migration.fromVersion} to ${migration.toVersion}.`,
      changedFiles: [CONFIG_RELATIVE_PATH]
    });
    currentVersion = migration.toVersion;
  }

  return steps;
}

async function backupChangedFiles(projectRoot: string, changedFiles: string[], now: () => Date): Promise<string> {
  const backupDir = atreePath(projectRoot, "backups", backupTimestamp(now()));
  await mkdir(backupDir, { recursive: true });

  for (const relativePath of changedFiles) {
    const source = path.resolve(projectRoot, relativePath);
    if (!existsSync(source)) continue;
    const target = path.join(backupDir, relativePath.replace(/^\.abstraction-tree[\\/]/, ""));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }

  return backupDir;
}

function emptyResult(projectRoot: string, dryRun: boolean, plan: MigrationPlan): MigrationResult {
  return {
    projectRoot,
    dryRun,
    applied: false,
    plan,
    preValidationIssues: [],
    postValidationIssues: []
  };
}

function migrationIssue(fieldPath: string, message: string): ValidationIssue {
  return {
    severity: "error",
    filePath: CONFIG_RELATIVE_PATH,
    fieldPath,
    message,
    recoveryHint: MIGRATION_HINT
  };
}

function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some(issue => issue.severity === "error");
}

function filterMigratableVersionIssues(issues: ValidationIssue[], plan: MigrationPlan): ValidationIssue[] {
  if (!plan.steps.length) return issues;
  return issues.filter(issue => issue.fieldPath !== "$.version");
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function compareVersions(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function semverParts(value: string): number[] | undefined {
  const parts = value.split(".").map(part => Number(part));
  return parts.length === 3 && parts.every(part => Number.isInteger(part) && part >= 0) ? parts : undefined;
}

function backupTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "-");
}
