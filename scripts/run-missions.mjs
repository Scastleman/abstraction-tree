#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaultMissionsDir = ".abstraction-tree/automation/missions";
const defaultRuntimePath = ".abstraction-tree/automation/mission-runtime.json";
const runRoot = ".abstraction-tree/mission-runs";
const worktreeRoot = ".abstraction-tree/worktrees";
const globalSharedPatterns = [
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  ".github/workflows/**",
  "scripts/run-tests.mjs",
  "scripts/run-missions.mjs",
  "packages/core/src/schema.ts",
  "packages/core/src/validator.ts",
  "packages/core/src/workspace.ts",
  "packages/cli/src/index.ts",
  ".abstraction-tree/config.json"
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
  const stderr = io.stderr ?? process.stderr;
  const options = parseArgs(argv);
  const createdAt = new Date();
  const timestamp = timestampForPath(createdAt);
  const runDir = path.join(cwd, runRoot, timestamp);
  const memory = await readAbstractionMemory(cwd);
  const runtime = options.ignoreRuntime ? emptyMissionRuntime() : await readMissionRuntime(cwd, options.runtime);
  const discoveredMissions = await discoverMissions(cwd, options.missions, memory, {
    only: options.only
  });
  const { missions, skipped } = filterMissionsByRuntime(discoveredMissions, runtime, options);
  const safetyError = safetyErrorFor(options);
  const plan = createMissionPlan({
    createdAt,
    repoRoot: cwd,
    missionsDir: path.resolve(cwd, options.missions),
    missions,
    skipped,
    memory,
    sandbox: options.sandbox,
    warnings: [...memory.warnings],
    executionBlockedReason: safetyError
  });

  await mkdir(runDir, { recursive: true });
  await writeJson(path.join(runDir, "plan.json"), plan);

  if (options.plan) {
    stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return { plan, runDir, statuses: [] };
  }

  if (options.dryRun) {
    stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    stdout.write(`${dryRunCommands(plan, options).join("\n")}\n`);
  }

  if (safetyError) {
    stderr.write(`${safetyError}\n`);
    const error = new Error(safetyError);
    error.plan = plan;
    error.runDir = runDir;
    throw error;
  }

  if (options.dryRun) return { plan, runDir, statuses: [] };

  if (plan.missionCount === 0) {
    stdout.write(`No pending missions. ${plan.skipped.length} skipped by runtime state.\n`);
    return { plan, runDir, statuses: [] };
  }

  const statuses = await executePlan(plan, {
    ...options,
    repoRoot: cwd,
    runDir,
    timestamp,
    spawnProcess: io.spawnProcess ?? spawn
  });

  if (!options.ignoreRuntime) {
    await updateMissionRuntime(cwd, options.runtime, runtime, statuses);
  }

  const failedStatuses = statuses.filter(status => status.status !== "success");
  if (failedStatuses.length) {
    const error = new Error(`Mission runner failed: ${failedStatuses.map(status => status.id).join(", ")}`);
    error.plan = plan;
    error.runDir = runDir;
    error.statuses = statuses;
    throw error;
  }

  return { plan, runDir, statuses };
}

