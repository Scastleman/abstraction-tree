import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { promisify } from "node:util";
import {
  createMissionPlan,
  discoverMissions,
  parseSimpleFrontmatter,
  readAbstractionMemory,
  readMissionRuntime,
  readMissionFile,
  runCli
} from "./run-missions.mjs";

const execFileAsync = promisify(execFile);

test("frontmatter parser supports scalars, empty arrays, and block arrays", () => {
  const parsed = parseSimpleFrontmatter(`
id: mission-001
title: Bind serve to localhost
priority: P0
dependsOn: []
affectedFiles:
  - package.json
  - scripts/run-missions.mjs
affectedNodes:
  - file.package-json
`);

  assert.equal(parsed.id, "mission-001");
  assert.equal(parsed.title, "Bind serve to localhost");
  assert.equal(parsed.priority, "P0");
  assert.deepEqual(parsed.dependsOn, []);
  assert.deepEqual(parsed.affectedFiles, ["package.json", "scripts/run-missions.mjs"]);
  assert.deepEqual(parsed.affectedNodes, ["file.package-json"]);
});

test("mission discovery recursively excludes README files", async t => {
  const root = await tempWorkspace(t, "atree-missions-discovery-");
  await writeFileAt(root, ".abstraction-tree/missions/README.md", "# Missions\n");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n");
  await writeFileAt(root, ".abstraction-tree/missions/nested/mission-002.md", "# Two\n");

  const memory = await readAbstractionMemory(root);
  const missions = await discoverMissions(root, ".abstraction-tree/missions", memory);

  assert.deepEqual(missions.map(mission => mission.id), ["mission-001", "mission-002"]);
});

test("mission title is inferred from the first markdown heading", async t => {
  const root = await tempWorkspace(t, "atree-missions-heading-");
  const missionPath = await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "## Improve context packs\n\nBody.\n");

  const mission = await readMissionFile(root, missionPath, await readAbstractionMemory(root));

  assert.equal(mission.title, "Improve context packs");
});

test("affected files are inferred from body text when files exist", async t => {
  const root = await tempWorkspace(t, "atree-missions-files-");
  await writeFileAt(root, "package.json", "{}\n");
  await writeFileAt(root, "scripts/run-missions.mjs", "export {};\n");
  const missionPath = await writeFileAt(
    root,
    ".abstraction-tree/missions/mission-001.md",
    "# Mission\n\nTouch `package.json` and `scripts/run-missions.mjs`.\n"
  );

  const mission = await readMissionFile(root, missionPath, await readAbstractionMemory(root));

  assert.deepEqual(mission.affectedFiles, ["package.json", "scripts/run-missions.mjs"]);
});

test("batch planning prevents overlap on affected files", () => {
  const plan = createMissionPlan(planInput([
    mission("a", { affectedFiles: ["packages/core/src/schema.ts"] }),
    mission("b", { affectedFiles: ["packages/core/src/schema.ts"] })
  ]));

  assert.equal(plan.batches.length, 2);
});

test("batch planning prevents overlap on affected node neighborhoods", () => {
  const memory = memoryWithNodes([
    { id: "parent", children: ["child-a", "child-b"] },
    { id: "child-a", parent: "parent", children: [] },
    { id: "child-b", parent: "parent", children: [] }
  ]);
  const plan = createMissionPlan(planInput([
    mission("a", { affectedNodes: ["child-a"] }),
    mission("b", { affectedNodes: ["child-b"] })
  ], { memory }));

  assert.equal(plan.batches.length, 2);
});

test("high-risk missions are isolated from other missions", () => {
  const plan = createMissionPlan(planInput([
    mission("a", { risk: "high" }),
    mission("b")
  ]));

  assert.equal(plan.batches.length, 2);
  assert.match(plan.batches[0].missions[0].parallelReason, /High-risk/);
});

test("global shared files are not parallel-safe for writable missions", () => {
  const plan = createMissionPlan(planInput([
    mission("a", { affectedFiles: ["package.json"] }),
    mission("b", { affectedFiles: ["packages/core/src/context.ts"] })
  ]));

  assert.equal(plan.batches.length, 2);
  assert.match(plan.batches[0].missions[0].parallelReason, /global\/shared/);
});

