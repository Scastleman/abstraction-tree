#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCliPath = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
let npmCacheDir;

const packages = [
  {
    label: "core",
    name: "@abstraction-tree/core",
    directory: "packages/core",
    requiredFiles: [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/scanner.js",
      "dist/workspace.js"
    ],
    forbiddenFiles: [
      "src/",
      "tsconfig.json",
      ".test.js",
      ".test.d.ts"
    ]
  },
  {
    label: "cli",
    name: "@abstraction-tree/cli",
    directory: "packages/cli",
    requiredFiles: [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/agentHealth.js",
      "dist/serveHost.js"
    ],
    forbiddenFiles: [
      "src/",
      "tsconfig.json",
      ".test.js",
      ".test.d.ts"
    ]
  },
  {
    label: "app",
    name: "@abstraction-tree/app",
    directory: "packages/app",
    requiredFiles: [
      "dist/index.html"
    ],
    forbiddenFiles: [
      "src/",
      "tsconfig.json",
      "dist-ts/"
    ],
    forbiddenExactFiles: [
      "index.html"
    ]
  },
  {
    label: "full",
    name: "abstraction-tree",
    directory: "packages/full",
    requiredFiles: [
      "bin/atree.js",
      "README.md"
    ],
    forbiddenFiles: [
      "node_modules/",
      "src/",
      "dist/"
    ]
  }
];

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "atree-pack-smoke-"));
  const packDir = path.join(tempRoot, "packs");
  const projectDir = path.join(tempRoot, "project");
  npmCacheDir = path.join(tempRoot, "npm-cache");

  try {
    await mkdir(packDir, { recursive: true });
    await mkdir(projectDir, { recursive: true });
    await mkdir(npmCacheDir, { recursive: true });

    const packResults = [];
    for (const packageInfo of packages) {
      const dryRun = await npmPack(packageInfo, ["--dry-run"]);
      verifyPackageManifest(packageInfo, dryRun.files);

      const packed = await npmPack(packageInfo, ["--pack-destination", packDir]);
      const tarball = path.join(packDir, packed.filename);
      assertFile(tarball, `${packageInfo.name}: npm pack did not create ${tarball}`);
      packResults.push({ ...packageInfo, tarball });
      console.log(`pack smoke: ${packageInfo.name} dry-run and tarball checks passed`);
    }

    await createSmokeProject(projectDir, packResults);
    await verifyInstalledLayout(projectDir);
    await runInstalledCommands(projectDir);

    console.log("pack smoke: installed package commands passed");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function npmPack(packageInfo, extraArgs) {
  const cwd = path.join(root, packageInfo.directory);
  const result = await runCommand(
    process.execPath,
    npmArgs(["pack", "--json", ...extraArgs]),
    cwd,
    `${packageInfo.name}: npm pack ${extraArgs.includes("--dry-run") ? "--dry-run" : ""}`.trim()
  );

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${packageInfo.name}: npm pack did not return JSON.\n${result.stdout}\n${result.stderr}`.trim());
  }

  const entry = parsed?.[0];
  if (!entry?.filename || !Array.isArray(entry.files)) {
    throw new Error(`${packageInfo.name}: npm pack JSON was missing filename or files.`);
  }
  return entry;
}

function verifyPackageManifest(packageInfo, files) {
  const paths = files.map(file => file.path).sort();
  const missing = packageInfo.requiredFiles.filter(required => !paths.includes(required));
  if (missing.length) {
    throw new Error(`${packageInfo.name}: packed package is missing required files: ${missing.join(", ")}`);
  }

  const dogfoodMemory = paths.filter(filePath => filePath === ".abstraction-tree" || filePath.startsWith(".abstraction-tree/"));
  if (dogfoodMemory.length) {
    throw new Error(`${packageInfo.name}: packed package includes root dogfooding memory: ${dogfoodMemory.join(", ")}`);
  }

  const forbidden = paths.filter(filePath =>
    packageInfo.forbiddenFiles.some(forbiddenPath => filePath.includes(forbiddenPath))
  );
  forbidden.push(...paths.filter(filePath => packageInfo.forbiddenExactFiles?.includes(filePath)));
  if (forbidden.length) {
    throw new Error(`${packageInfo.name}: packed package includes unintended files: ${forbidden.join(", ")}`);
  }
}

async function createSmokeProject(projectDir, packResults) {
  const tarballByName = new Map(packResults.map(pack => [pack.name, pack.tarball]));
  const packageJson = {
    name: "atree-pack-smoke-project",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: {
      "@abstraction-tree/core": fileSpec(tarballByName.get("@abstraction-tree/core")),
      "@abstraction-tree/app": fileSpec(tarballByName.get("@abstraction-tree/app")),
      "@abstraction-tree/cli": fileSpec(tarballByName.get("@abstraction-tree/cli")),
      "abstraction-tree": fileSpec(tarballByName.get("abstraction-tree"))
    }
  };

  await writeFile(path.join(projectDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  await mkdir(path.join(projectDir, "src"), { recursive: true });
  await writeFile(
    path.join(projectDir, "src", "checkout.ts"),
    [
      "export interface CheckoutItem {",
      "  sku: string;",
      "  quantity: number;",
      "}",
      "",
      "export function calculateCheckoutTotal(items: CheckoutItem[], priceBySku: Map<string, number>) {",
      "  return items.reduce((total, item) => total + (priceBySku.get(item.sku) ?? 0) * item.quantity, 0);",
      "}",
      ""
    ].join("\n")
  );

  await runCommand(process.execPath, npmArgs(["install", "--no-audit", "--no-fund"]), projectDir, "temp project: npm install packed tarballs");
}

async function verifyInstalledLayout(projectDir) {
  const fullPackageDir = path.join(projectDir, "node_modules", "abstraction-tree");
  const cliPackageDir = path.join(projectDir, "node_modules", "@abstraction-tree", "cli");
  const appPackageDir = path.join(projectDir, "node_modules", "@abstraction-tree", "app");

  await verifyPackageBin(fullPackageDir, "abstraction-tree");
  await verifyPackageBin(cliPackageDir, "@abstraction-tree/cli");
  assertFile(path.join(appPackageDir, "dist", "index.html"), "@abstraction-tree/app: installed package is missing dist/index.html");

  for (const binName of ["atree", "abstraction-tree"]) {
    const binPath = path.join(projectDir, "node_modules", ".bin", process.platform === "win32" ? `${binName}.cmd` : binName);
    assertFile(binPath, `temp project: node_modules/.bin/${path.basename(binPath)} was not linked`);
  }
}

async function verifyPackageBin(packageDir, packageName) {
  const packageJsonPath = path.join(packageDir, "package.json");
  assertFile(packageJsonPath, `${packageName}: installed package is missing package.json`);
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  for (const [binName, relativePath] of Object.entries(packageJson.bin ?? {})) {
    assertFile(path.join(packageDir, relativePath), `${packageName}: bin ${binName} points to missing ${relativePath}`);
  }
}

async function runInstalledCommands(projectDir) {
  const installedCli = path.join(projectDir, "node_modules", "@abstraction-tree", "cli", "dist", "index.js");
  await runCommand(process.execPath, [installedCli, "init", "--core"], projectDir, "installed atree init --core");
  await verifyCleanInitializedWorkspace(projectDir);
  await runCommand(process.execPath, [installedCli, "scan"], projectDir, "installed atree scan");
  await verifyProjectLocalScanMemory(projectDir);
  await runCommand(process.execPath, [installedCli, "doctor", "--json"], projectDir, "installed atree doctor --json");
  await runCommand(process.execPath, [installedCli, "validate"], projectDir, "installed atree validate");
  await runCommand(process.execPath, [installedCli, "context", "--target", "checkout"], projectDir, "installed atree context --target checkout");
  await runCommand(process.execPath, [installedCli, "export", "--format", "mermaid"], projectDir, "installed atree export --format mermaid");
  await runCommand(process.execPath, [installedCli, "export", "--format", "dot"], projectDir, "installed atree export --format dot");

  await runUntilOutput(
    process.execPath,
    [path.join(projectDir, "node_modules", "abstraction-tree", "bin", "atree.js"), "serve", "--host", "127.0.0.1", "--port", "0"],
    projectDir,
    "installed abstraction-tree bin serve",
    "Abstraction Tree app:"
  );
}

async function verifyCleanInitializedWorkspace(projectDir) {
  const atreeDir = path.join(projectDir, ".abstraction-tree");
  const entries = (await readdir(atreeDir)).sort();
  assertDeepEqual(entries, ["changes", "config.json", "context-packs"], "installed atree init --core created unexpected starter memory");
  assertFile(path.join(atreeDir, "config.json"), "installed atree init --core did not create config.json");
  assertDirectoryEmpty(path.join(atreeDir, "changes"), "installed atree init --core should start with empty changes/");
  assertDirectoryEmpty(path.join(atreeDir, "context-packs"), "installed atree init --core should start with empty context-packs/");

  for (const forbidden of [
    "tree.json",
    "files.json",
    "concepts.json",
    "invariants.json",
    "import-graph.json",
    "runs",
    "lessons",
    "evaluations",
    "goals",
    "automation"
  ]) {
    if (existsSync(path.join(atreeDir, forbidden))) {
      throw new Error(`installed atree init --core copied forbidden starter memory: .abstraction-tree/${forbidden}`);
    }
  }
}

async function verifyProjectLocalScanMemory(projectDir) {
  const files = JSON.parse(await readFile(path.join(projectDir, ".abstraction-tree", "files.json"), "utf8"));
  const tree = JSON.parse(await readFile(path.join(projectDir, ".abstraction-tree", "tree.json"), "utf8"));
  const filePaths = files.map(file => file.path).sort();
  for (const expected of ["package.json", "src/checkout.ts"]) {
    if (!filePaths.includes(expected)) {
      throw new Error(`installed atree scan did not include smoke project file ${expected}; got ${filePaths.join(", ")}`);
    }
  }
  if (tree.some(node => node.sourceFiles?.some(filePath => filePath.startsWith("packages/core/")))) {
    throw new Error("installed atree scan produced Abstraction Tree repository source ownership in the smoke project");
  }
  for (const forbidden of ["runs", "lessons", "evaluations", "goals", "automation"]) {
    if (existsSync(path.join(projectDir, ".abstraction-tree", forbidden))) {
      throw new Error(`installed atree scan created or copied forbidden dogfooding directory: .abstraction-tree/${forbidden}`);
    }
  }
}

function runCommand(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnCommand(command, args, cwd);
    } catch (error) {
      reject(new Error(`${label} failed to start: ${error.message}`));
      return;
    }
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      reject(new Error(`${label} failed to start: ${error.message}`));
    });
    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}.\n${stdout}\n${stderr}`.trim()));
    });
  });
}

