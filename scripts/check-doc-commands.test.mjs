import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDocCommands } from "./check-doc-commands.mjs";

test("checkDocCommands accepts documented package scripts and CLI commands", async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, "README.md"), [
    "# Fixture",
    "",
    "```bash",
    "npm run atree -- scan --project .",
    "npm run docs:commands",
    "npx atree serve --open",
    "```",
    "",
    "[Guide](docs/GUIDE.md)",
    ""
  ].join("\n"));
  await writeFile(path.join(root, "docs", "GUIDE.md"), "Run `atree validate`.\n");

  assert.deepEqual(await checkDocCommands(root), []);
});

test("checkDocCommands reports stale scripts, commands, and doc links", async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, "README.md"), [
    "# Fixture",
    "",
    "```bash",
    "npm run missing:script",
    "npx atree vanished",
    "```",
    "",
    "[Missing](docs/MISSING.md)",
    ""
  ].join("\n"));
  await writeFile(path.join(root, "docs", "GUIDE.md"), "ok\n");

  const issues = await checkDocCommands(root);

  assert.ok(issues.some(issue => issue.includes("missing:script")));
  assert.ok(issues.some(issue => issue.includes("vanished")));
  assert.ok(issues.some(issue => issue.includes("docs/MISSING.md")));
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "atree-doc-command-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: {
      atree: "node packages/cli/dist/index.js",
      "docs:commands": "node scripts/check-doc-commands.mjs"
    }
  }, null, 2));
  return root;
}