test("dry-run prints commands without spawning Codex", async t => {
  const root = await tempWorkspace(t, "atree-missions-dry-run-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n");
  let spawned = false;

  const stdout = captureStream();
  await runCli(["--dry-run", "--missions", ".abstraction-tree/missions"], {
    cwd: root,
    stdout,
    stderr: captureStream(),
    spawnProcess() {
      spawned = true;
      throw new Error("should not spawn");
    }
  });

  assert.equal(spawned, false);
  assert.match(stdout.text, /Codex commands:/);
  assert.match(stdout.text, /mission-001/);
});

test("plan surfaces workspace-write concurrency blocker without failing planning", async t => {
  const root = await tempWorkspace(t, "atree-missions-plan-workspace-write-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n");
  const reason = "--concurrency > 1 with --sandbox workspace-write requires --worktrees.";
  const stdout = captureStream();
  let spawned = false;

  const result = await runCli([
    "--plan",
    "--missions",
    ".abstraction-tree/missions",
    "--concurrency",
    "3"
  ], {
    cwd: root,
    stdout,
    stderr: captureStream(),
    spawnProcess() {
      spawned = true;
      throw new Error("should not spawn");
    }
  });
  const printedPlan = JSON.parse(stdout.text);
  const writtenPlan = JSON.parse(await readFile(path.join(result.runDir, "plan.json"), "utf8"));

  assert.equal(spawned, false);
  assert.equal(result.plan.executionBlockedReason, reason);
  assert.equal(printedPlan.executionBlockedReason, reason);
  assert.equal(writtenPlan.executionBlockedReason, reason);
});

test("workspace-write execution blocks concurrency without worktrees before spawning Codex", async t => {
  const root = await tempWorkspace(t, "atree-missions-run-workspace-write-blocked-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n");
  await writeFileAt(root, ".abstraction-tree/missions/mission-002.md", "# Two\n");
  const reason = "--concurrency > 1 with --sandbox workspace-write requires --worktrees.";
  const stderr = captureStream();
  let spawned = false;

  await assert.rejects(
    () => runCli([
      "--missions",
      ".abstraction-tree/missions",
      "--concurrency",
      "2",
      "--sandbox",
      "workspace-write"
    ], {
      cwd: root,
      stdout: captureStream(),
      stderr,
      spawnProcess() {
        spawned = true;
        throw new Error("should not spawn");
      }
    }),
    error => {
      assert.equal(error.message, reason);
      assert.equal(error.plan.executionBlockedReason, reason);
      assert.ok(error.runDir);
      return true;
    }
  );

  assert.equal(spawned, false);
  assert.match(stderr.text, /requires --worktrees/);
});

test("plan surfaces danger-full-access blocker without failing planning", async t => {
  const root = await tempWorkspace(t, "atree-missions-plan-danger-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n");
  const reason = "--sandbox danger-full-access requires --allow-danger-full-access.";
  const stdout = captureStream();

  const result = await runCli([
    "--plan",
    "--missions",
    ".abstraction-tree/missions",
    "--sandbox",
    "danger-full-access"
  ], {
    cwd: root,
    stdout,
    stderr: captureStream(),
    spawnProcess() {
      throw new Error("should not spawn");
    }
  });
  const printedPlan = JSON.parse(stdout.text);
  const writtenPlan = JSON.parse(await readFile(path.join(result.runDir, "plan.json"), "utf8"));

  assert.equal(result.plan.executionBlockedReason, reason);
  assert.equal(printedPlan.executionBlockedReason, reason);
  assert.equal(writtenPlan.executionBlockedReason, reason);
});

