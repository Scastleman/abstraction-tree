import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { buildImportGraph, buildImportGraphFromFiles } from "./importGraph.js";
import { validateImportGraphSchema } from "./runtimeSchema.js";
import type { FileSummary } from "./schema.js";

test("buildImportGraphFromFiles resolves relative extensionless, JS-suffixed, and index imports", () => {
  const graph = buildImportGraphFromFiles([
    file("src/app.ts", ["./feature", "./helper", "./view.js"]),
    file("src/feature/index.ts"),
    file("src/helper.ts"),
    file("src/view.ts")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind]), [
    ["src/app.ts", "./feature", "src/feature/index.ts", "relative"],
    ["src/app.ts", "./helper", "src/helper.ts", "relative"],
    ["src/app.ts", "./view.js", "src/view.ts", "relative"]
  ]);
  assert.deepEqual(graph.externalImports, []);
  assert.deepEqual(graph.unresolvedImports, []);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles resolves ESM and CommonJS module variant imports", () => {
  const graph = buildImportGraphFromFiles([
    file("src/entry.mts", ["./feature.mjs", "./shared"]),
    file("src/feature.mts"),
    file("src/shared.cts"),
    file("src/legacy.cjs", ["./shared.cjs"])
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind]), [
    ["src/entry.mts", "./feature.mjs", "src/feature.mts", "relative"],
    ["src/entry.mts", "./shared", "src/shared.cts", "relative"],
    ["src/legacy.cjs", "./shared.cjs", "src/shared.cts", "relative"]
  ]);
  assert.deepEqual(graph.externalImports, []);
  assert.deepEqual(graph.unresolvedImports, []);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph resolves workspace package imports and separates external and unresolved imports", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
  await mkdir(path.join(root, "packages", "shared", "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }), "utf8");
  await writeFile(path.join(root, "packages", "app", "package.json"), JSON.stringify({ name: "@scope/app" }), "utf8");
  await writeFile(path.join(root, "packages", "shared", "package.json"), JSON.stringify({
    name: "@scope/shared",
    source: "src/index.ts"
  }), "utf8");

  const graph = await buildImportGraph(root, [
    file("packages/app/src/index.ts", ["./missing", "@scope/shared", "@scope/shared/utils", "react"]),
    file("packages/shared/src/index.ts"),
    file("packages/shared/src/utils.ts")
  ]);

  assert.deepEqual(graph.workspacePackages, [
    {
      name: "@scope/app",
      root: "packages/app",
      manifestPath: "packages/app/package.json",
      entrypoint: "packages/app/src/index.ts"
    },
    {
      name: "@scope/shared",
      root: "packages/shared",
      manifestPath: "packages/shared/package.json",
      entrypoint: "packages/shared/src/index.ts"
    }
  ]);
  assert.deepEqual(graph.edges.map(edge => [edge.specifier, edge.to, edge.kind, edge.packageName]), [
    ["@scope/shared", "packages/shared/src/index.ts", "workspace-package", "@scope/shared"],
    ["@scope/shared/utils", "packages/shared/src/utils.ts", "workspace-package", "@scope/shared"]
  ]);
  assert.deepEqual(graph.externalImports, [{
    from: "packages/app/src/index.ts",
    specifier: "react",
    packageName: "react"
  }]);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.from, item.specifier, item.kind]), [
    ["packages/app/src/index.ts", "./missing", "relative"]
  ]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph discovers pnpm workspace packages and resolves workspace imports", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
  await mkdir(path.join(root, "packages", "shared", "src"), { recursive: true });
  await mkdir(path.join(root, "playground", "basic", "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ private: true }), "utf8");
  await writeFile(path.join(root, "pnpm-workspace.yaml"), `
packages:
  - "packages/*"
  - 'playground/*'
`, "utf8");
  await writeFile(path.join(root, "packages", "app", "package.json"), JSON.stringify({ name: "@scope/app" }), "utf8");
  await writeFile(path.join(root, "packages", "shared", "package.json"), JSON.stringify({
    name: "@scope/shared",
    source: "src/index.ts"
  }), "utf8");
  await writeFile(path.join(root, "playground", "basic", "package.json"), JSON.stringify({ name: "playground-basic" }), "utf8");

  const graph = await buildImportGraph(root, [
    file("packages/app/src/index.ts", ["@scope/shared"]),
    file("packages/shared/src/index.ts"),
    file("playground/basic/src/index.ts")
  ]);

  assert.deepEqual(graph.workspacePackages, [
    {
      name: "@scope/app",
      root: "packages/app",
      manifestPath: "packages/app/package.json",
      entrypoint: "packages/app/src/index.ts"
    },
    {
      name: "@scope/shared",
      root: "packages/shared",
      manifestPath: "packages/shared/package.json",
      entrypoint: "packages/shared/src/index.ts"
    },
    {
      name: "playground-basic",
      root: "playground/basic",
      manifestPath: "playground/basic/package.json",
      entrypoint: "playground/basic/src/index.ts"
    }
  ]);
  assert.deepEqual(graph.edges.map(edge => [edge.specifier, edge.to, edge.kind, edge.packageName]), [
    ["@scope/shared", "packages/shared/src/index.ts", "workspace-package", "@scope/shared"]
  ]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph merges package.json and pnpm workspace package roots", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
  await mkdir(path.join(root, "tools", "worker", "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }), "utf8");
  await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: [\"packages/*\", tools/*]\n", "utf8");
  await writeFile(path.join(root, "packages", "app", "package.json"), JSON.stringify({ name: "@scope/app" }), "utf8");
  await writeFile(path.join(root, "tools", "worker", "package.json"), JSON.stringify({ name: "@scope/worker" }), "utf8");

  const graph = await buildImportGraph(root, [
    file("packages/app/src/index.ts"),
    file("tools/worker/src/index.ts")
  ]);

  assert.deepEqual(graph.workspacePackages.map(pkg => [pkg.name, pkg.root]), [
    ["@scope/app", "packages/app"],
    ["@scope/worker", "tools/worker"]
  ]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph respects pnpm workspace exclusion patterns", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "packages", "kept", "src"), { recursive: true });
  await mkdir(path.join(root, "packages", "ignored", "src"), { recursive: true });
  await mkdir(path.join(root, "packages", "private-tool", "src"), { recursive: true });
  await writeFile(path.join(root, "pnpm-workspace.yml"), `
packages:
  - packages/*
  - "!packages/ignored"
  - '!packages/private-*'
`, "utf8");
  await writeFile(path.join(root, "packages", "kept", "package.json"), JSON.stringify({ name: "@scope/kept" }), "utf8");
  await writeFile(path.join(root, "packages", "ignored", "package.json"), JSON.stringify({ name: "@scope/ignored" }), "utf8");
  await writeFile(path.join(root, "packages", "private-tool", "package.json"), JSON.stringify({ name: "@scope/private-tool" }), "utf8");

  const graph = await buildImportGraph(root, [
    file("packages/kept/src/index.ts"),
    file("packages/ignored/src/index.ts"),
    file("packages/private-tool/src/index.ts")
  ]);

  assert.deepEqual(graph.workspacePackages.map(pkg => [pkg.name, pkg.root]), [
    ["@scope/kept", "packages/kept"]
  ]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph resolves relative generated package artifact imports to scanned source files", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "packages", "app", "src"), { recursive: true });
  await mkdir(path.join(root, "packages", "core", "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }), "utf8");
  await writeFile(path.join(root, "packages", "app", "package.json"), JSON.stringify({ name: "@abstraction-tree/app" }), "utf8");
  await writeFile(path.join(root, "packages", "core", "package.json"), JSON.stringify({
    name: "@abstraction-tree/core",
    main: "dist/index.js",
    types: "dist/index.d.ts"
  }), "utf8");

  const graph = await buildImportGraph(root, [
    file("scripts/app-node-accessors.test.mjs", ["../packages/app/dist-ts/nodeAccessors.js"]),
    file("scripts/generated-memory-fixtures.test.mjs", ["../packages/core/dist/index.js"]),
    file("packages/app/src/main.tsx"),
    file("packages/app/src/nodeAccessors.ts"),
    file("packages/core/src/index.ts")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind, edge.packageName, edge.classification]), [
    [
      "scripts/app-node-accessors.test.mjs",
      "../packages/app/dist-ts/nodeAccessors.js",
      "packages/app/src/nodeAccessors.ts",
      "workspace-package",
      "@abstraction-tree/app",
      "generated-artifact"
    ],
    [
      "scripts/generated-memory-fixtures.test.mjs",
      "../packages/core/dist/index.js",
      "packages/core/src/index.ts",
      "workspace-package",
      "@abstraction-tree/core",
      "generated-artifact"
    ]
  ]);
  assert.deepEqual(graph.unresolvedImports, []);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph resolves TypeScript paths aliases with baseUrl, rootDirs, and specific pattern conflicts", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "src", "view"), { recursive: true });
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      rootDirs: ["src", "generated"],
      paths: {
        "@/*": ["src/*"],
        "@/components/*": ["src/ui/*"],
        "@exact": ["test-support/exact.ts"]
      }
    }
  }), "utf8");

  const graph = await buildImportGraph(root, [
    file("tsconfig.json"),
    file("src/app.ts", ["@/components/Button", "@/utils/math", "@exact"]),
    file("src/components/Button.ts"),
    file("src/ui/Button.ts"),
    file("src/utils/math.ts"),
    file("src/view/screen.ts", ["./template"]),
    file("generated/view/template.ts"),
    file("test-support/exact.ts")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind, edge.aliasSource]), [
    ["src/app.ts", "@/components/Button", "src/ui/Button.ts", "alias", "typescript:tsconfig.json"],
    ["src/app.ts", "@/utils/math", "src/utils/math.ts", "alias", "typescript:tsconfig.json"],
    ["src/app.ts", "@exact", "test-support/exact.ts", "alias", "typescript:tsconfig.json"],
    ["src/view/screen.ts", "./template", "generated/view/template.ts", "relative", undefined]
  ]);
  assert.deepEqual(graph.externalImports, []);
  assert.deepEqual(graph.unresolvedImports, []);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph resolves Vite resolve.alias entries", async t => {
  const root = await workspace(t);
  await writeFile(path.join(root, "vite.config.ts"), `
    import path from "node:path";
    import { defineConfig } from "vite";

    export default defineConfig({
      resolve: {
        alias: [
          { find: "@", replacement: path.resolve(__dirname, "src") },
          { find: "~icons", replacement: "/src/icons" }
        ]
      }
    });
  `, "utf8");

  const graph = await buildImportGraph(root, [
    file("vite.config.ts"),
    file("src/main.ts", ["@/App", "~icons/logo"]),
    file("src/App.tsx"),
    file("src/icons/logo.ts")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.specifier, edge.to, edge.kind, edge.aliasSource]), [
    ["@/App", "src/App.tsx", "alias", "vite:vite.config.ts"],
    ["~icons/logo", "src/icons/logo.ts", "alias", "vite:vite.config.ts"]
  ]);
  assert.deepEqual(graph.unresolvedImports, []);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraph resolves Webpack aliases and reports matched aliases with missing targets", async t => {
  const root = await workspace(t);
  await writeFile(path.join(root, "webpack.config.js"), `
    const path = require("node:path");
    const aliases = {
      "@shared": path.resolve(__dirname, "src/shared"),
      "legacy$": path.resolve(__dirname, "src/legacy.ts")
    };

    module.exports = {
      resolve: {
        alias: aliases
      }
    };
  `, "utf8");

  const graph = await buildImportGraph(root, [
    file("webpack.config.js"),
    file("src/entry.ts", ["@shared/api", "@shared/missing", "legacy"]),
    file("src/shared/api.ts"),
    file("src/legacy.ts")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.specifier, edge.to, edge.kind, edge.aliasSource]), [
    ["@shared/api", "src/shared/api.ts", "alias", "webpack:webpack.config.js"],
    ["legacy", "src/legacy.ts", "alias", "webpack:webpack.config.js"]
  ]);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.specifier, item.kind, item.aliasSource]), [
    ["@shared/missing", "alias", "webpack:webpack.config.js"]
  ]);
  assert.match(graph.unresolvedImports[0]?.reason ?? "", /Alias matched webpack:webpack\.config\.js/);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles resolves configured alias hooks and diagnoses unconfigured alias-shaped imports", () => {
  const graph = buildImportGraphFromFiles([
    file("src/app.ts", ["#/thing", "~/missing"]),
    file("src/custom/thing.ts")
  ], {
    importAliases: [{ find: "#/*", replacement: "src/custom/*" }]
  });

  assert.deepEqual(graph.edges.map(edge => [edge.specifier, edge.to, edge.kind, edge.aliasSource]), [
    ["#/thing", "src/custom/thing.ts", "alias", "custom"]
  ]);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.specifier, item.kind]), [
    ["~/missing", "alias"]
  ]);
  assert.match(graph.unresolvedImports[0]?.reason ?? "", /no TypeScript paths, bundler alias, or configured importAliases/);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles classifies static asset, generated artifact, and virtual imports", () => {
  const graph = buildImportGraphFromFiles([
    file("src/App.tsx", [
      "../dist/index.js",
      "./assets/logo.svg",
      "./missing",
      "./styles.css",
      "./worker?worker",
      "@vite/client",
      "virtual:generated"
    ]),
    file("src/styles.css")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.specifier, edge.to, edge.kind, edge.classification]), [
    ["./styles.css", "src/styles.css", "relative", "static-asset"]
  ]);
  assert.deepEqual(graph.externalImports.map(item => [item.specifier, item.packageName, item.classification]), [
    ["@vite/client", "virtual", "virtual"],
    ["virtual:generated", "virtual", "virtual"]
  ]);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.specifier, item.kind, item.classification]), [
    ["../dist/index.js", "relative", "generated-artifact"],
    ["./assets/logo.svg", "relative", "static-asset"],
    ["./missing", "relative", undefined],
    ["./worker?worker", "relative", "static-asset"]
  ]);
  assert.match(graph.unresolvedImports.find(item => item.specifier === "./assets/logo.svg")?.reason ?? "", /Static asset import/);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles keeps genuinely missing relative source imports unresolved", () => {
  const graph = buildImportGraphFromFiles([
    file("scripts/check-source.test.mjs", ["../src/missing.js"]),
    file("src/index.ts")
  ]);

  assert.deepEqual(graph.edges, []);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.from, item.specifier, item.kind, item.classification]), [
    ["scripts/check-source.test.mjs", "../src/missing.js", "relative", undefined]
  ]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles resolves Python relative and package imports", () => {
  const graph = buildImportGraphFromFiles([
    file("src/click/core.py", [".parser", "argparse"]),
    file("src/click/parser.py"),
    file("tests/test_options.py", ["click.parser", "pytest"])
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind, edge.packageName]), [
    ["src/click/core.py", ".parser", "src/click/parser.py", "relative", undefined],
    ["tests/test_options.py", "click.parser", "src/click/parser.py", "workspace-package", "click"]
  ]);
  assert.deepEqual(graph.externalImports.map(item => [item.from, item.specifier, item.packageName]), [
    ["src/click/core.py", "argparse", "argparse"],
    ["tests/test_options.py", "pytest", "pytest"]
  ]);
  assert.deepEqual(graph.unresolvedImports, []);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles resolves Rust module and crate imports", () => {
  const graph = buildImportGraphFromFiles([
    file("Cargo.toml", [], ["package.name:fd-lite", "bin.path:src/main.rs"]),
    file("src/main.rs", ["mod:cli", "mod:walk"], ["main"]),
    file("src/cli.rs", [], ["Options", "parse_hidden_flag"]),
    file("src/walk.rs", [], ["ignore_hidden", "collect_entries"]),
    file("tests/tests.rs", ["fd_lite::walk::ignore_hidden"], ["hidden_files_are_filtered_by_default"], true)
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind, edge.packageName]), [
    ["src/main.rs", "mod:cli", "src/cli.rs", "relative", undefined],
    ["src/main.rs", "mod:walk", "src/walk.rs", "relative", undefined],
    ["tests/tests.rs", "fd_lite::walk::ignore_hidden", "src/walk.rs", "workspace-package", "fd-lite"]
  ]);
  assert.deepEqual(graph.externalImports, []);
  assert.deepEqual(graph.unresolvedImports, []);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles resolves Go module imports and reports local misses", () => {
  const graph = buildImportGraphFromFiles([
    file("go.mod", [], ["go.module:example.com/acme/shop"]),
    file("cmd/api/main.go", ["example.com/acme/shop/internal/http", "net/http"]),
    file("internal/http/handler.go", [
      "example.com/acme/shop/internal/missing",
      "example.com/acme/shop/internal/service"
    ]),
    file("internal/service/orders.go")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind, edge.packageName]), [
    ["cmd/api/main.go", "example.com/acme/shop/internal/http", "internal/http/handler.go", "go-package", "example.com/acme/shop"],
    ["internal/http/handler.go", "example.com/acme/shop/internal/service", "internal/service/orders.go", "go-package", "example.com/acme/shop"]
  ]);
  assert.deepEqual(graph.externalImports.map(item => [item.from, item.specifier, item.packageName]), [
    ["cmd/api/main.go", "net/http", "net/http"]
  ]);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.from, item.specifier, item.kind, item.packageName]), [
    ["internal/http/handler.go", "example.com/acme/shop/internal/missing", "go-package", "example.com/acme/shop"]
  ]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles resolves Markdown links to scanned local docs and code", () => {
  const graph = buildImportGraphFromFiles([
    file("src/SUMMARY.md", ["ch04-01-what-is-ownership.md", "../listings/demo/src/main.rs", "./missing.md", "./images/diagram.png"]),
    file("src/ch04-01-what-is-ownership.md", ["./ch04-02-references-and-borrowing.md"]),
    file("src/ch04-02-references-and-borrowing.md"),
    file("listings/demo/src/main.rs")
  ]);

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind, edge.classification]), [
    ["src/ch04-01-what-is-ownership.md", "./ch04-02-references-and-borrowing.md", "src/ch04-02-references-and-borrowing.md", "markdown-link", undefined],
    ["src/SUMMARY.md", "../listings/demo/src/main.rs", "listings/demo/src/main.rs", "markdown-link", undefined],
    ["src/SUMMARY.md", "ch04-01-what-is-ownership.md", "src/ch04-01-what-is-ownership.md", "markdown-link", undefined]
  ]);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.specifier, item.kind, item.classification]), [
    ["./images/diagram.png", "markdown-link", "static-asset"],
    ["./missing.md", "markdown-link", undefined]
  ]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles detects non-JS local dependency cycles", () => {
  const graph = buildImportGraphFromFiles([
    file("docs/a.md", ["./b.md"]),
    file("docs/b.md", ["./a.md"])
  ]);

  assert.deepEqual(graph.cycles, [{
    files: ["docs/a.md", "docs/b.md"]
  }]);
  assert.deepEqual(validateImportGraphSchema(graph), []);
});

