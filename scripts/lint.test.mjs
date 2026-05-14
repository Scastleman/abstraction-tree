import assert from "node:assert/strict";
import test from "node:test";
import {
  isAutonomyClaimProjectFile,
  isLintableProjectFile,
  lintAutonomyClaims,
  lintRelativeImportSpecifier,
  lintSourceText,
  shouldLintNodeNextImportExtensions
} from "./lint.mjs";

test("isLintableProjectFile includes source code and skips generated outputs", () => {
  assert.equal(isLintableProjectFile("packages/core/src/index.ts"), true);
  assert.equal(isLintableProjectFile("scripts/run-tests.mjs"), true);
  assert.equal(isLintableProjectFile("examples/small-web-app/tests/checkout.test.js"), true);
  assert.equal(isLintableProjectFile("packages/core/dist/index.js"), false);
  assert.equal(isLintableProjectFile("packages/app/dist-ts/nodeAccessors.js"), false);
});

test("isAutonomyClaimProjectFile scopes claim checks to public docs and prompts", () => {
  assert.equal(isAutonomyClaimProjectFile("README.md"), true);
  assert.equal(isAutonomyClaimProjectFile("docs/FULL_SELF_IMPROVEMENT_LOOP.md"), true);
  assert.equal(isAutonomyClaimProjectFile("packages/full/README.md"), true);
  assert.equal(isAutonomyClaimProjectFile(".abstraction-tree/automation/codex-loop-prompt.md"), true);
  assert.equal(isAutonomyClaimProjectFile(".abstraction-tree/runs/2026-05-13-1803-agent-run.md"), false);
  assert.equal(isAutonomyClaimProjectFile("packages/core/src/promptRouter.ts"), false);
});

test("lintRelativeImportSpecifier enforces NodeNext runtime extensions", () => {
  assert.equal(lintRelativeImportSpecifier("node:path"), undefined);
  assert.equal(lintRelativeImportSpecifier("./schema.js"), undefined);
  assert.equal(lintRelativeImportSpecifier("./schema.json"), undefined);
  assert.match(lintRelativeImportSpecifier("./schema") ?? "", /must include/);
  assert.match(lintRelativeImportSpecifier("./schema.ts") ?? "", /runtime extension/);
});

test("lintAutonomyClaims reports unqualified public autonomy claims", () => {
  const issues = lintAutonomyClaims("README.md", [
    "# Abstraction Tree",
    "",
    "Abstraction Tree is a fully autonomous self-improving software system."
  ].join("\n"));

  assert.deepEqual(issues.map(issue => issue.rule), ["no-unsafe-autonomy-claim"]);
  assert.equal(issues[0].line, 3);
});

test("lintAutonomyClaims allows explicit non-goal and historical contexts", () => {
  const issues = lintAutonomyClaims("docs/FULL_SELF_IMPROVEMENT_LOOP.md", [
    "# Experimental Local Dogfooding Loop",
    "",
    "## What This Is Not",
    "",
    "- A fully autonomous self-improving software system.",
    "",
    "This page documents a loop historically called the full self-improvement loop.",
    "The command runs without claiming autonomous correctness."
  ].join("\n"));

  assert.deepEqual(issues, []);
});

test("shouldLintNodeNextImportExtensions scopes NodeNext imports to workspace code", () => {
  assert.equal(shouldLintNodeNextImportExtensions("packages/core/src/index.ts"), true);
  assert.equal(shouldLintNodeNextImportExtensions("scripts/run-tests.mjs"), true);
  assert.equal(shouldLintNodeNextImportExtensions("examples/small-web-app/src/api/checkout.ts"), false);
});

test("lintSourceText reports focused tests and debugger statements", () => {
  const issues = lintSourceText("packages/core/src/example.test.ts", [
    "import test from \"node:test\";",
    "test.only(\"focus\", () => {",
    "  debugger;",
    "});"
  ].join("\n"));

  assert.deepEqual(issues.map(issue => issue.rule), ["no-focused-tests", "no-debugger"]);
});

test("lintSourceText allows fixture-local extensionless imports outside NodeNext workspaces", () => {
  const issues = lintSourceText("examples/small-web-app/src/api/checkout.ts", "import { validateCart } from \"../services/cart\";\n");

  assert.deepEqual(issues, []);
});

test("lintSourceText reports relative imports that cannot run as emitted ESM", () => {
  const issues = lintSourceText("packages/core/src/example.ts", [
    "import { read } from \"./reader\";",
    "export { write } from \"./writer.ts\";",
    "await import(\"./dynamic\");"
  ].join("\n"));

  assert.deepEqual(issues.map(issue => issue.rule), [
    "node-next-import-extension",
    "node-next-import-extension",
    "node-next-import-extension"
  ]);
});
