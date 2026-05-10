#!/usr/bin/env node
import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateMissionMarkdown } from "./mission-schema.mjs";

export {
  validMissionCategories,
  validateMissionFrontmatter
} from "./mission-schema.mjs";

export const defaultMissionImportRoot = ".abstraction-tree/missions";

const blockedDestinationPrefixes = [
  ".abstraction-tree/assessment-packs",
  ".abstraction-tree/automation/full-loop-runs",
  ".abstraction-tree/automation/mission-logs",
  ".abstraction-tree/automation/mission-runtime.json",
  ".abstraction-tree/mission-runs",
  ".abstraction-tree/worktrees"
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function runCli(argv = [], io = {}) {
  const cwd = path.resolve(io.cwd ?? process.cwd());
  const stdout = io.stdout ?? process.stdout;
  const options = parseArgs(argv);
  const result = await importAssessmentMissions({
    cwd,
    from: options.from,
    name: options.name,
    to: options.to,
    dryRun: options.dryRun,
    overwrite: options.overwrite
  });

  const destination = relative(cwd, result.destinationDir);
  const source = relative(cwd, result.sourceDir);
  const verb = result.dryRun ? "Dry run validated" : "Imported";
  stdout.write(`${verb} ${result.missionCount} mission(s) from ${source} to ${destination}.\n`);
  stdout.write(`${result.dryRun ? "Would copy" : "Copied"} ${result.fileCount} Markdown file(s).\n`);
  return result;
}

export function parseArgs(argv = []) {
  const options = {
    from: "",
    name: "",
    to: defaultMissionImportRoot,
    dryRun: false,
    overwrite: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--from":
        options.from = valueAt(argv, ++index, arg);
        break;
      case "--name":
        options.name = valueAt(argv, ++index, arg);
        break;
      case "--to":
        options.to = valueAt(argv, ++index, arg);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--overwrite":
        options.overwrite = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.from) throw new Error("--from requires a source folder.");
  if (!options.name) throw new Error("--name requires an import slug.");
  validateSlug(options.name);
  return options;
}

export async function importAssessmentMissions(input) {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const sourceDir = path.resolve(cwd, input.from);
  const targetRoot = path.resolve(cwd, input.to ?? defaultMissionImportRoot);
  const destinationDir = path.resolve(targetRoot, input.name);

  validateSlug(input.name);
  await assertDirectory(sourceDir, `--from must point to an existing folder: ${relative(cwd, sourceDir)}.`);
  assertSafeDestination(cwd, targetRoot, destinationDir);
  assertDistinctSourceAndDestination(cwd, sourceDir, destinationDir);

  const sourceFiles = await walkSourceFiles(sourceDir);
  if (!sourceFiles.length) {
    throw new Error(`Import source has no files: ${relative(cwd, sourceDir)}.`);
  }

  const copyPlan = sourceFiles.map(filePath => {
    const relativePath = normalizePath(path.relative(sourceDir, filePath));
    const destinationPath = path.resolve(destinationDir, ...relativePath.split("/"));
    if (!isInsideOrSame(destinationDir, destinationPath)) {
      throw new Error(`Refusing to copy ${relativePath}; destination would leave ${relative(cwd, destinationDir)}.`);
    }
    return { sourcePath: filePath, relativePath, destinationPath };
  }).sort((left, right) => comparePaths(left.relativePath, right.relativePath));

  const nonMarkdown = copyPlan.filter(file => !file.relativePath.toLowerCase().endsWith(".md"));
  if (nonMarkdown.length) {
    throw new Error(
      `Import source contains non-Markdown file(s): ${nonMarkdown.map(file => file.relativePath).join(", ")}.`
    );
  }

  const missionEntries = copyPlan.filter(file => path.basename(file.relativePath).toLowerCase() !== "readme.md");
  if (!missionEntries.length) {
    throw new Error("Import source contains no mission Markdown files. README.md is allowed but is not a mission.");
  }

  const missions = await validateMissionEntries(missionEntries);
  const destinationExists = await pathExists(destinationDir);
  if (destinationExists && !input.overwrite) {
    throw new Error(
      `Destination already exists: ${relative(cwd, destinationDir)}. Pass --overwrite to replace it.`
    );
  }

  if (!input.dryRun) {
    if (destinationExists) await rm(destinationDir, { recursive: true, force: true });
    await mkdir(destinationDir, { recursive: true });
    for (const file of copyPlan) {
      await mkdir(path.dirname(file.destinationPath), { recursive: true });
      await copyFile(file.sourcePath, file.destinationPath);
    }
  }

  return {
    dryRun: Boolean(input.dryRun),
    sourceDir,
    destinationDir,
    fileCount: copyPlan.length,
    missionCount: missions.length,
    missions,
    copiedFiles: copyPlan.map(file => ({
      source: file.sourcePath,
      destination: file.destinationPath,
      relativePath: file.relativePath
    }))
  };
}

export async function validateMissionEntries(entries) {
  const missions = [];
  const ids = new Map();

  for (const entry of entries) {
    const markdown = await readFile(entry.sourcePath, "utf8");
    const { frontmatter: mission } = validateMissionMarkdown(markdown, entry.relativePath);
    const existing = ids.get(mission.id);
    if (existing) {
      throw new Error(`Mission id ${mission.id} is duplicated in ${existing} and ${entry.relativePath}.`);
    }
    ids.set(mission.id, entry.relativePath);
    missions.push({ ...mission, relativePath: entry.relativePath });
  }

  return missions.sort((left, right) => comparePaths(left.relativePath, right.relativePath));
}

async function walkSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Import source contains unsupported symlink: ${normalizePath(absolutePath)}.`);
    }
    if (entry.isDirectory()) {
      files.push(...await walkSourceFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function assertDirectory(directory, message) {
  const value = await stat(directory).catch(error => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (!value?.isDirectory()) throw new Error(message);
}

async function pathExists(filePath) {
  return Boolean(await stat(filePath).catch(error => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }));
}

function assertSafeDestination(cwd, targetRoot, destinationDir) {
  if (!isInsideOrSame(cwd, destinationDir) || samePath(cwd, destinationDir)) {
    throw new Error(`Destination must stay inside the repository: ${destinationDir}.`);
  }
  if (!isInsideOrSame(targetRoot, destinationDir) || samePath(targetRoot, destinationDir)) {
    throw new Error(`Destination must be a named child folder of --to: ${normalizePath(destinationDir)}.`);
  }

  const destinationRelative = relative(cwd, destinationDir);
  for (const blocked of blockedDestinationPrefixes) {
    if (destinationRelative === blocked || destinationRelative.startsWith(`${blocked}/`)) {
      throw new Error(`Destination cannot be inside runtime artifact folder ${blocked}.`);
    }
  }
}

function assertDistinctSourceAndDestination(cwd, sourceDir, destinationDir) {
  if (isInsideOrSame(sourceDir, destinationDir) || isInsideOrSame(destinationDir, sourceDir)) {
    throw new Error(
      `--from and destination must not overlap: ${relative(cwd, sourceDir)} -> ${relative(cwd, destinationDir)}.`
    );
  }
}

function validateSlug(value) {
  if (!/^[A-Za-z0-9._-]+$/u.test(value) || value === "." || value === "..") {
    throw new Error("--name must be a slug containing only letters, numbers, dots, underscores, and hyphens.");
  }
}

function valueAt(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function isInsideOrSame(directory, filePath) {
  const relativePath = path.relative(path.resolve(directory), path.resolve(filePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function samePath(left, right) {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function comparePaths(left, right) {
  return normalizePath(left).localeCompare(normalizePath(right));
}

function relative(cwd, filePath) {
  return normalizePath(path.relative(cwd, filePath));
}
