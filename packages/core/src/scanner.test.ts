import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { scanProject, summarizeFile } from "./scanner.js";

test("summarizeFile uses AST facts for TypeScript and TSX", () => {
  const source = `
import React from "react";
import { readCart } from "../services/cart";

export interface CheckoutProps {
  cartId: string;
}

const localHelper = () => readCart();

export function CheckoutForm(props: CheckoutProps) {
  return <form>{props.cartId}</form>;
}

export default CheckoutForm;
`;

  const summary = summarizeFile("src/components/CheckoutForm.tsx", ".tsx", source, Buffer.byteLength(source));

  assert.equal(summary.parseStrategy, "typescript-ast");
  assert.deepEqual(summary.imports.sort(), ["../services/cart", "react"]);
  assert.ok(summary.exports.includes("CheckoutProps"));
  assert.ok(summary.exports.includes("CheckoutForm"));
  assert.ok(summary.symbols.includes("CheckoutProps"));
  assert.ok(summary.symbols.includes("localHelper"));
  assert.ok(summary.symbols.includes("CheckoutForm"));
});

test("summarizeFile keeps module extension metadata aligned", () => {
  const source = `
import { helper } from "./helper.js";

export const sample = helper();
`;
  const cases = [
    { path: "src/example.test.ts", extension: ".ts", language: "TypeScript" },
    { path: "src/example.test.tsx", extension: ".tsx", language: "TypeScript React" },
    { path: "src/example.test.js", extension: ".js", language: "JavaScript" },
    { path: "src/example.test.jsx", extension: ".jsx", language: "JavaScript React" },
    { path: "src/example.test.mjs", extension: ".mjs", language: "JavaScript" }
  ];

  for (const testCase of cases) {
    const summary = summarizeFile(testCase.path, testCase.extension, source, Buffer.byteLength(source));

    assert.equal(summary.language, testCase.language, testCase.extension);
    assert.equal(summary.parseStrategy, "typescript-ast", testCase.extension);
    assert.equal(summary.isTest, true, testCase.extension);
    assert.deepEqual(summary.imports, ["./helper.js"], testCase.extension);
    assert.ok(summary.exports.includes("sample"), testCase.extension);
    assert.ok(summary.symbols.includes("sample"), testCase.extension);
  }
});

test("summarizeFile keeps regex scanning for non-JS languages", () => {
  const source = `
import os

def write_report():
    return os.getcwd()
`;

  const summary = summarizeFile("tools/report.py", ".py", source, Buffer.byteLength(source));

  assert.equal(summary.parseStrategy, "regex");
  assert.deepEqual(summary.imports, ["os"]);
  assert.ok(summary.symbols.includes("write_report"));

  const dottedPyTest = summarizeFile("tools/report.test.py", ".py", source, Buffer.byteLength(source));
  assert.equal(dottedPyTest.isTest, false);
});

test("scanProject includes MJS script tests with AST facts", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "scripts"), { recursive: true });

  const source = `
import assert from "node:assert/strict";
import { nodeFiles } from "../packages/app/dist-ts/nodeAccessors.js";

export const usesFallback = () => {
  assert.deepEqual(nodeFiles({ sourceFiles: [], ownedFiles: ["src/legacy.ts"] }), ["src/legacy.ts"]);
};
`;

  await writeFile(path.join(root, "scripts", "app-node-accessors.test.mjs"), source, "utf8");

  const scan = await scanProject(root);
  const summary = scan.files.find(file => file.path === "scripts/app-node-accessors.test.mjs");

  assert.ok(summary);
  assert.equal(summary.extension, ".mjs");
  assert.equal(summary.language, "JavaScript");
  assert.equal(summary.parseStrategy, "typescript-ast");
  assert.equal(summary.isTest, true);
  assert.deepEqual(summary.imports.sort(), ["../packages/app/dist-ts/nodeAccessors.js", "node:assert/strict"]);
  assert.ok(summary.exports.includes("usesFallback"));
  assert.ok(summary.symbols.includes("usesFallback"));
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-scanner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
