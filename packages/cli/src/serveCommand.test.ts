import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("serve command exposes --open in CLI help", () => {
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const output = execFileSync(process.execPath, [cliPath, "serve", "--help"], {
    encoding: "utf8"
  });

  assert.match(output, /--open/);
  assert.match(output, /--token <token>/);
});

test("scan command exposes custom config options", () => {
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const output = execFileSync(process.execPath, [cliPath, "scan", "--help"], {
    encoding: "utf8"
  });

  assert.match(output, /--config <path>/);
  assert.match(output, /--no-custom-config/);
});

test("README documents atree serve --open and network token usage", () => {
  const readmePath = fileURLToPath(new URL("../../../README.md", import.meta.url));
  const readme = readFileSync(readmePath, "utf8");

  assert.match(readme, /atree serve --open/);
  assert.match(readme, /atree serve --host 0\.0\.0\.0 --token/);
  assert.match(readme, /ATREE_SERVE_TOKEN/);
});

test("serve command refuses non-loopback hosts without a token", () => {
  const cliPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, "serve", "--host", "0.0.0.0"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ATREE_SERVE_TOKEN: ""
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to serve \/api\/state on non-loopback host 0\.0\.0\.0 without authentication/);
});
