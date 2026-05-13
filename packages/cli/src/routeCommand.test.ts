import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  atreePath,
  ensureWorkspace,
  writeJson,
  type Concept,
  type FileSummary,
  type TreeNode
} from "@abstraction-tree/core";
import { runGoalCommand } from "./goalCommand.js";
import { runRouteCommand } from "./routeCommand.js";

test("route command prints readable routing from a prompt file", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writePrompt(root, "prompt.md", "Add subscription billing with Stripe checkout, webhooks, tests, and docs.");
  const capture = captureIo();

  const exitCode = await runRouteCommand({
    projectRoot: root,
    file: "prompt.md",
    explain: true
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout[0] ?? "", /Routing decision: goal-driven/);
  assert.match(capture.stdout[0] ?? "", /Recommended command:\nnpm run atree:goal -- --file prompt\.md --review-required/);
  assert.match(capture.stdout[0] ?? "", /Estimated affected layers:/);
});

test("route command supports JSON output from prompt text", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  const capture = captureIo();

  const exitCode = await runRouteCommand({
    projectRoot: root,
    text: "Assess the whole repo and make a roadmap of improvements.",
    json: true
  }, capture.io);
  const output = JSON.parse(capture.stdout[0] ?? "") as {
    decision: string;
    estimated_complexity: string;
    recommended_command: string;
  };

  assert.equal(exitCode, 0);
  assert.equal(output.decision, "assessment-pack");
  assert.equal(output.recommended_command, "npm run assessment:pack");
  assert.ok(output.estimated_complexity);
});

test("route command rejects ambiguous input sources", async t => {
  const root = await workspace(t);
  const capture = captureIo();

  const exitCode = await runRouteCommand({
    projectRoot: root,
    file: "prompt.md",
    text: "Fix README."
  }, capture.io);

  assert.equal(exitCode, 1);
  assert.match(capture.stderr[0] ?? "", /Use either --file or --text/);
});

test("goal auto-route stops direct prompts unless forced", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writePrompt(root, "prompt.md", "Fix the typo in README.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompt.md",
    autoRoute: true,
    createdAt: new Date(2026, 4, 13, 11, 30)
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout.join(""), /Routing decision: direct/);
  await assert.rejects(() => readFile(path.join(root, ".abstraction-tree", "goals", "2026-05-13-1130-prompt", "goal.md"), "utf8"));
});

test("goal auto-route continues goal-driven prompts", async t => {
  const root = await workspace(t);
  await writeFixtureMemory(root);
  await writePrompt(root, "prompt.md", "Add subscription billing with Stripe checkout, webhooks, tests, and docs.");
  const capture = captureIo();

  const exitCode = await runGoalCommand({
    projectRoot: root,
    file: "prompt.md",
    autoRoute: true,
    reviewRequired: true,
    createdAt: new Date(2026, 4, 13, 11, 35)
  }, capture.io);

  assert.equal(exitCode, 0);
  assert.match(capture.stdout.join(""), /Prompt router decision: goal-driven/);
  assert.equal(await readFile(path.join(root, ".abstraction-tree", "goals", "2026-05-13-1135-prompt", "goal.md"), "utf8"), "Add subscription billing with Stripe checkout, webhooks, tests, and docs.");
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-route-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await ensureWorkspace(root, { installMode: "core", projectName: "Route Command Project" });
  return root;
}

async function writePrompt(root: string, promptPath: string, promptText: string): Promise<void> {
  const absolutePath = path.join(root, promptPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, promptText, "utf8");
}

async function writeFixtureMemory(root: string): Promise<void> {
  await writeJson(atreePath(root, "tree.json"), fixtureNodes());
  await writeJson(atreePath(root, "files.json"), fixtureFiles());
  await writeJson(atreePath(root, "concepts.json"), fixtureConcepts());
  await writeJson(atreePath(root, "invariants.json"), []);
}

function fixtureNodes(): TreeNode[] {
  return [
    node("project.intent", "Project intent", "project", "Project purpose and safe prompt routing.", ["README.md"]),
    node("architecture.billing", "Billing architecture", "architecture", "Subscription billing, Stripe checkout, webhooks, docs, and tests.", [
      "src/billing/subscriptions.ts",
      "src/billing/webhooks.ts",
      "docs/billing.md",
      "tests/billing.test.ts"
    ])
  ];
}

function fixtureFiles(): FileSummary[] {
  return [
    file("README.md", "Project README docs.", false),
    file("src/billing/subscriptions.ts", "Subscription billing plans.", false, ["createSubscription"]),
    file("src/billing/webhooks.ts", "Stripe webhook handling.", false, ["handleWebhook"]),
    file("docs/billing.md", "Billing documentation.", false),
    file("tests/billing.test.ts", "Billing tests.", true)
  ];
}

function fixtureConcepts(): Concept[] {
  return [{
    id: "billing",
    title: "Billing",
    summary: "Subscription billing and Stripe checkout.",
    relatedNodeIds: ["architecture.billing"],
    relatedFiles: ["src/billing/subscriptions.ts", "src/billing/webhooks.ts", "docs/billing.md"],
    tags: ["billing", "stripe", "checkout"],
    evidence: []
  }];
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

function file(filePath: string, summary: string, isTest: boolean, symbols: string[] = []): FileSummary {
  return {
    path: filePath,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    language: filePath.endsWith(".md") ? "Markdown" : "TypeScript",
    sizeBytes: 10,
    lines: 1,
    imports: [],
    exports: symbols,
    symbols,
    isTest,
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