export function parseArgs(argv) {
  const options = {
    plan: false,
    dryRun: false,
    missions: defaultMissionsDir,
    only: [],
    concurrency: 1,
    sandbox: "workspace-write",
    codexBin: "codex",
    worktrees: false,
    allowDangerFullAccess: false,
    runtime: defaultRuntimePath,
    ignoreRuntime: false,
    retryFailed: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--plan":
        options.plan = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--missions":
        options.missions = requiredValue(argv, ++index, arg);
        break;
      case "--only":
        options.only = requiredValue(argv, ++index, arg)
          .split(",")
          .map(value => value.trim())
          .filter(Boolean);
        break;
      case "--concurrency":
        options.concurrency = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
        break;
      case "--sandbox":
        options.sandbox = requiredValue(argv, ++index, arg);
        break;
      case "--codex-bin":
        options.codexBin = requiredValue(argv, ++index, arg);
        break;
      case "--runtime":
        options.runtime = requiredValue(argv, ++index, arg);
        break;
      case "--ignore-runtime":
        options.ignoreRuntime = true;
        break;
      case "--retry-failed":
        options.retryFailed = true;
        break;
      case "--worktrees":
        options.worktrees = true;
        break;
      case "--allow-danger-full-access":
        options.allowDangerFullAccess = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export async function discoverMissions(repoRoot, missionsDir, memory, options = {}) {
  const absoluteDir = path.resolve(repoRoot, missionsDir);
  const candidates = await walkMarkdownFiles(absoluteDir).catch(error => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const only = new Set(options.only ?? []);
  const missions = [];

  for (const filePath of candidates.sort(comparePaths)) {
    const normalized = normalizePath(path.relative(repoRoot, filePath));
    const name = path.basename(normalized);
    if (name.toLowerCase() === "readme.md") continue;
    if (normalized.includes(".abstraction-tree/mission-runs/")) continue;
    if (normalized.includes(".abstraction-tree/worktrees/")) continue;

    const mission = await readMissionFile(repoRoot, filePath, memory);
    mission.runtimePath = normalizePath(path.relative(absoluteDir, filePath));
    if (only.size && !only.has(mission.id) && !only.has(path.basename(mission.filePath, ".md"))) continue;
    missions.push(mission);
  }

  return missions;
}

export async function readMissionRuntime(repoRoot, runtimePath = defaultRuntimePath) {
  try {
    const absolutePath = path.resolve(repoRoot, runtimePath);
    return normalizeMissionRuntime(JSON.parse(stripBom(await readFile(absolutePath, "utf8"))));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyMissionRuntime();
    throw error;
  }
}

export function emptyMissionRuntime() {
  return {
    completed: [],
    failed: [],
    current: "",
    stop_requested: false
  };
}

export function filterMissionsByRuntime(missions, runtime, options = {}) {
  const normalized = normalizeMissionRuntime(runtime);
  const completed = runtimeIdentitySet(normalized.completed, missions);
  const failed = runtimeIdentitySet(normalized.failed, missions);
  const skipped = [];
  const pending = [];

  for (const mission of missions) {
    const exactKeys = missionRuntimeExactKeys(mission);
    const legacyKeys = missionRuntimeLegacyKeys(mission);
    const skipReason = runtimeSkipReason({
      exactKeys,
      legacyKeys,
      completed,
      failed,
      stopRequested: normalized.stop_requested,
      retryFailed: options.retryFailed
    });

    if (skipReason) {
      skipped.push({
        id: mission.id,
        title: mission.title,
        filePath: mission.filePath,
        reason: skipReason
      });
      continue;
    }

    pending.push(mission);
  }

  return { missions: pending, skipped };
}

export async function updateMissionRuntime(repoRoot, runtimePath, runtime, statuses) {
  if (!statuses.length) return normalizeMissionRuntime(runtime);

  const next = normalizeMissionRuntime(runtime);
  const completed = new Set(next.completed);
  const failed = new Set(next.failed);

  for (const status of statuses) {
    const name = stableMissionRuntimePath(status);
    const removalKeys = statusRuntimeRemovalKeys(status);
    for (const key of removalKeys) {
      completed.delete(key);
      failed.delete(key);
    }

    if (status.status === "success") {
      completed.add(name);
    } else {
      failed.add(name);
    }
  }

  next.completed = [...completed].sort(comparePaths);
  next.failed = [...failed].sort(comparePaths);
  next.current = "";
  await writeJson(path.resolve(repoRoot, runtimePath), next);
  return next;
}

export async function readMissionFile(repoRoot, filePath, memory) {
  const original = await readFile(filePath, "utf8");
  const relativePath = normalizePath(path.relative(repoRoot, filePath));
  const { frontmatter, body } = parseMissionMarkdown(original);
  const stem = path.basename(relativePath, ".md");
  const inferredFiles = inferAffectedFiles(body, repoRoot, memory);
  const frontmatterFiles = arrayField(frontmatter.affectedFiles);
  const affectedFiles = uniqueSorted(frontmatterFiles.length ? frontmatterFiles.map(normalizePath) : inferredFiles);
  const affectedNodes = uniqueSorted([
    ...arrayField(frontmatter.affectedNodes),
    ...inferAffectedNodes(body, affectedFiles, memory)
  ]);
  const affectedConcepts = inferAffectedConcepts(body, memory);

  return {
    id: stringField(frontmatter.id, stem),
    title: stringField(frontmatter.title, firstHeading(body) ?? stem),
    filePath: relativePath,
    absolutePath: filePath,
    priority: stringField(frontmatter.priority, "P2"),
    risk: stringField(frontmatter.risk, "medium").toLowerCase(),
    affectedFiles,
    affectedNodes,
    affectedConcepts,
    dependsOn: arrayField(frontmatter.dependsOn),
    parallelGroup: stringField(frontmatter.parallelGroup, undefined),
    parallelGroupSafe: booleanField(frontmatter.parallelGroupSafe) || booleanField(frontmatter.safeParallelGroup),
    originalMarkdown: original,
    body
  };
}

export function parseMissionMarkdown(markdown) {
  if (!markdown.startsWith("---")) return { frontmatter: {}, body: markdown };
  const lines = markdown.split(/\r?\n/);
  if (lines[0].trim() !== "---") return { frontmatter: {}, body: markdown };

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex === -1) return { frontmatter: {}, body: markdown };

  const frontmatterText = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n").replace(/^\s*\n/u, "");
  return { frontmatter: parseSimpleFrontmatter(frontmatterText), body };
}

export function parseSimpleFrontmatter(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  let currentArrayKey;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/u, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const arrayItem = line.match(/^\s*-\s*(.*)$/u);
    if (arrayItem && currentArrayKey) {
      result[currentArrayKey].push(unquote(arrayItem[1].trim()));
      continue;
    }

    currentArrayKey = undefined;
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!field) continue;

    const key = field[1];
    const value = field[2].trim();
    if (value === "[]") {
      result[key] = [];
      continue;
    }
    if (!value) {
      result[key] = [];
      currentArrayKey = key;
      continue;
    }
    if (value === "true") {
      result[key] = true;
      continue;
    }
    if (value === "false") {
      result[key] = false;
      continue;
    }
    result[key] = unquote(value);
  }

  return result;
}

