#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultTestSearches = [
  { directory: "packages/core/dist", suffix: ".test.js" },
  { directory: "packages/cli/dist", suffix: ".test.js" },
  { directory: "scripts", suffix: ".test.mjs" }
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

export async function main(root = process.cwd()) {
  const testFiles = await collectTestFiles(root);

  for (const filePath of testFiles) {
    await import(pathToFileURL(filePath).href);
  }
}

export async function collectTestFiles(root = process.cwd(), searches = defaultTestSearches) {
  const testFileGroups = await Promise.all(
    searches.map(search =>
      filesMatching(path.resolve(root, search.directory), filePath => filePath.endsWith(search.suffix))
    )
  );
  return testFileGroups.flat();
}

export async function filesMatching(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesMatching(filePath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(filePath)) {
      files.push(filePath);
    }
  }

  return files.sort();
}
