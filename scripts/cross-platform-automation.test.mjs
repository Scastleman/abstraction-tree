import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runDiffSummary } from "./diff-summary.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("root npm scripts keep PowerShell commands explicitly Windows-scoped", async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const scripts = packageJson.scripts ?? {};
  const windowsScopedScripts = Object.entries(scripts)
    .filter(([, command]) => /\b(?:powershell|pwsh)\b|\.ps1\b/i.test(command))
    .map(([name]) => name)
    .sort();

  assert.deepEqual(windowsScopedScripts, [
    "abstraction:loop:visible:windows",
    "abstraction:loop:windows",
    "codex:missions:windows",
    "diff:summary:windows"
  ]);
  assert.equal(scripts["diff:summary"], "node scripts/diff-summary.mjs");
  assert.doesNotMatch(scripts.build, /\b(?:powershell|pwsh)\b|\.ps1\b/i);
  assert.doesNotMatch(scripts.test, /\b(?:powershell|pwsh)\b|\.ps1\b/i);
  assert.doesNotMatch(scripts["atree:validate"], /\b(?:powershell|pwsh)\b|\.ps1\b/i);
});

test("diff-summary Node wrapper reads fixture input without PowerShell", async t => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "atree-diff-summary-"));
  t.after(() => rm(tempRoot, { recursive: true, force: true }));

  const inputPath = path.join(tempRoot, "diff-input.json");
  await writeFile(
    inputPath,
    `${JSON.stringify({
      base: "abc123 Cross-platform automation smoke",
      numstat: [
        "5\t1\tscripts/diff-summary.mjs",
        "2\t0\tdocs/AGENT_PROTOCOL.md"
      ].join("\n"),
      nameStatus: [
        "M\tscripts/diff-summary.mjs",
        "M\tdocs/AGENT_PROTOCOL.md"
      ].join("\n"),
      untrackedFiles: "",
      untrackedLineCounts: {},
      config: {
        max_diff_lines: 20
      }
    })}\n`,
    "utf8"
  );

  const result = await runDiffSummary(["--input-json", inputPath, "--json"]);
  assert.equal(result.exitCode, 0, result.error);
  const summary = JSON.parse(result.output);

  assert.equal(summary.base, "abc123 Cross-platform automation smoke");
  assert.equal(summary.changedFileCount, 2);
  assert.equal(summary.addedLines, 7);
  assert.equal(summary.deletedLines, 1);
  assert.equal(summary.thresholds.maxDiffLines, 20);
  assert.deepEqual(summary.overreach, []);
});

test("PowerShell automation invokes npm through npm.cmd on Windows", async () => {
  for (const scriptName of ["run-abstraction-loop.ps1", "run-codex-missions.ps1"]) {
    const script = await readFile(path.join(repoRoot, "scripts", scriptName), "utf8");
    assert.match(script, /npm\.cmd/);
    assert.doesNotMatch(script, /Invoke-CheckedCommand\s+"npm"\b/);
  }
});