export function createMissionPlan(input) {
  const missions = orderByDependencies(input.missions, input.warnings);
  const remaining = [...missions];
  const completed = new Set();
  const batches = [];

  while (remaining.length) {
    const ready = remaining.filter(mission => mission.dependsOn.every(dep => completed.has(dep) || !missions.some(item => item.id === dep)));
    const candidates = ready.length ? ready : [remaining[0]];
    if (!ready.length) {
      input.warnings.push(`Dependency cycle or missing dependency order near ${remaining[0].id}; isolating that mission.`);
    }

    const batch = [];
    for (const mission of candidates) {
      if (canAddToBatch(mission, batch, input.memory, input.sandbox)) batch.push(mission);
    }
    if (!batch.length) batch.push(candidates[0]);

    for (const mission of batch) {
      remaining.splice(remaining.indexOf(mission), 1);
      completed.add(mission.id);
    }

    batches.push({
      index: batches.length + 1,
      parallelSafe: batch.length > 1,
      missions: batch.map(mission => planMission(mission, batch, input.memory, input.sandbox))
    });
  }

  return {
    createdAt: input.createdAt.toISOString(),
    repoRoot: input.repoRoot,
    missionsDir: input.missionsDir,
    missionCount: missions.length,
    skipped: input.skipped ?? [],
    ...(input.executionBlockedReason ? { executionBlockedReason: input.executionBlockedReason } : {}),
    batches,
    warnings: input.warnings
  };
}

export async function executePlan(plan, options) {
  const statuses = [];

  for (const batch of plan.batches) {
    const batchStartedAt = new Date();
    const batchStatuses = [];
    for (let index = 0; index < batch.missions.length; index += options.concurrency) {
      const group = batch.missions.slice(index, index + options.concurrency);
      const groupStatuses = await Promise.all(group.map(mission => executeMission(mission, options)));
      statuses.push(...groupStatuses);
      batchStatuses.push(...groupStatuses);
    }
    await writeBatchSummary(batch, batchStatuses, {
      runDir: options.runDir,
      startedAt: batchStartedAt,
      finishedAt: new Date()
    });
  }

  return statuses;
}

async function writeBatchSummary(batch, statuses, input) {
  const name = `batch-${String(batch.index).padStart(3, "0")}`;
  const statusPath = path.join(input.runDir, `${name}.status.json`);
  const markdownPath = path.join(input.runDir, `${name}.md`);
  const summary = buildBatchSummary(batch, statuses, {
    runDir: input.runDir,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt
  });

  await writeJson(statusPath, summary);
  await writeFile(markdownPath, renderBatchSummaryMarkdown(summary, markdownPath), "utf8");
}