test("buildImportGraphFromFiles detects file import cycles", () => {
  const graph = buildImportGraphFromFiles([
    file("src/a.ts", ["./b"]),
    file("src/b.ts", ["./c"]),
    file("src/c.ts", ["./a"])
  ]);

  assert.deepEqual(graph.cycles, [{
    files: ["src/a.ts", "src/b.ts", "src/c.ts"]
  }]);
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-import-graph-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function file(filePath: string, imports: string[] = [], symbols: string[] = [], isTest = false): FileSummary {
  return {
    path: filePath,
    extension: path.extname(filePath).toLowerCase(),
    language: fileLanguage(filePath),
    parseStrategy: filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? "typescript-ast" : "regex",
    contentHash: filePath,
    sizeBytes: 20,
    lines: 1,
    imports,
    exports: [],
    symbols,
    isTest,
    summary: `${filePath} summary.`,
    ownedByNodeIds: []
  };
}

function fileLanguage(filePath: string): string {
  if (filePath.endsWith(".rs")) return "Rust";
  if (filePath.endsWith(".go")) return "Go";
  if (filePath.endsWith(".md")) return "Markdown";
  if (path.basename(filePath).toLowerCase() === "go.mod") return "Go Module";
  if (filePath.endsWith(".toml")) return "TOML";
  return "TypeScript";
}
