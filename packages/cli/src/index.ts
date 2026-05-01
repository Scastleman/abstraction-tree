#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import {
  atreePath,
  buildContextPack,
  buildDeterministicTree,
  ensureWorkspace,
  readConfig,
  readJson,
  scanProject,
  setInstallMode,
  validateTree,
  writeJson,
  type ChangeRecord,
  type AbstractionOntologyLevel,
  type Concept,
  type FileSummary,
  type InstallMode,
  type Invariant,
  type TreeNode
} from "@abstraction-tree/core";

const program = new Command();
program.name("atree").description("Build and visualize an abstraction tree for a codebase.").version("0.1.0");

function projectPath(input?: string) {
  return path.resolve(input ?? process.cwd());
}

program.command("init")
  .description("Create .abstraction-tree workspace")
  .option("-p, --project <path>", "project root")
  .option("--core", "initialize in core-only mode")
  .option("--with-app", "initialize in full mode with the visual app enabled")
  .action(async opts => {
    const root = projectPath(opts.project);
    const mode: InstallMode = opts.withApp ? "full" : "core";
    await ensureWorkspace(root, { installMode: mode });
    console.log(`Initialized Abstraction Tree in ${atreePath(root)} (${mode} mode).`);
    if (mode === "core") {
      console.log("Core-only mode writes .abstraction-tree data and supports scan, validate, and context commands.");
      console.log("Install the full package or run `atree mode full` when you want to enable the visual app.");
    }
  });

program.command("mode")
  .description("Switch between core-only and full visual-app mode")
  .argument("<mode>", "core or full")
  .option("-p, --project <path>", "project root")
  .action(async (modeInput: string, opts) => {
    if (!["core", "full"].includes(modeInput)) {
      console.error("Mode must be either `core` or `full`.");
      process.exitCode = 1;
      return;
    }
    const mode = modeInput as InstallMode;
    const root = projectPath(opts.project);
    await setInstallMode(root, mode);
    console.log(`Abstraction Tree mode is now ${mode}.`);
  });

program.command("scan")
  .description("Scan files and build the initial abstraction tree")
  .option("-p, --project <path>", "project root")
  .action(async opts => {
    const root = projectPath(opts.project);
    await ensureWorkspace(root);
    const config = await readConfig(root);
    const scan = await scanProject(root);
    const built = buildDeterministicTree(config.projectName, scan.files);
    await writeJson(atreePath(root, "files.json"), built.files);
    await writeJson(atreePath(root, "ontology.json"), built.ontology);
    await writeJson(atreePath(root, "tree.json"), built.nodes);
    await writeJson(atreePath(root, "concepts.json"), built.concepts);
    await writeJson(atreePath(root, "invariants.json"), built.invariants);
    const change: ChangeRecord = {
      id: `scan.${Date.now()}`,
      timestamp: new Date().toISOString(),
      title: "Deterministic scan",
      reason: "Generated abstraction tree from project files, imports, symbols, tests, and folders.",
      affectedNodeIds: ["project.intent", "project.architecture", "project.code"],
      filesChanged: [".abstraction-tree/files.json", ".abstraction-tree/ontology.json", ".abstraction-tree/tree.json", ".abstraction-tree/concepts.json", ".abstraction-tree/invariants.json"],
      invariantsPreserved: ["invariant.tree-updated-after-change"],
      risk: "low"
    };
    await writeJson(atreePath(root, "changes", `${change.id}.json`), change);
    console.log(`Scanned ${built.files.length} files and built ${built.nodes.length} tree nodes.`);
  });

program.command("validate")
  .description("Validate tree/file alignment")
  .option("-p, --project <path>", "project root")
  .action(async opts => {
    const root = projectPath(opts.project);
    const ontology = await readJson<AbstractionOntologyLevel[]>(atreePath(root, "ontology.json"), []);
    const nodes = await readJson<TreeNode[]>(atreePath(root, "tree.json"), []);
    const files = await readJson<FileSummary[]>(atreePath(root, "files.json"), []);
    const issues = validateTree(nodes, files, ontology);
    if (!issues.length) {
      console.log("No validation issues found.");
      return;
    }
    for (const i of issues) console.log(`[${i.severity}] ${i.message}${i.filePath ? ` (${i.filePath})` : ""}`);
    process.exitCode = issues.some(i => i.severity === "error") ? 1 : 0;
  });