function buildBatchSummary(batch, statuses, input) {
  const statusesById = new Map(statuses.map(status => [status.id, status]));

  return {
    batchIndex: batch.index,
    missionIds: batch.missions.map(mission => mission.id),
    parallelSafe: Boolean(batch.parallelSafe),
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    statuses: batch.missions.map(mission => {
      const status = statusesById.get(mission.id);
      const artifacts = missionArtifactPaths(input.runDir, mission.id);
      return {
        id: mission.id,
        filePath: status?.filePath ?? mission.filePath,
        status: status?.status ?? "not-run",
        exitCode: status?.exitCode ?? null,
        worktreePath: status?.worktreePath ?? null,
        startedAt: status?.startedAt ?? null,
        finishedAt: status?.finishedAt ?? null,
        finalPath: status?.finalPath ?? artifacts.finalPath,
        stderrPath: artifacts.stderrPath,
        statusPath: artifacts.statusPath,
        promptPath: status?.promptPath ?? artifacts.promptPath,
        jsonlPath: status?.jsonlPath ?? artifacts.jsonlPath
      };
    })
  };
}

function renderBatchSummaryMarkdown(summary, markdownPath) {
  const lines = [
    `# Batch ${String(summary.batchIndex).padStart(3, "0")}`,
    "",
    `- Parallel safe: ${summary.parallelSafe ? "yes" : "no"}`,
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    `- Missions: ${summary.missionIds.join(", ") || "none"}`
  ];

  for (const status of summary.statuses) {
    lines.push(
      "",
      `## ${status.id}`,
      "",
      `- Status: ${status.status}`,
      `- Exit code: ${status.exitCode ?? "none"}`,
      `- Mission file: ${status.filePath}`,
      `- Worktree: ${status.worktreePath ?? "none"}`,
      `- Artifacts: ${artifactLinks(status, markdownPath).join(", ")}`
    );
  }

  return `${lines.join("\n")}\n`;
}

function artifactLinks(status, markdownPath) {
  return [
    ["final", status.finalPath],
    ["stderr", status.stderrPath],
    ["status", status.statusPath],
    ["jsonl", status.jsonlPath],
    ["prompt", status.promptPath]
  ].map(([label, targetPath]) => markdownLink(label, markdownPath, targetPath));
}

function markdownLink(label, markdownPath, targetPath) {
  return `[${label}](${normalizePath(path.relative(path.dirname(markdownPath), targetPath))})`;
}

function missionArtifactPaths(runDir, missionId) {
  const missionDir = path.join(runDir, safeName(missionId));
  return {
    promptPath: path.join(missionDir, "prompt.md"),
    jsonlPath: path.join(missionDir, "codex.jsonl"),
    stderrPath: path.join(missionDir, "stderr.log"),
    finalPath: path.join(missionDir, "final.md"),
    statusPath: path.join(missionDir, "status.json")
  };
}

export async function executeMission(mission, options) {
  const promptMission = await hydrateMissionPrompt(mission, options.repoRoot);
  const missionDir = path.join(options.runDir, safeName(mission.id));
  await mkdir(missionDir, { recursive: true });

  const promptPath = path.join(missionDir, "prompt.md");
  const jsonlPath = path.join(missionDir, "codex.jsonl");
  const stderrPath = path.join(missionDir, "stderr.log");
  const finalPath = path.join(missionDir, "final.md");
  const statusPath = path.join(missionDir, "status.json");
  const startedAt = new Date();
  const prompt = assemblePrompt(promptMission);
  await writeFile(promptPath, prompt, "utf8");

  const worktreeResult = await prepareMissionWorktree(mission, options);
  if (worktreeResult.status === "failed") {
    const status = missionStatus(mission, {
      status: "failed",
      startedAt,
      finishedAt: new Date(),
      exitCode: 1,
      sandbox: options.sandbox,
      usedWorktree: Boolean(options.worktrees),
      worktreePath: worktreeResult.worktreePath,
      promptPath,
      jsonlPath,
      stderrPath,
      statusPath,
      finalPath
    });
    await writeFile(finalPath, worktreeResult.message, "utf8");
    await writeJson(statusPath, status);
    return status;
  }

  const cwd = worktreeResult.worktreePath ?? options.repoRoot;
  let result;
  try {
    result = await runCodex({
      cwd,
      codexBin: options.codexBin,
      sandbox: options.sandbox,
      prompt,
      jsonlPath,
      stderrPath,
      spawnProcess: options.spawnProcess
    });
  } catch (error) {
    result = { exitCode: 1, stdout: "", stderr: error.message };
    await writeFile(jsonlPath, "", "utf8");
    await writeFile(stderrPath, `${error.message}\n`, "utf8");
  }
  const finalText = finalAgentMessage(result.stdout) ?? fallbackFinal(result.exitCode, result.stderr);
  await writeFile(finalPath, finalText, "utf8");

  const status = missionStatus(mission, {
    status: result.exitCode === 0 ? "success" : "failed",
    startedAt,
    finishedAt: new Date(),
    exitCode: result.exitCode,
    sandbox: options.sandbox,
    usedWorktree: Boolean(worktreeResult.worktreePath),
    worktreePath: worktreeResult.worktreePath,
    promptPath,
    jsonlPath,
    stderrPath,
    statusPath,
    finalPath
  });
  await writeJson(statusPath, status);
  return status;
}

