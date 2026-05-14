import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { runChangePruneGeneratedCommand } from "./changeReviewCommand.js";

test("changes prune-generated dry-runs unless --apply is provided", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  const output: string[] = [];
  const errors: string[] = [];

  const code = await runChangePruneGeneratedCommand(
    { projectRoot: root },
    { stdout: text => output.push(text), stderr: text => errors.push(text) }
  );

  assert.equal(code, 0);
  assert.match(output.join("\n"), /"dryRun": true/);
  assert.match(errors.join("\n"), /Dry run only/);
  assert.equal(existsSync(path.join(root, ".abstraction-tree", "changes", "scan.1.json")), true);
});

test("changes prune-generated --apply deletes superseded generated scan records", async t => {
  const root = await workspace(t);
  await writeChange(root, "scan.1", "2026-05-04T10:00:00.000Z");
  await writeChange(root, "scan.2", "2026-05-04T11:00:00.000Z");
  const output: string[] = [];

  const code = await runChangePruneGeneratedCommand(
    { projectRoot: root, apply: true },
    { stdout: text => output.push(text), stderr: () => undefined }
  );

  assert.equal(code, 0);
  assert.match(output.join("\n"), /"deletedRecordCount": 1/);
  assert.equal(existsSync(path.join(root, ".abstraction-tree", "changes", "scan.1.json")), false);
  assert.equal(existsSync(path.join(root, ".abstraction-tree", "changes", "scan.2.json")), true);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-cli-change-prune-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".abstraction-tree", "changes"), { recursive: true });
  return root;
}

async function writeChange(root: string, id: string, timestamp: string): Promise<void> {
  const change = {
    id,
    timestamp,
    title: "Deterministic scan",
    reason: "Generated abstraction tree from project files.",
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
