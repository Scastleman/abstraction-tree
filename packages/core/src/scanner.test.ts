import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { scanProject, summarizeFile } from "./scanner.js";
import { atreePath, defaultConfig, writeJson } from "./workspace.js";

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
    { path: "src/example.test.mts", extension: ".mts", language: "TypeScript" },
    { path: "src/example.test.cts", extension: ".cts", language: "TypeScript" },
    { path: "src/example.test.js", extension: ".js", language: "JavaScript" },
    { path: "src/example.test.jsx", extension: ".jsx", language: "JavaScript React" },
    { path: "src/example.test.mjs", extension: ".mjs", language: "JavaScript" },
    { path: "src/example.test.cjs", extension: ".cjs", language: "JavaScript" }
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

  const prefixPyTest = summarizeFile("tools/test_report.py", ".py", source, Buffer.byteLength(source));
  assert.equal(prefixPyTest.isTest, true);

  const suffixPyTest = summarizeFile("tools/report_test.py", ".py", source, Buffer.byteLength(source));
  assert.equal(suffixPyTest.isTest, true);

  const goSource = `
package checkout

import (
    "net/http"
    service "example.com/acme/shop/internal/service"
    _ "embed"
)

type Handler struct {}

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {}

func NewRouter() {}
`;
  const goSummary = summarizeFile("internal/http/handler.go", ".go", goSource, Buffer.byteLength(goSource));
  assert.deepEqual(goSummary.imports.sort(), ["embed", "example.com/acme/shop/internal/service", "net/http"]);
  assert.ok(goSummary.exports.includes("Handler"));
  assert.ok(goSummary.exports.includes("ServeHTTP"));
  assert.ok(goSummary.exports.includes("NewRouter"));
  assert.ok(goSummary.symbols.includes("Handler"));
  assert.ok(goSummary.symbols.includes("ServeHTTP"));

  const goModSource = "module example.com/acme/shop\n\ngo 1.22\n";
  const goModSummary = summarizeFile("go.mod", ".mod", goModSource, Buffer.byteLength(goModSource));
  assert.equal(goModSummary.language, "Go Module");
  assert.ok(goModSummary.symbols.includes("go.module:example.com/acme/shop"));
  assert.ok(goModSummary.symbols.includes("go.version:1.22"));

  const goTestSource = "package checkout\n\nfunc TestCheckout(t *testing.T) {}\n";
  const goTest = summarizeFile("checkout/checkout_test.go", ".go", goTestSource, Buffer.byteLength(goTestSource));
  assert.equal(goTest.isTest, true);
  assert.ok(goTest.symbols.includes("TestCheckout"));

  const rustSource = `
mod cli;
use fd_lite::walk::ignore_hidden;

pub struct Options {
    pub hidden: bool,
}

pub fn parse_hidden_flag(args: &[String]) -> Options {
    Options { hidden: args.iter().any(|arg| arg == "--hidden") }
}
`;
  const rustSummary = summarizeFile("src/cli.rs", ".rs", rustSource, Buffer.byteLength(rustSource));
  assert.equal(rustSummary.parseStrategy, "regex");
  assert.deepEqual(rustSummary.imports.sort(), ["fd_lite::walk::ignore_hidden", "mod:cli"]);
  assert.ok(rustSummary.exports.includes("Options"));
  assert.ok(rustSummary.exports.includes("parse_hidden_flag"));
  assert.ok(rustSummary.symbols.includes("Options"));
  assert.ok(rustSummary.symbols.includes("parse_hidden_flag"));

  const rustTest = summarizeFile("tests/cli_test.rs", ".rs", rustSource, Buffer.byteLength(rustSource));
  assert.equal(rustTest.isTest, true);

  const cargoSource = `
[package]
name = "fd-lite"

[[bin]]
name = "fd"
path = "src/main.rs"
`;
  const cargoSummary = summarizeFile("Cargo.toml", ".toml", cargoSource, Buffer.byteLength(cargoSource));
  assert.ok(cargoSummary.symbols.includes("package.name:fd-lite"));
  assert.ok(cargoSummary.symbols.includes("bin.name:fd"));
  assert.ok(cargoSummary.symbols.includes("bin.path:src/main.rs"));

  const markdownSource = `
# Ownership

See [next](./next.md#borrowing), [listing](../listings/example/src/main.rs), and ![diagram](images/flow.png?raw).
Skip [external](https://example.com/page), [anchor](#local), and [mail](mailto:test@example.com).

[reference]: ../README.md
`;
  const markdownSummary = summarizeFile("docs/chapter.md", ".md", markdownSource, Buffer.byteLength(markdownSource));
  assert.deepEqual(markdownSummary.imports.sort(), [
    "../README.md",
    "../listings/example/src/main.rs",
    "./next.md",
    "images/flow.png"
  ]);
});

