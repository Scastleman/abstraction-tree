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

  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.specifier, edge.to, edge.kind, edge.packageName]), [
    [
      "scripts/app-node-accessors.test.mjs",
      "../packages/app/dist-ts/nodeAccessors.js",
      "packages/app/src/nodeAccessors.ts",
      "workspace-package",
      "@abstraction-tree/app"
    ],
    [
      "scripts/generated-memory-fixtures.test.mjs",
      "../packages/core/dist/index.js",
      "packages/core/src/index.ts",
      "workspace-package",
      "@abstraction-tree/core"
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

test("buildImportGraphFromFiles keeps genuinely missing relative source imports unresolved", () => {
  const graph = buildImportGraphFromFiles([
    file("scripts/check-source.test.mjs", ["../src/missing.js"]),
    file("src/index.ts")
  ]);

  assert.deepEqual(graph.edges, []);
  assert.deepEqual(graph.unresolvedImports.map(item => [item.from, item.specifier, item.kind]), [
    ["scripts/check-source.test.mjs", "../src/missing.js", "relative"]
  ]);
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

function file(filePath: string, imports: string[] = []): FileSummary {
  return {
    path: filePath,
    extension: path.extname(filePath).toLowerCase(),
    language: "TypeScript",
    parseStrategy: "typescript-ast",
    contentHash: filePath,
    sizeBytes: 20,
    lines: 1,
    imports,
    exports: [],
    symbols: [],
    isTest: false,
    summary: `${filePath} summary.`,
    ownedByNodeIds: []
  };
}
