import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createMissionPlan,
  discoverMissions,
  parseSimpleFrontmatter,
  readAbstractionMemory,
  readMissionRuntime,
  readMissionFile,
  runCli
} from "./run-missions.mjs";

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

test("execution uses a fake Codex binary and writes final output", async t => {
  const root = await tempWorkspace(t, "atree-missions-exec-");
  await writeFileAt(root, ".abstraction-tree/missions/mission-001.md", "# One\n\nDo one thing.\n");
  const fakeCodex = await writeFakeCodex(root);

  const result = await runCli([
    "--missions",
    ".abstraction-tree/missions",
    "--sandbox",
    "read-only",
    "--codex-bin",
    fakeCodex
  ], {
    cwd: root,
    stdout: captureStream(),
    stderr: captureStream()
  });
  const finalText = await readFile(result.statuses[0].finalPath, "utf8");
  const jsonlText = await readFile(result.statuses[0].jsonlPath, "utf8");

  assert.equal(result.statuses[0].status, "success");
  assert.match(finalText, /fake complete/);
  assert.match(jsonlText, /agent_message/);

  const runtime = await readMissionRuntime(root);
  assert.deepEqual(runtime.completed, ["mission-001.md"]);
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

async function writeFakeCodex(root) {
  const script = await writeFileAt(root, "fake-codex.mjs", `
let input = "";
process.stdin.on("data", chunk => {
  input += chunk;
});
process.stdin.on("end", () => {
  if (!input.includes("# Mission:")) process.exit(2);
  console.log(JSON.stringify({ type: "agent_message", message: "fake complete" }));
});
`);
  if (process.platform === "win32") {
    return writeFileAt(root, "fake-codex.cmd", `@echo off\r\nnode "%~dp0fake-codex.mjs" %*\r\n`);
  }
  await chmod(script, 0o755);
  return script;
}

function captureStream() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    }
  };
}
