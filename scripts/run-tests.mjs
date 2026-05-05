import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const testFiles = [
  ...(await filesMatching("packages/core/dist", file => file.endsWith(".test.js"))),
  ...(await filesMatching("scripts", file => file.endsWith(".test.mjs")))
];

for (const filePath of testFiles) {
  await import(pathToFileURL(filePath).href);
}

async function filesMatching(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && predicate(entry.name))
    .map(entry => path.join(directory, entry.name))
    .sort();
}
