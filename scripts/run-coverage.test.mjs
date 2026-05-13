import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildCoverageEnv, coverageDirectory, isCoverageArtifact } from "./run-coverage.mjs";

test("coverageDirectory resolves the ignored V8 coverage folder", () => {
  const root = path.resolve("fixture-root");

  assert.equal(coverageDirectory(root), path.join(root, "coverage", "v8"));
});

test("buildCoverageEnv preserves existing env while setting NODE_V8_COVERAGE", () => {
  const root = path.resolve("fixture-root");

  assert.deepEqual(buildCoverageEnv(root, { EXISTING: "1" }), {
    EXISTING: "1",
    NODE_V8_COVERAGE: path.join(root, "coverage", "v8")
  });
});

test("isCoverageArtifact recognizes V8 coverage files", () => {
  assert.equal(isCoverageArtifact("coverage-123-456-0.json"), true);
  assert.equal(isCoverageArtifact("coverage-final.json"), false);
  assert.equal(isCoverageArtifact("README.md"), false);
});