async function hydrateMissionPrompt(mission, repoRoot) {
  if (typeof mission.body === "string" && typeof mission.originalMarkdown === "string") return mission;
  const originalMarkdown = await readFile(path.join(repoRoot, mission.filePath), "utf8");
  const { body } = parseMissionMarkdown(originalMarkdown);
  return { ...mission, originalMarkdown, body };
}

export function assemblePrompt(mission) {
  return `# Mission: ${mission.title}

You are working in the Abstraction Tree repository.

## Rules

- Complete exactly this mission.
- Prefer the smallest coherent change.
- Do not work on unrelated missions.
- Do not commit, push, or open a PR.
- Keep changes within the affected files/nodes when possible.
- Read \`.abstraction-tree/config.json\`, \`.abstraction-tree/tree.json\`, \`.abstraction-tree/files.json\`, \`.abstraction-tree/concepts.json\`, and relevant docs before editing.
- If implementation changes ownership, architecture, concepts, invariants, or scanner output, update \`.abstraction-tree/\` memory appropriately.
- Run relevant checks.
- At minimum try: \`npm run build\`, \`npm test\`, and \`npm run atree:validate\`.
- If a check cannot run, record why and what fallback was used.
- End with a concise summary of changed files, checks run, and remaining risks.

## Mission metadata

- id: ${mission.id}
- priority: ${mission.priority}
- risk: ${mission.risk}
- affectedFiles:
${listForPrompt(mission.affectedFiles)}
- affectedNodes:
${listForPrompt(mission.affectedNodes)}
- dependsOn:
${listForPrompt(mission.dependsOn)}

## Original mission

${mission.body || mission.originalMarkdown}
`;
}

export function finalAgentMessage(stdout) {
  let finalText;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const text = extractAgentText(event);
    if (text) finalText = text;
  }
  return finalText;
}

export async function readAbstractionMemory(repoRoot) {
  const warnings = [];
  const [tree, files, concepts, invariants] = await Promise.all([
    readOptionalJson(path.join(repoRoot, ".abstraction-tree", "tree.json"), [], warnings),
    readOptionalJson(path.join(repoRoot, ".abstraction-tree", "files.json"), [], warnings),
    readOptionalJson(path.join(repoRoot, ".abstraction-tree", "concepts.json"), [], warnings),
    readOptionalJson(path.join(repoRoot, ".abstraction-tree", "invariants.json"), [], warnings)
  ]);
  const nodesById = new Map(array(tree).map(node => [node.id, node]).filter(([id]) => typeof id === "string"));
  const fileOwners = new Map();
  for (const file of array(files)) {
    if (typeof file.path === "string") fileOwners.set(normalizePath(file.path), array(file.ownedByNodeIds).filter(isString));
  }
  const conceptTerms = new Map();
  for (const concept of array(concepts)) {
    if (typeof concept.id === "string") {
      conceptTerms.set(concept.id.toLowerCase(), {
        id: concept.id,
        relatedNodeIds: array(concept.relatedNodeIds).filter(isString)
      });
    }
  }

  return {
    tree: array(tree),
    files: array(files),
    concepts: array(concepts),
    invariants: array(invariants),
    nodesById,
    fileOwners,
    conceptTerms,
    warnings
  };
}

function safetyErrorFor(options) {
  if (options.sandbox === "danger-full-access" && !options.allowDangerFullAccess) {
    return "--sandbox danger-full-access requires --allow-danger-full-access.";
  }
  if (options.concurrency > 1 && options.sandbox === "workspace-write" && !options.worktrees) {
    return "--concurrency > 1 with --sandbox workspace-write requires --worktrees.";
  }
  return undefined;
}

function dryRunCommands(plan, options) {
  const lines = ["Codex commands:"];
  for (const batch of plan.batches) {
    for (const mission of batch.missions) {
      const cwd = options.worktrees ? path.join(worktreeRoot, "<timestamp>", safeName(mission.id)) : ".";
      lines.push(`[batch ${batch.index}] (cd ${cwd} && ${options.codexBin} exec --json --sandbox ${options.sandbox} -) # ${mission.id}`);
    }
  }
  return lines;
}