test("summarizeFile uses README intro prose as project purpose evidence", () => {
  const source = `# Demo Project

[![CI](https://example.com/badge.svg)](https://example.com)

Demo Project helps agents understand code before making changes.

It keeps scope, validation, and project memory visible.

## Usage

\`\`\`bash
npm test
\`\`\`
`;

  const summary = summarizeFile("README.md", ".md", source, Buffer.byteLength(source));

  assert.equal(summary.summary, "Demo Project helps agents understand code before making changes. It keeps scope, validation, and project memory visible.");
});

test("summarizeFile labels expanded regex extension coverage", () => {
  const cases = [
    { path: "docs/component.mdx", extension: ".mdx", language: "MDX", source: "import Demo from './Demo';\n# Component\n" },
    { path: "config/service.toml", extension: ".toml", language: "TOML", source: "[tool.atree]\nname = 'demo'\n" },
    { path: "scripts/deploy.sh", extension: ".sh", language: "Shell", source: "source ./env.sh\nbuild_app() {\n  echo ok\n}\n" },
    { path: "scripts/deploy.ps1", extension: ".ps1", language: "PowerShell", source: "Import-Module Pester\nfunction Invoke-Deploy {}\n" },
    { path: "public/index.html", extension: ".html", language: "HTML", source: '<link href="/app.css"><script src="/app.js"></script>\n' },
    { path: "styles/app.css", extension: ".css", language: "CSS", source: '@import "./tokens.css";\n.button { color: red; }\n' },
    { path: "styles/app.scss", extension: ".scss", language: "SCSS", source: '@use "./theme";\n.panel { color: $accent; }\n' }
  ];

  for (const testCase of cases) {
    const summary = summarizeFile(testCase.path, testCase.extension, testCase.source, Buffer.byteLength(testCase.source));

    assert.equal(summary.language, testCase.language, testCase.extension);
    assert.equal(summary.parseStrategy, "regex", testCase.extension);
  }
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

test("scanProject includes expanded language extension fixtures", async t => {
  const root = await workspace(t);
  const files = new Map([
    ["src/server.mts", 'import { worker } from "./worker.cjs";\nexport const server = worker;\n'],
    ["src/worker.cts", 'const config = require("../config/site.toml");\nexport const worker = config;\n'],
    ["scripts/task.cjs", 'const deploy = require("./deploy.sh");\nmodule.exports = deploy;\n'],
    ["docs/component.mdx", 'import Demo from "./Demo";\n# Component\n<Demo />\n'],
    ["config/site.toml", "[tool.atree]\nname = 'fixture'\n"],
    ["scripts/deploy.sh", "source ./env.sh\nbuild_app() {\n  echo ok\n}\n"],
    ["scripts/deploy.ps1", "Import-Module Pester\nfunction Invoke-Deploy {}\n"],
    ["public/index.html", '<link rel="stylesheet" href="/app.css"><script src="/app.js"></script>\n'],
    ["styles/app.css", '@import "./tokens.css";\n.button { color: red; }\n'],
    ["styles/app.scss", '@use "./theme";\n.panel { color: $accent; }\n']
  ]);

  for (const filePath of files.keys()) {
    await mkdir(path.join(root, path.dirname(filePath)), { recursive: true });
  }
  for (const [filePath, source] of files) {
    await writeFile(path.join(root, filePath), source, "utf8");
  }

  const scan = await scanProject(root);
  const byPath = new Map(scan.files.map(file => [file.path, file]));
  const expected = [
    ["config/site.toml", ".toml", "TOML", "regex"],
    ["docs/component.mdx", ".mdx", "MDX", "regex"],
    ["public/index.html", ".html", "HTML", "regex"],
    ["scripts/deploy.ps1", ".ps1", "PowerShell", "regex"],
    ["scripts/deploy.sh", ".sh", "Shell", "regex"],
    ["scripts/task.cjs", ".cjs", "JavaScript", "typescript-ast"],
    ["src/server.mts", ".mts", "TypeScript", "typescript-ast"],
    ["src/worker.cts", ".cts", "TypeScript", "typescript-ast"],
    ["styles/app.css", ".css", "CSS", "regex"],
    ["styles/app.scss", ".scss", "SCSS", "regex"]
  ];

  assert.deepEqual(scan.files.map(file => file.path), expected.map(([filePath]) => filePath));
  for (const [filePath, extension, language, parseStrategy] of expected) {
    const summary = byPath.get(filePath);
    assert.ok(summary, filePath);
    assert.equal(summary.extension, extension, filePath);
    assert.equal(summary.language, language, filePath);
    assert.equal(summary.parseStrategy, parseStrategy, filePath);
  }

  assert.deepEqual(byPath.get("src/server.mts")?.imports, ["./worker.cjs"]);
  assert.ok(byPath.get("src/worker.cts")?.imports.includes("../config/site.toml"));
  assert.deepEqual(byPath.get("styles/app.css")?.imports, ["./tokens.css"]);
  assert.deepEqual(byPath.get("styles/app.scss")?.imports, ["./theme"]);
  assert.ok(byPath.get("scripts/deploy.sh")?.symbols.includes("build_app"));
  assert.ok(byPath.get("scripts/deploy.ps1")?.symbols.includes("Invoke-Deploy"));
  assert.ok(byPath.get("config/site.toml")?.symbols.includes("tool.atree"));
});

test("scanProject skips large and binary files for supported extensions", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "kept.css"), ".kept { color: green; }\n", "utf8");
  await writeFile(path.join(root, "src", "too-large.scss"), "x".repeat(512_001), "utf8");
  await writeFile(path.join(root, "src", "binary.html"), Buffer.from([0, 1, 2, 3, 4, 5]));

  const scan = await scanProject(root);

  assert.deepEqual(scan.files.map(file => file.path), ["src/kept.css"]);
});