test("plan omits execution blocker for explicitly allowed danger-full-access", async t => {
  const root = await tempWorkspace(t, "atree-missions-plan-danger-allowed-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n");
  const stdout = captureStream();

  const result = await runCli([
    "--plan",
    "--missions",
    ".abstraction-tree/missions",
    "--sandbox",
    "danger-full-access",
    "--allow-danger-full-access"
  ], {
    cwd: root,
    stdout,
    stderr: captureStream(),
    spawnProcess() {
      throw new Error("should not spawn");
    }
  });
  const printedPlan = JSON.parse(stdout.text);
  const writtenPlan = JSON.parse(await readFile(path.join(result.runDir, "plan.json"), "utf8"));

  assert.equal(Object.hasOwn(result.plan, "executionBlockedReason"), false);
  assert.equal(Object.hasOwn(printedPlan, "executionBlockedReason"), false);
  assert.equal(Object.hasOwn(writtenPlan, "executionBlockedReason"), false);
});

test("default queue uses automation missions and skips completed runtime entries", async t => {
  const root = await tempWorkspace(t, "atree-missions-runtime-skip-");
  await writeFileAt(root, ".abstraction-tree/automation/missions/mission-001.md", "# One\n");
  await writeFileAt(root, ".abstraction-tree/automation/mission-runtime.json", `\uFEFF${JSON.stringify({
    completed: ["mission-001.md"],
    failed: [],
    current: "",
    stop_requested: false
  })}`);

  const result = await runCli(["--plan"], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  assert.equal(result.plan.missionCount, 0);
  assert.equal(result.plan.skipped[0].reason, "completed");
});

test("legacy basename runtime entries do not collide across duplicate basenames", async t => {
  const root = await tempWorkspace(t, "atree-missions-runtime-duplicate-basename-");
  await writeFileAt(root, ".abstraction-tree/automation/missions/security/mission-001.md", "# Security\n");
  await writeFileAt(root, ".abstraction-tree/automation/missions/ops/mission-001.md", "# Ops\n");
  await writeFileAt(root, ".abstraction-tree/automation/mission-runtime.json", JSON.stringify({
    completed: ["mission-001.md"],
    failed: [],
    current: "",
    stop_requested: false
  }));

  const result = await runCli(["--plan"], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });

  assert.equal(result.plan.missionCount, 2);
  assert.equal(result.plan.skipped.length, 0);
});

test("mission-folder-relative runtime entries skip only the intended duplicate basename", async t => {
  const root = await tempWorkspace(t, "atree-missions-runtime-relative-path-");
  await writeFileAt(root, ".abstraction-tree/automation/missions/security/mission-001.md", "# Security\n");
  await writeFileAt(root, ".abstraction-tree/automation/missions/ops/mission-001.md", "# Ops\n");
  await writeFileAt(root, ".abstraction-tree/automation/mission-runtime.json", JSON.stringify({
    completed: ["security/mission-001.md"],
    failed: [],
    current: "",
    stop_requested: false
  }));

  const result = await runCli(["--plan"], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });
  const pendingPaths = result.plan.batches.flatMap(batch => batch.missions.map(mission => mission.filePath));

  assert.equal(result.plan.missionCount, 1);
  assert.deepEqual(result.plan.skipped.map(mission => mission.filePath), [
    ".abstraction-tree/automation/missions/security/mission-001.md"
  ]);
  assert.deepEqual(pendingPaths, [
    ".abstraction-tree/automation/missions/ops/mission-001.md"
  ]);
});

test("runtime-only completion exits with an explicit no pending message", async t => {
  const root = await tempWorkspace(t, "atree-missions-no-pending-");
  await writeFileAt(root, ".abstraction-tree/automation/missions/mission-001.md", "# One\n");
  await writeFileAt(root, ".abstraction-tree/automation/mission-runtime.json", JSON.stringify({
    completed: ["mission-001.md"],
    failed: [],
    current: "",
    stop_requested: false
  }));
  const stdout = captureStream();

  await runCli([], {
    cwd: root,
    stdout,
    stderr: captureStream(),
    spawnProcess() {
      throw new Error("should not spawn");
    }
  });

  assert.match(stdout.text, /No pending missions/);
});