function canAddToBatch(mission, batch, memory, sandbox) {
  return batch.every(existing => !conflictReason(existing, mission, memory, sandbox));
}

function planMission(mission, batch, memory, sandbox) {
  const reasons = batch
    .filter(other => other.id !== mission.id)
    .map(other => conflictReason(mission, other, memory, sandbox))
    .filter(Boolean);
  const parallelReason = reasons.length
    ? reasons.join(" ")
    : batch.length > 1
      ? "No overlapping files, nodes, neighborhoods, or global files."
      : isolatedReason(mission, memory, sandbox);

  return {
    id: mission.id,
    title: mission.title,
    filePath: mission.filePath,
    priority: mission.priority,
    risk: mission.risk,
    affectedFiles: mission.affectedFiles,
    affectedNodes: mission.affectedNodes,
    dependsOn: mission.dependsOn,
    parallelReason
  };
}

function conflictReason(left, right, memory, sandbox) {
  if (left.risk === "high" || right.risk === "high") return "High-risk missions are isolated.";
  if (left.dependsOn.includes(right.id) || right.dependsOn.includes(left.id)) return "Mission dependency prevents batching.";
  if (intersects(left.affectedFiles, right.affectedFiles)) return "Affected files overlap.";
  if (intersects(left.affectedNodes, right.affectedNodes)) return "Affected nodes overlap.";
  if (intersects(left.affectedConcepts ?? [], right.affectedConcepts ?? [])) return "Affected concepts overlap.";
  if (intersects(nodeNeighborhoods(left.affectedNodes, memory), nodeNeighborhoods(right.affectedNodes, memory))) {
    return "Affected node neighborhoods overlap.";
  }
  if (sandbox !== "read-only" && (touchesGlobalFile(left.affectedFiles) || touchesGlobalFile(right.affectedFiles))) {
    return "Writable mission touches global/shared files.";
  }
  if (sandbox !== "read-only" && (touchesHighSeverityInvariant(left.affectedFiles, memory) || touchesHighSeverityInvariant(right.affectedFiles, memory))) {
    return "Writable mission touches high-severity invariant files.";
  }
  if (left.parallelGroup && left.parallelGroup === right.parallelGroup && !(left.parallelGroupSafe && right.parallelGroupSafe)) {
    return `parallelGroup ${left.parallelGroup} is not marked safe.`;
  }
  return undefined;
}

function isolatedReason(mission, memory, sandbox) {
  if (mission.risk === "high") return "High-risk mission isolated.";
  if (sandbox !== "read-only" && touchesGlobalFile(mission.affectedFiles)) return "Writable mission touches global/shared files.";
  if (sandbox !== "read-only" && touchesHighSeverityInvariant(mission.affectedFiles, memory)) return "Writable mission touches high-severity invariant files.";
  return "Single mission batch.";
}

function nodeNeighborhoods(nodeIds, memory) {
  const values = new Set();
  for (const nodeId of nodeIds) {
    values.add(nodeId);
    const node = memory.nodesById.get(nodeId);
    const parent = node?.parent ?? node?.parentId;
    if (typeof parent === "string") values.add(parent);
    for (const child of array(node?.children).filter(isString)) values.add(child);
  }
  return [...values];
}

function touchesGlobalFile(files) {
  return files.some(file => globalSharedPatterns.some(pattern => matchesGlobalPattern(file, pattern)));
}

function touchesHighSeverityInvariant(files, memory) {
  const touched = new Set(files.map(normalizePath));
  return memory.invariants.some(invariant =>
    invariant?.severity === "high" &&
    array(invariant.filePaths).filter(isString).map(normalizePath).some(file => touched.has(file))
  );
}

function matchesGlobalPattern(filePath, pattern) {
  const normalized = normalizePath(filePath);
  if (pattern.endsWith("/**")) return normalized.startsWith(pattern.slice(0, -3));
  return normalized === pattern;
}

function orderByDependencies(missions, warnings) {
  const remaining = [...missions];
  const ordered = [];
  const completed = new Set();
  while (remaining.length) {
    const readyIndex = remaining.findIndex(mission =>
      mission.dependsOn.every(dep => completed.has(dep) || !missions.some(candidate => candidate.id === dep))
    );
    const index = readyIndex === -1 ? 0 : readyIndex;
    if (readyIndex === -1) warnings.push(`Could not fully resolve dependencies near ${remaining[0].id}.`);
    const [mission] = remaining.splice(index, 1);
    ordered.push(mission);
    completed.add(mission.id);
  }
  return ordered;
}

async function walkMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdownFiles(absolutePath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(absolutePath);
  }
  return files;
}

