import assert from "node:assert/strict";
import test from "node:test";
import {
  isLintableProjectFile,
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

test("lintRelativeImportSpecifier enforces NodeNext runtime extensions", () => {
  assert.equal(lintRelativeImportSpecifier("node:path"), undefined);
  assert.equal(lintRelativeImportSpecifier("./schema.js"), undefined);
  assert.equal(lintRelativeImportSpecifier("./schema.json"), undefined);
  assert.match(lintRelativeImportSpecifier("./schema") ?? "", /must include/);
  assert.match(lintRelativeImportSpecifier("./schema.ts") ?? "", /runtime extension/);
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
