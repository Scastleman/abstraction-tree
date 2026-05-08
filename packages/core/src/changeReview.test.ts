import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { reviewChangeRecords } from "./changeReview.js";

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

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-change-review-"));
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
