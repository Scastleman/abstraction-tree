import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { runChangeReviewCommand } from "./changeReviewCommand.js";

test("changes review --limit bounds CLI output while preserving counts", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "semantic.1", "2026-05-04T10:30:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  await writeChange(root, "scan.3", "2026-05-04T12:00:00.000Z");
  await writeChange(root, "scan.4", "2026-05-04T13:00:00.000Z");

  const capture = captureIo();
  const exitCode = await runChangeReviewCommand({ projectRoot: root, limit: "2" }, capture.io);
  const report = JSON.parse(capture.stdout[0] ?? "") as {
    generatedScanRecordCount: number;
    semanticChangeRecordCount: number;
    eligibleGeneratedScanRecordCount: number;
    retainedGeneratedScanRecord?: { id?: string };
    eligibleGeneratedScanRecords: Array<{ id: string }>;
  };

  assert.equal(exitCode, 0);
  assert.deepEqual(capture.stderr, []);
  assert.equal(report.generatedScanRecordCount, 4);
  assert.equal(report.semanticChangeRecordCount, 1);
  assert.equal(report.eligibleGeneratedScanRecordCount, 3);
  assert.equal(report.retainedGeneratedScanRecord?.id, "scan.4");
  assert.deepEqual(report.eligibleGeneratedScanRecords.map(record => record.id), ["scan.1", "scan.2"]);
});

test("changes review rejects invalid --limit input", async t => {
  const root = await workspace(t);
  const capture = captureIo();

  const exitCode = await runChangeReviewCommand({ projectRoot: root, limit: "0" }, capture.io);

  assert.equal(exitCode, 1);
  assert.deepEqual(capture.stdout, []);
  assert.deepEqual(capture.stderr, ["Change review limit must be a positive integer."]);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-change-review-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".abstraction-tree", "changes"), { recursive: true });
  return root;
}

async function writeChange(root: string, id: string, timestamp: string) {
  const change = {
    id,
    timestamp,
    title: id.startsWith("scan.") ? "Deterministic scan" : "Semantic change",
    reason: "Test change record.",
    affectedNodeIds: ["project.intent"],
    filesChanged: [".abstraction-tree/tree.json"],
    invariantsPreserved: ["invariant.tree-updated-after-change"],
    risk: "low"
  };
  await writeFile(
    path.join(root, ".abstraction-tree", "changes", `${id}.json`),
    `${JSON.stringify(change, null, 2)}\n`,
    "utf8"
  );
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
