import assert from "node:assert/strict";
import test from "node:test";
import { buildDiffChangesFromGitOutput, buildDiffSummary } from "./diffSummary.js";

test("buildDiffSummary accepts a safe small diff", () => {
  const changes = buildDiffChangesFromGitOutput({
    numstat: [
      "36\t4\tpackages/core/src/diffSummary.ts",
      "18\t0\tpackages/core/src/diffSummary.test.ts"
    ].join("\n"),
    nameStatus: [
      "M\tpackages/core/src/diffSummary.ts",
      "A\tpackages/core/src/diffSummary.test.ts"
    ].join("\n")
  });

  const summary = buildDiffSummary(changes, { maxDiffLines: 100, maxFiles: 5 });

  assert.equal(summary.changedFileCount, 2);
  assert.equal(summary.addedLines, 54);
  assert.equal(summary.deletedLines, 4);
  assert.equal(summary.changedSourceFiles, 1);
  assert.equal(summary.changedTestFiles, 1);
  assert.deepEqual(summary.dangerousFileChanges, []);
  assert.deepEqual(summary.overreach, []);
});

test("buildDiffSummary flags broad overreach", () => {
  const summary = buildDiffSummary([
    { path: "packages/core/src/scanner.ts", addedLines: 90, deletedLines: 40 },
    { path: "packages/app/src/App.tsx", addedLines: 80, deletedLines: 20 },
    { path: "docs/AGENT_PROTOCOL.md", addedLines: 10, deletedLines: 2 },
    { path: "scripts/run-abstraction-loop.ps1", addedLines: 12, deletedLines: 4 },
    { path: "package.json", addedLines: 2, deletedLines: 1 }
  ], { maxDiffLines: 120, maxFiles: 3, broadAreaCount: 4 });

  assert.equal(summary.changedFileCount, 5);
  assert.equal(summary.changedLines, 261);
  assert.ok(summary.overreach.some(signal => signal.kind === "file-count"));
  assert.ok(summary.overreach.some(signal => signal.kind === "line-count"));
  assert.ok(summary.overreach.some(signal => signal.kind === "broad-areas"));
  assert.ok(summary.overreach.some(signal => signal.kind === "source-app-docs-automation"));
});

test("buildDiffSummary detects dangerous file changes", () => {
  const summary = buildDiffSummary([
    { path: ".env", addedLines: 1, deletedLines: 0 },
    { path: "secrets/prod-token.txt", addedLines: 1, deletedLines: 0 },
    { path: "package-lock.json", addedLines: 20, deletedLines: 20 },
    { path: ".github/workflows/build.yml", addedLines: 4, deletedLines: 1 },
    { path: ".npmrc", addedLines: 1, deletedLines: 0 }
  ]);

  assertDanger(summary, ".env", "environment file");
  assertDanger(summary, "secrets/prod-token.txt", "secret-like path");
  assertDanger(summary, "package-lock.json", "lockfile");
  assertDanger(summary, ".github/workflows/build.yml", "github workflow");
  assertDanger(summary, ".npmrc", "package manager config");
});

test("buildDiffSummary detects generated memory files", () => {
  const changes = buildDiffChangesFromGitOutput({
    numstat: "3\t0\t.abstraction-tree/files.json",
    nameStatus: "M\t.abstraction-tree/files.json",
    untrackedFiles: [
      ".abstraction-tree/runs/2026-05-04-1549-agent-run.md",
      ".abstraction-tree/changes/scan.1777909000000.json"
    ].join("\n"),
    untrackedLineCounts: {
      ".abstraction-tree/runs/2026-05-04-1549-agent-run.md": 38,
      ".abstraction-tree/changes/scan.1777909000000.json": 14
    }
  });

  const summary = buildDiffSummary(changes);

  assert.equal(summary.changedMemoryFiles, 3);
  assert.equal(summary.changedGeneratedMemoryFiles, 3);
  assert.equal(summary.files.find(file => file.path.endsWith("agent-run.md"))?.addedLines, 38);
  assert.ok(summary.overreach.some(signal => signal.kind === "generated-only-change"));
});

test("buildDiffSummary reports review-specific overreach categories", () => {
  const docsSummary = buildDiffSummary([
    { path: "docs/SCOPE_CONTRACTS.md", addedLines: 5, deletedLines: 1 }
  ]);
  assert.ok(docsSummary.overreach.some(signal => signal.kind === "docs-only-change"));

  const implementationSummary = buildDiffSummary([
    { path: "packages/core/src/scope.ts", addedLines: 20, deletedLines: 4 },
    { path: "packages/cli/src/scopeCommand.ts", addedLines: 8, deletedLines: 2 },
    { path: "package.json", addedLines: 1, deletedLines: 0 }
  ]);

  assert.ok(implementationSummary.overreach.some(signal => signal.kind === "package-metadata-change"));
  assert.ok(implementationSummary.overreach.some(signal => signal.kind === "implementation-without-test"));
  assert.ok(implementationSummary.overreach.some(signal => signal.kind === "source-changed-memory-not-refreshed"));
  assert.ok(implementationSummary.overreach.some(signal => signal.kind === "cross-subsystem-change"));

  const fullStackSummary = buildDiffSummary([
    { path: "backend/middleware/authMiddleware.js", addedLines: 10, deletedLines: 1 },
    { path: "backend/routes/goalRoutes.js", addedLines: 8, deletedLines: 2 },
    { path: "frontend/src/pages/Dashboard.jsx", addedLines: 15, deletedLines: 3 }
  ]);
  const fullStackSignal = fullStackSummary.overreach.find(signal => signal.kind === "cross-subsystem-change");
  assert.ok(fullStackSignal);
  assert.match(fullStackSignal.message, /backend, frontend/);
});

function assertDanger(summary: ReturnType<typeof buildDiffSummary>, filePath: string, reason: string) {
  const change = summary.dangerousFileChanges.find(item => item.path === filePath);
  assert.ok(change, `expected ${filePath} to be dangerous`);
  assert.ok(change.reasons.includes(reason), `expected ${filePath} to include ${reason}`);
}
