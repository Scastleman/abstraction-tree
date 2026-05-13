import path from "node:path";
import {
  migrateAtreeWorkspace,
  summarizeMigrationIssues,
  type MigrateAtreeWorkspaceOptions,
  type MigrationResult
} from "@abstraction-tree/core";

export interface RunMigrateCommandOptions extends MigrateAtreeWorkspaceOptions {
  projectRoot: string;
}

export async function runMigrateCommand(options: RunMigrateCommandOptions): Promise<MigrationResult> {
  return migrateAtreeWorkspace(options.projectRoot, {
    dryRun: options.dryRun,
    fromVersion: options.fromVersion,
    toVersion: options.toVersion,
    createBackup: options.createBackup
  });
}

export function formatMigrationResult(result: MigrationResult): string {
  const lines = [
    "Abstraction Tree migration",
    "",
    `Project: ${result.projectRoot}`,
    `Schema: ${result.plan.fromVersion} -> ${result.plan.toVersion}`,
    `Mode: ${result.dryRun ? "dry run" : "write"}`
  ];

  const issueLines = summarizeMigrationIssues(result);
  if (issueLines.length) {
    lines.push("", "Issues:", ...issueLines.map(issue => `- ${issue}`));
    return `${lines.join("\n")}\n`;
  }

  if (!result.plan.steps.length) {
    lines.push("", "Plan: already current; no migration steps required.");
  } else {
    lines.push("", "Plan:", ...result.plan.steps.map(step => `- ${step.description}`));
  }

  if (result.plan.changedFiles.length) {
    lines.push("Changed files:", ...result.plan.changedFiles.map(filePath => `- ${filePath}`));
  } else {
    lines.push("Changed files: none");
  }

  if (result.dryRun) {
    lines.push("", "Dry run complete; no files were written.");
  } else if (result.applied) {
    lines.push("", "Migration applied.");
    if (result.backupDir) {
      lines.push(`Backup: ${relativePath(result.projectRoot, result.backupDir)}`);
    }
  } else {
    lines.push("", "No files were written.");
  }

  return `${lines.join("\n")}\n`;
}

export function migrationExitCode(result: MigrationResult): number {
  return summarizeMigrationIssues(result).length ? 1 : 0;
}

function relativePath(root: string, target: string): string {
  return path.relative(root, target).replaceAll(path.sep, "/");
}