function runUntilOutput(command, args, cwd, label, expectedOutput) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnCommand(command, args, cwd);
    } catch (error) {
      reject(new Error(`${label} failed to start: ${error.message}`));
      return;
    }
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error(`${label} did not print "${expectedOutput}" before timeout.\n${output}`.trim()));
    }, 15000);

    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const finalize = () => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      if (child.exitCode === null) {
        child.once("close", finalize);
        child.kill();
        return;
      }

      finalize();
    };

    const collect = chunk => {
      output += chunk;
      if (output.includes(expectedOutput)) finish();
    };

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", error => finish(new Error(`${label} failed to start: ${error.message}`)));
    child.on("close", code => {
      if (!settled && code !== 0) {
        finish(new Error(`${label} exited with code ${code} before "${expectedOutput}".\n${output}`.trim()));
      }
    });
  });
}

function assertFile(filePath, message) {
  if (!existsSync(filePath)) throw new Error(message);
}

async function assertDirectoryEmpty(directory, message) {
  const entries = await readdir(directory);
  if (entries.length) throw new Error(`${message}: ${entries.join(", ")}`);
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function commandEnv() {
  return {
    ...process.env,
    npm_config_cache: npmCacheDir ?? process.env.npm_config_cache,
    npm_config_update_notifier: "false"
  };
}

function npmArgs(args) {
  return [npmCliPath, ...args];
}

function spawnCommand(command, args, cwd) {
  const invocation = commandInvocation(command, args);
  return spawn(invocation.command, invocation.args, commandOptions(cwd, invocation.windowsVerbatimArguments));
}

function commandInvocation(command, args) {
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command)) {
    const commandLine = [command, ...args].map(quoteCmdArgument).join(" ");
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/c", `"${commandLine}"`],
      windowsVerbatimArguments: true
    };
  }

  return { command, args };
}

function commandOptions(cwd, windowsVerbatimArguments = false) {
  return {
    cwd,
    env: commandEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsVerbatimArguments
  };
}

function quoteCmdArgument(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function fileSpec(filePath) {
  if (!filePath) throw new Error("Missing tarball path while creating smoke project package.json.");
  return pathToFileURL(filePath).href;
}
