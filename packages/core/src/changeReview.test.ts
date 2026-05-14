import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  buildChangeRecordReviewSummary,
  limitChangeRecordReviewReport,
  pruneGeneratedScanRecords,
  reviewChangeRecords
} from "./changeReview.js";

test("reviewChangeRecords marks older generated scans as consolidation candidates", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "semantic.1", "2026-05-04T10:30:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  await writeChange(root, "scan.3", "2026-05-04T12:00:00.000Z");

  const report = await reviewChangeRecords(root);

  assert.equal(report.totalChangeRecordCount, 4);
  assert.equal(report.generatedScanRecordCount, 3);
  assert.equal(report.semanticChangeRecordCount, 1);
  assert.equal(report.eligibleGeneratedScanRecordCount, 2);
  assert.equal(report.retainedGeneratedScanRecord?.id, "scan.3");
  assert.deepEqual(report.eligibleGeneratedScanRecords.map(record => record.id), ["scan.1", "scan.2"]);
  assert.ok(report.eligibleGeneratedScanRecords.every(record =>
    record.consolidationCandidateReason === "superseded-by-newer-scan"
  ));
});

test("buildChangeRecordReviewSummary returns compact deterministic counts", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "semantic.1", "2026-05-04T10:30:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  await writeFile(path.join(root, ".abstraction-tree", "changes", "bad.json"), "{ bad json\n", "utf8");

  const summary = buildChangeRecordReviewSummary(await reviewChangeRecords(root));

  assert.deepEqual(summary, {
    totalChangeRecordCount: 3,
    generatedScanRecordCount: 2,
    semanticChangeRecordCount: 1,
    eligibleGeneratedScanRecordCount: 1,
    retainedGeneratedScanRecordId: "scan.2",
    issueCount: 1
  });
});

test("limitChangeRecordReviewReport bounds generated scan details while preserving counts", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  await writeChange(root, "scan.3", "2026-05-04T12:00:00.000Z");
  await writeChange(root, "scan.4", "2026-05-04T13:00:00.000Z");

  const report = await reviewChangeRecords(root);
  const limited = limitChangeRecordReviewReport(report, 2);

  assert.equal(limited.generatedScanRecordCount, 4);
  assert.equal(limited.eligibleGeneratedScanRecordCount, 3);
  assert.equal(limited.eligibleGeneratedScanRecords.length, 2);
  assert.deepEqual(limited.eligibleGeneratedScanRecords.map(record => record.id), ["scan.1", "scan.2"]);
  assert.equal(report.eligibleGeneratedScanRecords.length, 3);
});

test("reviewChangeRecords reports malformed change files without mutating them", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeFile(path.join(root, ".abstraction-tree", "changes", "bad.json"), "{ bad json\n", "utf8");

  const report = await reviewChangeRecords(root);

  assert.equal(report.generatedScanRecordCount, 1);
  assert.equal(report.eligibleGeneratedScanRecordCount, 0);
  assert.ok(report.issues.some(issue =>
    issue.filePath === ".abstraction-tree/changes/bad.json" &&
    issue.message.includes("not valid JSON")
  ));
});

test("reviewChangeRecords preserves generated scans referenced by semantic records", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  await writeChange(root, "scan.3", "2026-05-04T12:00:00.000Z");
  await writeChange(root, "semantic.1", "2026-05-04T12:30:00.000Z", {
    filesChanged: [".abstraction-tree/changes/scan.1.json"]
  });

  const report = await reviewChangeRecords(root);

  assert.equal(report.retainedGeneratedScanRecord?.id, "scan.3");
  assert.deepEqual(report.eligibleGeneratedScanRecords.map(record => record.id), ["scan.2"]);
});

test("pruneGeneratedScanRecords dry-runs by default and keeps files", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");

  const result = await pruneGeneratedScanRecords(root);

  assert.equal(result.dryRun, true);
  assert.equal(result.deletedRecordCount, 0);
  assert.equal(result.eligibleGeneratedScanRecordCount, 1);
  assert.equal(result.retainedGeneratedScanRecordId, "scan.2");
  assert.ok(existsSync(path.join(root, ".abstraction-tree", "changes", "scan.1.json")));
});

test("pruneGeneratedScanRecords deletes only superseded generated scan records", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "semantic.1", "2026-05-04T10:30:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");

  const result = await pruneGeneratedScanRecords(root, { dryRun: false });

  assert.equal(result.deletedRecordCount, 1);
  assert.deepEqual(result.deletedRecordPaths, [".abstraction-tree/changes/scan.1.json"]);
  assert.equal(existsSync(path.join(root, ".abstraction-tree", "changes", "scan.1.json")), false);
  assert.equal(JSON.parse(await readFile(path.join(root, ".abstraction-tree", "changes", "scan.2.json"), "utf8")).id, "scan.2");
  assert.equal(JSON.parse(await readFile(path.join(root, ".abstraction-tree", "changes", "semantic.1.json"), "utf8")).id, "semantic.1");
});

test("pruneGeneratedScanRecords refuses to delete when change records have errors", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  await writeFile(path.join(root, ".abstraction-tree", "changes", "bad.json"), "{ bad json\n", "utf8");

  const result = await pruneGeneratedScanRecords(root, { dryRun: false });

  assert.equal(result.blockedByIssues, true);
  assert.equal(result.deletedRecordCount, 0);
  assert.ok(existsSync(path.join(root, ".abstraction-tree", "changes", "scan.1.json")));
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-change-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".abstraction-tree", "changes"), { recursive: true });
  return root;
}

async function writeChange(
  root: string,
  id: string,
  timestamp: string,
  overrides: Partial<{ filesChanged: string[] }> = {}
) {
  const change = {
    id,
    timestamp,
    title: id.startsWith("scan.") ? "Deterministic scan" : "Semantic change",
    reason: "Test change record.",
    affectedNodeIds: ["project.intent"],
    filesChanged: overrides.filesChanged ?? [".abstraction-tree/tree.json"],
    invariantsPreserved: ["invariant.tree-updated-after-change"],
    risk: "low"
  };
  await writeFile(
    path.join(root, ".abstraction-tree", "changes", `${id}.json`),
    `${JSON.stringify(change, null, 2)}\n`,
    "utf8"
  );
}
