import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAssessmentPack,
  requiredPackFiles,
  runCli
} from "./create-assessment-pack.mjs";

const fixedDate = new Date("2026-05-10T12:00:00.000Z");

test("createAssessmentPack creates a timestamped pack folder", async t => {
  const root = await tempWorkspace(t);
  await writeBaseMemory(root);

  const result = await createAssessmentPack({
    cwd: root,
    createdAt: fixedDate,
    runCommand: successfulCommand()
  });

  assert.equal(
    relativePath(root, result.packDir),
    ".abstraction-tree/assessment-packs/2026-05-10T12-00-00-000Z"
  );
  assert.equal((await stat(result.packDir)).isDirectory(), true);
});

test("createAssessmentPack writes all required files", async t => {
  const root = await tempWorkspace(t);
  await writeBaseMemory(root);
  await writeFileAt(root, ".abstraction-tree/evaluations/2026-05-10-evaluation.json", JSON.stringify({ score: 1 }));
  await writeFileAt(root, ".abstraction-tree/runs/2026-05-10-run.md", "# Run\n");
  await writeFileAt(root, ".abstraction-tree/lessons/2026-05-10-lesson.md", "# Lesson\n");
  await writeFileAt(root, ".abstraction-tree/automation/mission-runtime.json", JSON.stringify({
    completed: [],
    failed: [],
    current: "",
    stop_requested: false
  }));

  const result = await createAssessmentPack({
    cwd: root,
    createdAt: fixedDate,
    runCommand: successfulCommand()
  });

  for (const file of requiredPackFiles) {
    const filePath = path.join(result.packDir, file);
    assert.equal((await stat(filePath)).isFile(), true, file);
  }
});

test("assessment prompt states ChatGPT/human strategy and bounded Codex execution", async t => {
  const root = await tempWorkspace(t);
  await writeBaseMemory(root);

  const result = await createAssessmentPack({
    cwd: root,
    createdAt: fixedDate,
    runCommand: successfulCommand()
  });

  const prompt = await readFile(path.join(result.packDir, "assessment-prompt.md"), "utf8");

  assert.match(prompt, /ChatGPT-first or human-first strategy pass/);
  assert.match(prompt, /ChatGPT or a human reviewer owns strategic assessment/);
  assert.match(prompt, /Codex should execute bounded mission files/);
  assert.match(prompt, /Codex should not author the strategic assessment/);
});

test("missing optional source artifacts degrade gracefully", async t => {
  const root = await tempWorkspace(t);
  await writeBaseMemory(root);

  const result = await createAssessmentPack({
    cwd: root,
    createdAt: fixedDate,
    runCommand: failingContextCommand()
  });

  const latestEvaluation = JSON.parse(await readFile(path.join(result.packDir, "latest-evaluation.json"), "utf8"));
  const repoSummary = JSON.parse(await readFile(path.join(result.packDir, "repo-summary.json"), "utf8"));
  const latestRuns = await readFile(path.join(result.packDir, "latest-runs.md"), "utf8");
  const latestLessons = await readFile(path.join(result.packDir, "latest-lessons.md"), "utf8");
  const diffSummary = await readFile(path.join(result.packDir, "diff-summary.md"), "utf8");

  assert.equal(latestEvaluation.available, false);
  assert.equal(repoSummary.optionalArtifacts.missionRuntimeAvailable, false);
  assert.equal(repoSummary.optionalArtifacts.diffSummarySucceeded, false);
  assert.match(latestRuns, /No \.abstraction-tree\/runs\/\*\.md files were found\./);
  assert.match(latestLessons, /No \.abstraction-tree\/lessons\/\*\.md files were found\./);
  assert.match(diffSummary, /The diff summary command failed/);
});

test("runCli reports the generated prompt path", async t => {
  const root = await tempWorkspace(t);
  await writeBaseMemory(root);
  const stdout = captureStream();

  await runCli([], {
    cwd: root,
    now: fixedDate,
    stdout,
    command: successfulCommand()
  });

  assert.match(stdout.text, /Assessment pack created: \.abstraction-tree\/assessment-packs\/2026-05-10T12-00-00-000Z/);
  assert.match(stdout.text, /Assessment prompt: \.abstraction-tree\/assessment-packs\/2026-05-10T12-00-00-000Z\/assessment-prompt\.md/);
});

async function tempWorkspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), "atree-assessment-pack-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeBaseMemory(root) {
  await writeJsonAt(root, "package.json", {
    name: "fixture",
    version: "0.0.0"
  });
  await writeJsonAt(root, ".abstraction-tree/config.json", {
    version: "0.1.0",
    projectName: "fixture",
    sourceRoot: ".",
    treeBuilder: "deterministic",
    installMode: "core"
  });
  await writeJsonAt(root, ".abstraction-tree/tree.json", [
    {
      id: "project.intent",
      title: "Fixture",
      summary: "Top-level fixture project."
    },
    {
      id: "architecture.package.distribution",
      title: "Package Distribution",
      summary: "Package scripts and distribution."
    },
    {
      id: "module.scripts",
      title: "Scripts",
      summary: "Automation scripts."
    }
  ]);
  await writeJsonAt(root, ".abstraction-tree/files.json", [
    {
      path: "scripts/example.mjs",
      language: "JavaScript",
      ownedByNodeIds: ["module.scripts"]
    }
  ]);
  await writeJsonAt(root, ".abstraction-tree/concepts.json", [
    {
      id: "mission",
      title: "Mission",
      summary: "Mission workflow.",
      relatedFiles: ["scripts/example.mjs"],
      relatedNodeIds: ["module.scripts"]
    }
  ]);
}

async function writeJsonAt(root, relativePath, value) {
  await writeFileAt(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileAt(root, relativePath, text) {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
  return filePath;
}

function successfulCommand() {
  return async (file, args) => {
    if (file === "git" && args[0] === "status") {
      return { exitCode: 0, stdout: "## main\n", stderr: "" };
    }
    if (file === "git" && args[0] === "log") {
      return { exitCode: 0, stdout: "abcdef1 test commit\n", stderr: "" };
    }
    if (file === "node" && args[0] === "scripts/diff-summary.mjs") {
      return { exitCode: 0, stdout: "Base: abcdef1\nNo changed files.\n", stderr: "" };
    }
    if (file === "node" && args[0] === "packages/cli/dist/index.js") {
      return { exitCode: 0, stdout: "{\"generatedScanRecords\":0}\n", stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
}

function failingContextCommand() {
  return async (file, args) => {
    if (file === "git") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (file === "node" && args[0] === "scripts/diff-summary.mjs") {
      return { exitCode: 1, stdout: "", stderr: "diff failed" };
    }
    if (file === "node" && args[0] === "packages/cli/dist/index.js") {
      return { exitCode: 1, stdout: "", stderr: "change review failed" };
    }
    return { exitCode: 1, stdout: "", stderr: "failed" };
  };
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function captureStream() {
  return {
    text: "",
    write(chunk) {
      this.text += chunk;
    }
  };
}