program.command("context")
  .description("Generate a compact context pack for an agent")
  .option("-p, --project <path>", "project root")
  .requiredOption("-t, --target <query>", "target feature, concept, or file")
  .action(async opts => {
    const root = projectPath(opts.project);
    const nodes = await readJson<TreeNode[]>(atreePath(root, "tree.json"), []);
    const files = await readJson<FileSummary[]>(atreePath(root, "files.json"), []);
    const concepts = await readJson<Concept[]>(atreePath(root, "concepts.json"), []);
    const invariants = await readJson<Invariant[]>(atreePath(root, "invariants.json"), []);
    const changes = await loadChanges(root);
    const pack = buildContextPack({ target: opts.target, nodes, files, concepts, invariants, changes });
    const out = atreePath(root, "context-packs", `${pack.id}.json`);
    await writeJson(out, pack);
    console.log(JSON.stringify(pack, null, 2));
  });

program.command("serve")
  .description("Serve the visual app locally")
  .option("-p, --project <path>", "project root")
  .option("--port <number>", "port; defaults to config visualApp.defaultPort or 4317")
  .action(async opts => {
    const root = projectPath(opts.project);
    const config = await readConfig(root);
    const port = Number(opts.port ?? config.visualApp?.defaultPort ?? 4317);
    const appDist = findVisualAppDist();
    if (!appDist) {
      console.error("The visual app is not installed or has not been built.");
      console.error("Use full mode with `npm install -D abstraction-tree`, or from the repo run `npm run build -w @abstraction-tree/app`.");
      console.error("Core commands still work: `atree scan`, `atree validate`, and `atree context`.");
      process.exitCode = 1;
      return;
    }
    if (config.installMode !== "full" || !config.visualApp?.enabled) {
      console.log("Visual app is available, but this project is in core mode. Enabling full mode for this workspace.");
      await setInstallMode(root, "full");
    }
    const serveStatic = sirv(appDist, { dev: true });
    const server = createServer(async (req, res) => {
      if (!req.url) return res.end();
      if (req.url.startsWith("/api/state")) {
        const state = {
          config: await readConfig(root),
          ontology: await readJson(atreePath(root, "ontology.json"), []),
          nodes: await readJson<TreeNode[]>(atreePath(root, "tree.json"), []),
          files: await readJson<FileSummary[]>(atreePath(root, "files.json"), []),
          concepts: await readJson<Concept[]>(atreePath(root, "concepts.json"), []),
          invariants: await readJson<Invariant[]>(atreePath(root, "invariants.json"), []),
          changes: await loadChanges(root)
        };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(state));
        return;
      }
      serveStatic(req, res, () => fallback(res));
    });
    server.listen(port, () => console.log(`Abstraction Tree app: http://localhost:${port}`));
  });

function findVisualAppDist(): string | undefined {
  const cliDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "packages/app/dist"),
    path.resolve(process.cwd(), "node_modules/@abstraction-tree/app/dist"),
    path.resolve(cliDir, "../../app/dist"),
    path.resolve(cliDir, "../../../app/dist"),
    path.resolve(cliDir, "../../@abstraction-tree/app/dist")
  ];
  return candidates.find(existsSync);
}

async function loadChanges(root: string): Promise<ChangeRecord[]> {
  const dir = atreePath(root, "changes");
  if (!existsSync(dir)) return [];
  const fs = await import("node:fs/promises");
  const names = await fs.readdir(dir).catch(() => []);
  const out: ChangeRecord[] = [];
  for (const name of names.filter(n => n.endsWith(".json"))) {
    const raw = await readFile(path.join(dir, name), "utf8").catch(() => "");
    if (raw) out.push(JSON.parse(raw));
  }
  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function fallback(res: import("node:http").ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html");
  res.end(`<html><body><h1>Abstraction Tree</h1><p>The app bundle was found, but the requested route did not resolve.</p><p>API state is available at <a href="/api/state">/api/state</a>.</p></body></html>`);
}

program.parseAsync();
