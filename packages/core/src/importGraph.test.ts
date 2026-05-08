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
