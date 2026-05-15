import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");

test("scan --profile applies a built-in profile through the CLI", async t => {
  const root = await workspace(t);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "Cargo.toml"), "[package]\nname = \"fd-lite\"\nversion = \"0.1.0\"\n", "utf8");
  await writeFile(path.join(root, "src", "main.rs"), "mod cli;\nfn main() {}\n", "utf8");
  await writeFile(path.join(root, "src", "cli.rs"), "pub struct Args;\n", "utf8");

  const result = await execFileAsync(process.execPath, [
    cliPath,
    "scan",
    "--project",
    root,
    "--profile",
    "rust-cli",
    "--no-custom-config"
  ]);
  const tree = JSON.parse(await readFile(path.join(root, ".abstraction-tree", "tree.json"), "utf8")) as Array<{ id: string }>;

  assert.match(result.stdout, /Scanned 3 files/);
  assert.ok(tree.some(node => node.id === "subsystem.rust.cli"));
  assert.ok(tree.some(node => node.id === "subsystem.rust.packaging"));
});

test("scan --profile rejects unknown profile names", async t => {
  const root = await workspace(t);

  await assert.rejects(
    execFileAsync(process.execPath, [
      cliPath,
      "scan",
      "--project",
      root,
      "--profile",
      "unknown-profile",
      "--no-custom-config"
    ]),
    error => {
      assert.ok(error instanceof Error);
      assert.match(String((error as Error & { stderr?: string }).stderr), /Unknown built-in profile unknown-profile/);
      return true;
    }
  );
});

async function workspace(t: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "atree-cli-profile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