test("scanProject walks sourceRoot and preserves project-relative paths", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeConfig(root, { sourceRoot: "src" });
  await writeFile(path.join(root, "src", "app.ts"), "export const app = true;\n", "utf8");
  await writeFile(path.join(root, "outside.ts"), "export const outside = true;\n", "utf8");

  const scan = await scanProject(root);

  assert.deepEqual(scan.files.map(file => file.path), ["src/app.ts"]);
});

test("scanProject honors glob ignores and keeps default directory ignores", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "src", "nested"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "package"), { recursive: true });
  await writeConfig(root, { ignored: [...defaultConfig(root).ignored, "**/*.generated.ts"] });
  await writeFile(path.join(root, "src", "app.ts"), "export const app = true;\n", "utf8");
  await writeFile(path.join(root, "src", "app.generated.ts"), "export const generated = true;\n", "utf8");
  await writeFile(path.join(root, "src", "nested", "view.generated.ts"), "export const generatedView = true;\n", "utf8");
  await writeFile(path.join(root, "node_modules", "package", "index.ts"), "export const dependency = true;\n", "utf8");

  const scan = await scanProject(root);

  assert.deepEqual(scan.files.map(file => file.path), ["src/app.ts"]);
  assert.ok(scan.diagnostics.some(diagnostic => diagnostic.kind === "skipped-directory" && diagnostic.path === "node_modules"));
  assert.ok(scan.diagnostics.some(diagnostic => diagnostic.kind === "skipped-file" && diagnostic.path === "src/app.generated.ts"));
  assert.ok(scan.diagnostics.some(diagnostic => diagnostic.kind === "skipped-file" && diagnostic.path === "src/nested/view.generated.ts"));
});

test("scanProject honors negated ignore patterns", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeConfig(root, { ignored: [...defaultConfig(root).ignored, "**/*.generated.ts", "!src/keep.generated.ts"] });
  await writeFile(path.join(root, "src", "app.ts"), "export const app = true;\n", "utf8");
  await writeFile(path.join(root, "src", "drop.generated.ts"), "export const drop = true;\n", "utf8");
  await writeFile(path.join(root, "src", "keep.generated.ts"), "export const keep = true;\n", "utf8");

  const scan = await scanProject(root);

  assert.deepEqual(scan.files.map(file => file.path), ["src/app.ts", "src/keep.generated.ts"]);
});

test("scanProject reads root gitignore patterns when configured", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeConfig(root, { respectGitignore: true });
  await writeFile(path.join(root, ".gitignore"), "src/ignored-by-git.ts\n", "utf8");
  await writeFile(path.join(root, "src", "kept.ts"), "export const kept = true;\n", "utf8");
  await writeFile(path.join(root, "src", "ignored-by-git.ts"), "export const ignored = true;\n", "utf8");

  const scan = await scanProject(root);

  assert.deepEqual(scan.files.map(file => file.path), ["src/kept.ts"]);
  assert.ok(scan.diagnostics.some(diagnostic => diagnostic.kind === "skipped-file" && diagnostic.path === "src/ignored-by-git.ts"));
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-scanner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeConfig(root: string, overrides: Partial<ReturnType<typeof defaultConfig>>) {
  await writeJson(atreePath(root, "config.json"), {
    ...defaultConfig(root),
    ...overrides
  });
}