function inferAffectedFiles(body, repoRoot, memory) {
  const known = new Set(memory.files.map(file => file.path).filter(isString).map(normalizePath));
  const candidates = new Set();
  for (const raw of body.match(/[A-Za-z0-9_.@/-]+\.[A-Za-z0-9]+/gu) ?? []) {
    const candidate = normalizePath(raw.replace(/^[`"'([{]+|[`"',.)\]}:;]+$/gu, ""));
    if (!candidate.includes("/") && !candidate.startsWith("package")) continue;
    if (known.has(candidate) || fileExistsSyncish(path.join(repoRoot, candidate))) candidates.add(candidate);
  }
  return uniqueSorted([...candidates]);
}

function inferAffectedNodes(body, affectedFiles, memory) {
  const nodes = new Set();
  for (const nodeId of memory.nodesById.keys()) {
    if (body.includes(nodeId)) nodes.add(nodeId);
  }
  for (const file of affectedFiles) {
    for (const owner of memory.fileOwners.get(file) ?? []) nodes.add(owner);
  }
  return uniqueSorted([...nodes]);
}

function inferAffectedConcepts(body, memory) {
  const concepts = new Set();
  const lowerBody = body.toLowerCase();
  for (const [term] of memory.conceptTerms) {
    if (!mentionsTerm(lowerBody, term)) continue;
    concepts.add(term);
  }
  return uniqueSorted([...concepts]);
}

function mentionsTerm(lowerBody, term) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, "u").test(lowerBody);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function firstHeading(markdown) {
  const match = markdown.match(/^#{1,6}\s+(.+)$/mu);
  return match?.[1]?.trim();
}

async function prepareMissionWorktree(mission, options) {
  if (!options.worktrees) return { status: "skipped" };
  const worktreePath = path.join(options.repoRoot, worktreeRoot, options.timestamp, safeName(mission.id));
  const branchName = `atree/mission/${options.timestamp}/${safeName(mission.id)}`;
  try {
    await mkdir(path.dirname(worktreePath), { recursive: true });
    await execFileAsync("git", ["worktree", "add", "-b", branchName, worktreePath], {
      cwd: options.repoRoot,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });
    return { status: "success", worktreePath };
  } catch (error) {
    return {
      status: "failed",
      worktreePath,
      message: `# Mission failed before Codex\n\nCould not create git worktree for ${mission.id}.\n\n${error.message}\n`
    };
  }
}

async function runCodex(input) {
  const args = ["exec", "--json", "--sandbox", input.sandbox, "-"];
  const child = spawnCodexChild(input.spawnProcess, input.codexBin, args, {
    cwd: input.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  const stdoutFile = createWriteStream(input.jsonlPath);
  const stderrFile = createWriteStream(input.stderrPath);

  child.stdout.on("data", chunk => {
    stdoutChunks.push(chunk);
    stdoutFile.write(chunk);
  });
  child.stderr.on("data", chunk => {
    stderrChunks.push(chunk);
    stderrFile.write(chunk);
  });

  child.stdin.end(input.prompt);
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => resolve(code ?? 1));
  });
  await Promise.all([closeStream(stdoutFile), closeStream(stderrFile)]);

  return {
    exitCode,
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8")
  };
}

function spawnCodexChild(spawnProcess, codexBin, args, options) {
  if (process.platform === "win32" && /\.(cmd|bat)$/iu.test(codexBin)) {
    const command = ["call", quoteCmd(codexBin), ...args.map(quoteCmd)].join(" ");
    return spawnProcess(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], {
      ...options,
      windowsVerbatimArguments: true
    });
  }
  return spawnProcess(codexBin, args, options);
}

function quoteCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function missionStatus(mission, input) {
  return {
    id: mission.id,
    filePath: mission.filePath,
    status: input.status,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    exitCode: input.exitCode,
    sandbox: input.sandbox,
    usedWorktree: input.usedWorktree,
    worktreePath: input.worktreePath ?? null,
    promptPath: input.promptPath,
    jsonlPath: input.jsonlPath,
    stderrPath: input.stderrPath,
    statusPath: input.statusPath,
    finalPath: input.finalPath,
    affectedFiles: mission.affectedFiles,
    affectedNodes: mission.affectedNodes
  };
}

function normalizeMissionRuntime(runtime) {
  const empty = emptyMissionRuntime();
  if (!runtime || typeof runtime !== "object") return empty;
  return {
    completed: arrayField(runtime.completed),
    failed: arrayField(runtime.failed),
    current: stringField(runtime.current, ""),
    stop_requested: Boolean(runtime.stop_requested)
  };
}

function runtimeIdentitySet(values, missions) {
  const legacyCounts = legacyRuntimeKeyCounts(missions);
  const exact = new Set();
  const legacy = new Set();

  for (const value of values) {
    const normalized = normalizePath(value);
    if (isPathRuntimeEntry(normalized)) {
      exact.add(normalized);
      continue;
    }
    if ((legacyCounts.get(normalized) ?? 0) === 1) legacy.add(normalized);
  }

  return { exact, legacy };
}

function legacyRuntimeKeyCounts(missions) {
  const counts = new Map();
  for (const mission of missions) {
    for (const key of new Set(missionRuntimeLegacyKeys(mission))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function missionRuntimeExactKeys(mission) {
  return uniqueSorted([
    mission.filePath,
    mission.runtimePath
  ].filter(isString).map(normalizePath));
}

function missionRuntimeLegacyKeys(mission) {
  return uniqueSorted([
    mission.id,
    path.basename(mission.filePath),
    path.basename(mission.filePath, ".md")
  ].filter(isString).map(normalizePath));
}

function stableMissionRuntimePath(status) {
  return normalizePath(status.filePath ?? `${status.id}.md`);
}

function statusRuntimeRemovalKeys(status) {
  const stablePath = stableMissionRuntimePath(status);
  return uniqueSorted([
    stablePath,
    status.id,
    path.basename(stablePath),
    path.basename(stablePath, ".md")
  ].filter(isString).map(normalizePath));
}

function runtimeSkipReason(input) {
  if (input.stopRequested) return "runtime stop requested";
  if (hasRuntimeIdentity(input.completed, input.exactKeys, input.legacyKeys)) return "completed";
  if (!input.retryFailed && hasRuntimeIdentity(input.failed, input.exactKeys, input.legacyKeys)) return "previously failed";
  return "";
}

function hasRuntimeIdentity(runtimeSet, exactKeys, legacyKeys) {
  return exactKeys.some(key => runtimeSet.exact.has(key)) || legacyKeys.some(key => runtimeSet.legacy.has(key));
}

function isPathRuntimeEntry(value) {
  return value.includes("/");
}

function extractAgentText(value) {
  if (!value || typeof value !== "object") return undefined;
  if (value.role === "assistant" && typeof value.content === "string") return value.content;
  if (typeof value.type === "string" && value.type.includes("agent")) {
    for (const key of ["message", "text", "content", "delta"]) {
      if (typeof value[key] === "string" && value[key].trim()) return value[key];
    }
  }
  if (Array.isArray(value.content)) {
    const text = value.content.map(extractContentText).filter(Boolean).join("\n").trim();
    if (text) return text;
  }
  for (const key of ["item", "message", "response"]) {
    const nested = extractAgentText(value[key]);
    if (nested) return nested;
  }
  return undefined;
}

function extractContentText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  return value.text ?? value.content;
}

function fallbackFinal(exitCode, stderr) {
  const summary = stderr.trim().split(/\r?\n/).slice(-20).join("\n");
  return `# Mission finished without a parsed agent message\n\nExit code: ${exitCode}\n\n${summary ? `## stderr tail\n\n\`\`\`\n${summary}\n\`\`\`\n` : ""}`;
}

function listForPrompt(values) {
  if (!values.length) return "  - none";
  return values.map(value => `  - ${value}`).join("\n");
}

async function readOptionalJson(filePath, fallback, warnings) {
  try {
    return JSON.parse(stripBom(await readFile(filePath, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    warnings.push(`${normalizePath(filePath)} could not be read as JSON: ${error.message}`);
    return fallback;
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function closeStream(stream) {
  return new Promise(resolve => stream.end(resolve));
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} requires a positive integer.`);
  return parsed;
}

function stringField(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayField(value) {
  return Array.isArray(value) ? value.filter(isString).map(item => item.trim()).filter(Boolean) : [];
}

function booleanField(value) {
  return value === true || value === "true";
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function isString(value) {
  return typeof value === "string";
}

function unquote(value) {
  return value.replace(/^["']|["']$/gu, "");
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(comparePaths);
}

function intersects(left, right) {
  const rightSet = new Set(right);
  return left.some(value => rightSet.has(value));
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function comparePaths(left, right) {
  return normalizePath(left).localeCompare(normalizePath(right));
}

function safeName(value) {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "mission";
}

function timestampForPath(date) {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function fileExistsSyncish(filePath) {
  return existsSync(filePath);
}
