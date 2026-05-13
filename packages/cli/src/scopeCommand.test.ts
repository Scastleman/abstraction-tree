import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  atreePath,
  ensureWorkspace,
  writeJson,
  type FileSummary,
  type TreeNode
} from "@abstraction-tree/core";
import { latestScopeSummary, runScopeCheckCommand, runScopeCreateCommand } from "./scopeCommand.js";

test("scope command writes a prompt scope contract", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  const capture = captureIo();

  const exitCode = await runScopeCreateCommand({
    projectRoot: root,
    prompt: "make the tree UI collapsible",
    json: true
  }, capture.io);
  const output = JSON.parse(capture.stdout[0] ?? "") as {
    contract: { affectedNodeIds: string[]; allowedFiles: string[] };
    jsonPath: string;
    markdownPath: string;
  };

  assert.equal(exitCode, 0);
  assert.deepEqual(capture.stderr, []);
  assert.match(output.jsonPath, /\.abstraction-tree\/scopes\/.+-scope\.json/);
  assert.match(output.markdownPath, /\.abstraction-tree\/scopes\/.+-scope\.md/);
  assert.ok(output.contract.affectedNodeIds.includes("architecture.visual.app"));
  assert.ok(output.contract.allowedFiles.includes("packages/app/src/components/TreeList.tsx"));
  assert.ok(await latestScopeSummary(root));
});

test("scope check blocks out-of-contract files with injected Git input", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await runScopeCreateCommand({
    projectRoot: root,
    prompt: "make the tree UI collapsible",
    json: true
  }, captureIo().io);
  const capture = captureIo();

  const exitCode = await runScopeCheckCommand({
    projectRoot: root,
    scope: "latest",
    json: true
  }, async () => ({
    numstat: [
      "10\t2\tpackages/app/src/components/TreeList.tsx",
      "4\t1\tpackages/core/src/scanner.ts"
    ].join("\n"),
    nameStatus: [
      "M\tpackages/app/src/components/TreeList.tsx",
      "M\tpackages/core/src/scanner.ts"
    ].join("\n")
  }), capture.io);
  const output = JSON.parse(capture.stdout[0] ?? "") as {
    report: { status: string; violations: Array<{ filePath?: string }> };
    jsonPath: string;
  };

  assert.equal(exitCode, 1);
  assert.equal(output.report.status, "blocked");
  assert.ok(output.report.violations.some(violation => violation.filePath === "packages/core/src/scanner.ts"));
  assert.match(output.jsonPath, /\.abstraction-tree\/scopes\/.+-scope-check\.json/);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-scope-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await ensureWorkspace(root, { installMode: "full", projectName: "Scope Command Project" });
  return root;
}

async function writeFixtureMemory(root: string): Promise<void> {
  await writeJson(atreePath(root, "tree.json"), fixtureNodes());
  await writeJson(atreePath(root, "files.json"), fixtureFiles());
  await writeJson(atreePath(root, "concepts.json"), []);
}

function fixtureNodes(): TreeNode[] {
  return [
    node("project.intent", "Project intent", "project-purpose", "Overall project purpose.", []),
    node("architecture.visual.app", "Visual app", "architecture", "React visual app tree explorer.", [
      "packages/app/src/components/TreeList.tsx",
      "packages/app/src/styles.css"
    ])
  ];
}

function fixtureFiles(): FileSummary[] {
  return [
    file("packages/app/src/components/TreeList.tsx", "TreeList renders tree navigation nodes."),
    file("packages/app/src/styles.css", "App styles."),
    file("packages/app/src/app.test.tsx", "App tests."),
    file("packages/core/src/scanner.ts", "Core scanner.")
  ];
}

function node(id: string, title: string, level: string, summary: string, ownedFiles: string[]): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: level,
    level,
    summary,
    children: [],
    sourceFiles: ownedFiles,
    ownedFiles,
    responsibilities: [summary],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: {
      allowedToChange: ownedFiles,
      mustNotChange: []
    },
    confidence: 0.8
  };
}

function file(filePath: string, summary: string): FileSummary {
  return {
    path: filePath,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    language: filePath.endsWith(".css") ? "CSS" : "TypeScript",
    sizeBytes: 10,
    lines: 1,
    imports: [],
    exports: [],
    symbols: [],
    isTest: filePath.includes(".test."),
    summary,
    ownedByNodeIds: []
  };
}

function captureIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text)
    }
  };
}