test("execution uses an injected Codex process and writes final output", async t => {
  const root = await tempWorkspace(t, "atree-missions-exec-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n\nDo one thing.\n");

  const result = await runCli([
    "--missions",
    ".abstraction-tree/missions",
    "--sandbox",
    "read-only",
    "--codex-bin",
    "fake-codex"
  ], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream(),
    spawnProcess: fakeCodexSpawn()
  });
  const finalText = await readFile(result.statuses[0].finalPath, "utf8");
  const jsonlText = await readFile(result.statuses[0].jsonlPath, "utf8");
  const batchStatus = JSON.parse(await readFile(path.join(result.runDir, "batch-001.status.json"), "utf8"));
  const batchMarkdown = await readFile(path.join(result.runDir, "batch-001.md"), "utf8");

  assert.equal(result.statuses[0].status, "success");
  assert.match(finalText, /fake complete/);
  assert.match(jsonlText, /agent_message/);
  assert.equal(batchStatus.batchIndex, 1);
  assert.deepEqual(batchStatus.missionIds, ["mission-001"]);
  assert.equal(batchStatus.parallelSafe, false);
  assert.equal(batchStatus.statuses[0].status, "success");
  assert.equal(batchStatus.statuses[0].exitCode, 0);
  assert.equal(batchStatus.statuses[0].finalPath, result.statuses[0].finalPath);
  assert.match(batchStatus.statuses[0].stderrPath, /mission-001[\\/]stderr\.log$/);
  assert.match(batchMarkdown, /# Batch 001/);
  assert.match(batchMarkdown, /mission-001/);
  assert.match(batchMarkdown, /stderr\.log/);

  const runtime = await readMissionRuntime(root);
  assert.deepEqual(runtime.completed, [".abstraction-tree/missions/mission-001.md"]);
});

test("workspace-write execution with worktrees creates a real git worktree", async t => {
  if (!(await gitAvailable())) {
    t.skip("git executable unavailable to Node child_process");
    return;
  }

  const root = await tempWorkspace(t, "atree-missions-worktree-");
  await runGit(root, ["init"]);
  await runGit(root, ["config", "user.email", "mission-runner@example.invalid"]);
  await runGit(root, ["config", "user.name", "Mission Runner Test"]);
  await writeFileAt(root, "README.md", "# Temp repo\n");
  await runGit(root, ["add", "README.md"]);
  await runGit(root, ["commit", "-m", "Initial commit"]);
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n\nDo one thing.\n");

  const spawns = [];
  const result = await runCli([
    "--missions",
    ".abstraction-tree/missions",
    "--worktrees",
    "--sandbox",
    "workspace-write",
    "--codex-bin",
    "fake-codex"
  ], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream(),
    spawnProcess: fakeCodexSpawn(call => spawns.push(call))
  });
  const status = result.statuses[0];
  const writtenStatus = JSON.parse(await readFile(status.statusPath, "utf8"));

  assert.equal(status.status, "success");
  assert.equal(status.usedWorktree, true);
  assert.equal(writtenStatus.usedWorktree, true);
  assert.ok(status.worktreePath);
  await access(status.worktreePath);
  assert.match(path.relative(root, status.worktreePath), /^\.abstraction-tree[\\/]worktrees[\\/]/);
  assert.equal(spawns.length, 1);
  assert.equal(path.resolve(spawns[0].options.cwd), path.resolve(status.worktreePath));
  assert.match(await readFile(path.join(status.worktreePath, "README.md"), "utf8"), /Temp repo/);
});

