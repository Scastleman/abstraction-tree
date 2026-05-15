import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildCoverageArgs, coverageDirectory, coverageExcludes, coverageThresholds, resolveC8CliPath } from "./run-coverage.mjs";

test("coverageDirectory resolves the ignored c8 coverage folder", () => {
  const root = path.resolve("fixture-root");

  assert.equal(coverageDirectory(root), path.join(root, "coverage", "c8"));
});

test("resolveC8CliPath points at the project-local c8 binary", () => {
  const root = path.resolve("fixture-root");

  assert.equal(resolveC8CliPath(root), path.join(root, "node_modules", "c8", "bin", "c8.js"));
});

test("buildCoverageArgs enforces global c8 thresholds and report paths", () => {
  const root = path.resolve("fixture-root");
  const args = buildCoverageArgs(root);

  assert.equal(coverageThresholds.statements, 80);
  assert.equal(coverageThresholds.branches, 75);
  assert.equal(coverageThresholds.functions, 80);
  assert.equal(args.includes("--check-coverage"), true);
  assert.equal(args.at(args.indexOf("--statements") + 1), "80");
  assert.equal(args.at(args.indexOf("--branches") + 1), "75");
  assert.equal(args.at(args.indexOf("--functions") + 1), "80");
  assert.equal(args.at(args.indexOf("--lines") + 1), "80");
  assert.equal(args.at(args.indexOf("--report-dir") + 1), path.join(root, "coverage", "c8"));
});

test("coverage excludes scripts, adapters, tests, and example fixture tests from package-source thresholds", () => {
  assert.deepEqual(coverageExcludes, [
    "scripts/**",
    "adapters/**",
    "**/*.test.*",
    "examples/**/tests/**"
  ]);
});
