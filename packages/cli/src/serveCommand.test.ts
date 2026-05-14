import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("serve command exposes --open in CLI help", () => {
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const output = execFileSync(process.execPath, [cliPath, "serve", "--help"], {
    encoding: "utf8"
  });

  assert.match(output, /--open/);
});

test("README documents atree serve --open", () => {
  const readmePath = fileURLToPath(new URL("../../../README.md", import.meta.url));
  const readme = readFileSync(readmePath, "utf8");

  assert.match(readme, /atree serve --open/);
});