test("parallel-safe read-only execution writes one batch summary for the batch", async t => {
  const root = await tempWorkspace(t, "atree-missions-parallel-summary-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n\nDo one thing.\n");
  await writeFileAt(root, ".abstraction-tree/missions/mission-002.md", "# Two\n\nDo another thing.\n");

  const result = await runCli([
    "--missions",
    ".abstraction-tree/missions",
    "--sandbox",
    "read-only",
    "--concurrency",
    "2",
    "--codex-bin",
    "fake-codex"
  ], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream(),
    spawnProcess: fakeCodexSpawn()
  });
  const batchStatus = JSON.parse(await readFile(path.join(result.runDir, "batch-001.status.json"), "utf8"));
  const batchMarkdown = await readFile(path.join(result.runDir, "batch-001.md"), "utf8");

  assert.equal(result.statuses.length, 2);
  assert.deepEqual(batchStatus.missionIds, ["mission-001", "mission-002"]);
  assert.equal(batchStatus.parallelSafe, true);
  assert.deepEqual(batchStatus.statuses.map(status => status.status), ["success", "success"]);
  assert.deepEqual(batchStatus.statuses.map(status => status.exitCode), [0, 0]);
  assert.match(batchMarkdown, /mission-001/);
  assert.match(batchMarkdown, /mission-002/);
  assert.match(batchMarkdown, /final\.md/);
  assert.match(batchMarkdown, /stderr\.log/);
});

test("runtime updates record repo-relative paths for duplicate basenames", async t => {
  const root = await tempWorkspace(t, "atree-missions-runtime-write-paths-");
  await writeFileAt(root, ".abstraction-tree/automation/missions/security/mission-001.md", `---
id: security-001
---
# Security
`);
  await writeFileAt(root, ".abstraction-tree/automation/missions/ops/mission-001.md", `---
id: ops-001
---
# Ops
`);

  const result = await runCli([
    "--sandbox",
    "read-only",
    "--codex-bin",
    "fake-codex"
  ], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream(),
    spawnProcess: fakeCodexSpawn()
  });

  const runtime = await readMissionRuntime(root);

  assert.equal(result.statuses.length, 2);
  assert.deepEqual(runtime.completed, [
    ".abstraction-tree/automation/missions/ops/mission-001.md",
    ".abstraction-tree/automation/missions/security/mission-001.md"
  ]);
});

function planInput(missions, overrides = {}) {
  return {
    createdAt: new Date("2026-05-08T00:00:00.000Z"),
    repoRoot: "repo",
    missionsDir: "repo/.abstraction-tree/missions",
    missions,
    memory: overrides.memory ?? memoryWithNodes([]),
    sandbox: overrides.sandbox ?? "workspace-write",
    warnings: []
  };
}

function mission(id, overrides = {}) {
  return {
    id,
    title: id,
    filePath: `.abstraction-tree/missions/${id}.md`,
    absolutePath: `.abstraction-tree/missions/${id}.md`,
    priority: "P2",
    risk: "medium",
    affectedFiles: [],
    affectedNodes: [],
    dependsOn: [],
    originalMarkdown: `# ${id}\n`,
    body: `# ${id}\n`,
    ...overrides
  };
}

function memoryWithNodes(nodes) {
  return {
    tree: nodes,
    files: [],
    concepts: [],
    invariants: [],
    nodesById: new Map(nodes.map(node => [node.id, node])),
    fileOwners: new Map(),
    conceptTerms: new Map(),
    warnings: []
  };
}

async function tempWorkspace(t, prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFileAt(root, relativePath, text) {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
  return filePath;
}

async function gitAvailable() {
  try {
    await execFileAsync("git", ["--version"], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function runGit(cwd, args) {
  await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
}

function fakeCodexSpawn(onSpawn) {
  return (command, args, options) => {
    onSpawn?.({ command, args, options });
    const process = new EventEmitter();
    process.stdin = new PassThrough();
    process.stdout = new PassThrough();
    process.stderr = new PassThrough();

    let prompt = "";
    process.stdin.on("data", chunk => {
      prompt += chunk;
    });
    process.stdin.on("end", () => {
      const exitCode = prompt.includes("# Mission:") ? 0 : 2;
      if (exitCode === 0) {
        process.stdout.write(`${JSON.stringify({ type: "agent_message", message: "fake complete" })}\n`);
      } else {
        process.stderr.write("missing mission prompt\n");
      }
      process.stdout.end();
      process.stderr.end();
      queueMicrotask(() => process.emit("close", exitCode));
    });

    return process;
  };
}

function captureStream() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    }
  };
}
