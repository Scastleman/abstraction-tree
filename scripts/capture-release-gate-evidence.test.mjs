import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCommandInvocation,
  buildGateCommands,
  captureReleaseGateEvidence,
  defaultEvidencePath,
  formatEvidenceTimestamp,
  normalizeEvidencePath,
  normalizePathSeparators,
  resolveNpmInvocation,
  runGateCommands
} from "./capture-release-gate-evidence.mjs";

test("buildGateCommands constructs the documented gate commands with candidate version", () => {
  const commands = buildGateCommands({ version: "1.0.0-rc.1", includeInstall: true });

  assert.equal(commands[0].display, "npm ci");
  assert.equal(commands[1].display, "npm run format:check");
  assert.equal(commands.at(-1).display, "npm run diff:summary");
  assert.ok(commands.some(command => command.display === "npm run release:dry-run -- --version 1.0.0-rc.1"));
  assert.deepEqual(
    commands.find(command => command.display.startsWith("npm run release:dry-run")).args,
    ["run", "release:dry-run", "--", "--version", "1.0.0-rc.1"]
  );
});

test("resolveNpmInvocation avoids npm.ps1 on Windows", () => {
  assert.deepEqual(resolveNpmInvocation({
    env: {},
    platform: "win32",
    execPath: "C:\\missing-node\\node.exe"
  }), {
    command: "npm.cmd",
    args: []
  });

  const invocation = buildCommandInvocation(
    { kind: "npm", display: "npm run lint", args: ["run", "lint"] },
    {
      env: { npm_execpath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" },
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      platform: "win32"
    }
  );
  assert.equal(invocation.command, "C:\\Program Files\\nodejs\\node.exe");
  assert.deepEqual(invocation.args, [
    "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    "run",
    "lint"
  ]);
});

test("formatEvidenceTimestamp emits stable ISO timestamps", () => {
  assert.equal(formatEvidenceTimestamp(new Date("2026-05-15T14:30:00.000Z")), "2026-05-15T14:30:00.000Z");
  assert.equal(
    normalizeEvidencePath("/repo", "/repo/docs/release-evidence/2026-05-15-current-gate.md"),
    "docs/release-evidence/2026-05-15-current-gate.md"
  );
  assert.equal(
    normalizePathSeparators("docs\\release-evidence\\current-gate.md"),
    "docs/release-evidence/current-gate.md"
  );
  assert.equal(
    normalizeEvidencePath("/repo", defaultEvidencePath("/repo", new Date("2026-05-15T01:02:03.000Z"))),
    "docs/release-evidence/2026-05-15-current-gate.md"
  );
});

test("runGateCommands records failures and continues by default", async () => {
  const commands = [
    { display: "first", kind: "npm", args: ["run", "first"] },
    { display: "second", kind: "npm", args: ["run", "second"] },
    { display: "third", kind: "npm", args: ["run", "third"] }
  ];
  const seen = [];

  const results = await runGateCommands(commands, {
    runner: async spec => {
      seen.push(spec.display);
      return {
        command: spec.display,
        cwd: "/repo",
        startTime: "2026-05-15T00:00:00.000Z",
        endTime: "2026-05-15T00:00:01.000Z",
        exitCode: spec.display === "second" ? 1 : 0,
        stdout: "",
        stderr: ""
      };
    }
  });

  assert.deepEqual(seen, ["first", "second", "third"]);
  assert.deepEqual(results.map(result => result.exitCode), [0, 1, 0]);
});

test("captureReleaseGateEvidence writes failed-command evidence without masking status", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atree-release-gate-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ version: "0.2.0-test.1" }), "utf8");

  const outputPath = path.join(root, "docs", "release-evidence", "fixture.md");
  const result = await captureReleaseGateEvidence({
    root,
    outputPath,
    version: "0.2.0-test.1",
    now: new Date("2026-05-15T00:00:00.000Z"),
    commandSpecs: [
      { display: "npm run lint", kind: "npm", args: ["run", "lint"] },
      { display: "npm run build", kind: "npm", args: ["run", "build"] }
    ],
    runner: async spec => ({
      command: spec.display,
      cwd: root,
      startTime: "2026-05-15T00:00:00.000Z",
      endTime: "2026-05-15T00:00:01.000Z",
      exitCode: spec.display === "npm run lint" ? 1 : 0,
      stdout: spec.display,
      stderr: spec.display === "npm run lint" ? "lint failed" : ""
    })
  });

  assert.equal(result.status, "fail");
  const evidence = await readFile(outputPath, "utf8");
  assert.match(evidence, /Result: fail/);
  assert.match(evidence, /\| `npm run lint` \| Fail \| 1 \|/);
  assert.match(evidence, /lint failed/);
  assert.match(evidence, /maintainer signoff is still required/);
});
