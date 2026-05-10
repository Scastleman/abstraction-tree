import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  atreePath,
  buildDeterministicTree,
  buildImportGraph,
  ensureWorkspace,
  scanProject,
  writeJson,
  type AutomationValidationOptions
} from "@abstraction-tree/core";
import { doctorExitCode, runDoctor } from "./doctor.js";

const doctorOptions = {
  nodeVersion: "20.19.0",
  findVisualAppDist: () => undefined,
  runGit: cleanRuntimeBoundaryGit
} satisfies Parameters<typeof runDoctor>[1];

test("doctor reports an empty project as uninitialized", async t => {
  const root = await workspace(t);

  const report = await runDoctor(root, doctorOptions);

  assert.equal(report.status, "error");
  assert.equal(checkStatus(report, "config"), "error");
  assert.deepEqual(report.nextSteps, ["atree init"]);
});

test("doctor guides an initialized project without a scan to run scan", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { projectName: "No Scan" });
  await writeHealthyAutomationFiles(root);

  const report = await runDoctor(root, doctorOptions);

  assert.equal(report.status, "warning");
  assert.equal(checkStatus(report, "memory-files"), "warning");
  assert.deepEqual(report.nextSteps, ["atree scan"]);
});

test("doctor reports valid memory as ok", async t => {
  const root = await workspace(t);
  await writeFile(path.join(root, "index.ts"), "export const answer = 42;\n", "utf8");
  await writeDeterministicMemory(root);
  await writeHealthyAutomationFiles(root);

  const report = await runDoctor(root, doctorOptions);

  assert.equal(report.status, "ok");
  assert.equal(report.counts.files, 1);
  assert.ok(report.counts.nodes > 0);
  assert.equal(checkStatus(report, "validation"), "ok");
  assert.equal(checkStatus(report, "automation"), "ok");
});

test("doctor resolves visual app checks from the project root", async t => {
  const root = await workspace(t);
  await writeFile(path.join(root, "index.ts"), "export const answer = 42;\n", "utf8");
  await writeDeterministicMemory(root);
  await writeHealthyAutomationFiles(root);

  let checkedRoot = "";
  await runDoctor(root, {
    ...doctorOptions,
    findVisualAppDist: projectRoot => {
      checkedRoot = projectRoot;
      return undefined;
    }
  });

  assert.equal(checkedRoot, root);
});

test("doctor surfaces runtime schema issues from memory loading", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { projectName: "Bad Memory" });
  await writeHealthyAutomationFiles(root);
  await writeJson(atreePath(root, "files.json"), []);
  await writeFile(atreePath(root, "tree.json"), "{}\n", "utf8");
  await writeJson(atreePath(root, "ontology.json"), []);
  await writeJson(atreePath(root, "concepts.json"), []);
  await writeJson(atreePath(root, "invariants.json"), []);

  const report = await runDoctor(root, doctorOptions);

  assert.equal(report.status, "error");
  assert.equal(checkStatus(report, "runtime-schema"), "error");
  assert.ok(report.checks.find(check => check.id === "runtime-schema")?.issues?.some(issue => issue.filePath === ".abstraction-tree/tree.json"));
});

test("doctor strict mode treats warnings as failures", async t => {
  const root = await workspace(t);
  await ensureWorkspace(root, { projectName: "Strict Fixture" });
  await writeHealthyAutomationFiles(root);

  const report = await runDoctor(root, doctorOptions);

  assert.equal(report.status, "warning");
  assert.equal(doctorExitCode(report, false), 0);
  assert.equal(doctorExitCode(report, true), 1);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-doctor-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeDeterministicMemory(projectRoot: string) {
  await ensureWorkspace(projectRoot, { projectName: "Doctor Fixture" });
  const scan = await scanProject(projectRoot);
  const importGraph = await buildImportGraph(projectRoot, scan.files);
  const built = buildDeterministicTree("Doctor Fixture", scan.files, { importGraph });
  await writeJson(atreePath(projectRoot, "files.json"), built.files);
  await writeJson(atreePath(projectRoot, "import-graph.json"), importGraph);
  await writeJson(atreePath(projectRoot, "ontology.json"), built.ontology);
  await writeJson(atreePath(projectRoot, "tree.json"), built.nodes);
  await writeJson(atreePath(projectRoot, "concepts.json"), built.concepts);
  await writeJson(atreePath(projectRoot, "invariants.json"), built.invariants);
}

async function writeHealthyAutomationFiles(projectRoot: string) {
  await writeJson(atreePath(projectRoot, "automation", "loop-config.json"), {
    max_loops_today: 1,
    max_stagnation: 1,
    max_failed_loops: 1,
    max_minutes_today: 10,
    max_diff_lines: 200,
    commit_each_successful_loop: false,
    revert_failed_experiments: false,
    stop_if_tests_fail_twice: true,
    stop_if_diff_too_large: true
  });
  await writeJson(atreePath(projectRoot, "automation", "loop-runtime.example.json"), {
    loops_today: 0,
    failed_loops_today: 0,
    stagnation_count: 0,
    consecutive_test_failures: 0,
    last_result: "",
    last_run_date: "",
    stop_requested: false
  });
  await writeJson(atreePath(projectRoot, "automation", "mission-runtime.example.json"), {
    completed: [],
    failed: [],
    current: "",
    stop_requested: false
  });
}

async function cleanRuntimeBoundaryGit(args: string[]): Promise<Awaited<ReturnType<NonNullable<AutomationValidationOptions["runGit"]>>>> {
  if (args[0] === "ls-files") throw new Error("not tracked");
  return { stdout: "" };
}

function checkStatus(report: Awaited<ReturnType<typeof runDoctor>>, id: string): string | undefined {
  return report.checks.find(check => check.id === id)?.status;
}
