#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { createServer } from "node:http";
import sirv from "sirv";
import {
  atreePath,
  buildContextPack,
  formatContextPackMarkdown,
  buildImportGraph,
  buildDeterministicTree,
  ensureWorkspace,
  formatRuntimeValidationIssue,
  writeEvaluationReport,
  readConfig,
  readChangeRecords,
  readConcepts,
  readFileSummaries,
  readInvariants,
  readTreeNodes,
  scanProject,
  setInstallMode,
  writeJson,
  RuntimeSchemaValidationError,
  type ChangeRecord,
  type InstallMode
} from "@abstraction-tree/core";
import { loadApiAgentHealth, loadApiState } from "./apiState.js";
import { runChangeReviewCommand } from "./changeReviewCommand.js";
import { collectValidationIssues, doctorExitCode, findVisualAppDist, formatDoctorReport, runDoctor } from "./doctor.js";
import { runGoalCommand } from "./goalCommand.js";
import { formatMigrationResult, migrationExitCode, runMigrateCommand } from "./migrate.js";
import { runProposeCommand } from "./propose.js";
import { runRouteCommand } from "./routeCommand.js";
import { formatServeUrl, selectServeHost } from "./serveHost.js";
import { runScopeCheckCommand, runScopeCreateCommand } from "./scopeCommand.js";

const program = new Command();
program.name("atree").description("Build and visualize an abstraction tree for a codebase.").version("0.1.0");

function projectPath(input?: string) {
  return path.resolve(input ?? process.cwd());
}

type ContextOutputFormat = "json" | "markdown";

function contextOutputFormat(input: unknown): ContextOutputFormat | undefined {
  return input === "json" || input === "markdown" ? input : undefined;
}

function contextMaxTokens(input: unknown): number | undefined {
  if (input === undefined) return undefined;
  const parsed = Number(input);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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
    const importGraph = await buildImportGraph(root, scan.files);
    const built = buildDeterministicTree(config.projectName, scan.files, { importGraph });
    await writeJson(atreePath(root, "files.json"), built.files);
    await writeJson(atreePath(root, "import-graph.json"), importGraph);
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
      filesChanged: [".abstraction-tree/files.json", ".abstraction-tree/import-graph.json", ".abstraction-tree/ontology.json", ".abstraction-tree/tree.json", ".abstraction-tree/concepts.json", ".abstraction-tree/invariants.json"],
      invariantsPreserved: ["invariant.tree-updated-after-change"],
      risk: "low"
    };
    await writeJson(atreePath(root, "changes", `${change.id}.json`), change);
    console.log(`Scanned ${built.files.length} files and built ${built.nodes.length} tree nodes.`);
  });

program.command("validate")
  .description("Validate tree/file alignment")
  .option("-p, --project <path>", "project root")
  .option("--strict", "treat warnings as validation failures")
  .action(async opts => {
    const root = projectPath(opts.project);
    const issues = await collectValidationIssues(root);
    if (!issues.length) {
      console.log("No validation issues found.");
      return;
    }
    for (const i of issues) console.log(formatRuntimeValidationIssue(i));
    process.exitCode = issues.some(i => i.severity === "error" || (opts.strict && i.severity === "warning")) ? 1 : 0;
  });

program.command("doctor")
  .description("Diagnose installation, memory, runtime boundaries, and validation readiness")
  .option("-p, --project <path>", "project root")
  .option("--json", "print machine-readable diagnostics")
  .option("--strict", "treat warnings as failures")
  .action(async opts => {
    const root = projectPath(opts.project);
    const report = await runDoctor(root);
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else process.stdout.write(formatDoctorReport(report));
    process.exitCode = doctorExitCode(report, Boolean(opts.strict));
  });

program.command("migrate")
  .description("Plan and apply .abstraction-tree schema migrations")
  .option("-p, --project <path>", "project root")
  .option("--dry-run", "print the migration plan without writing files")
  .option("--from <version>", "expected source schema version")
  .option("--to <version>", "target schema version")
  .action(async opts => {
    const root = projectPath(opts.project);
    const result = await runMigrateCommand({
      projectRoot: root,
      dryRun: Boolean(opts.dryRun),
      fromVersion: opts.from,
      toVersion: opts.to
    });
    process.stdout.write(formatMigrationResult(result));
    process.exitCode = migrationExitCode(result);
  });

program.command("context")
  .description("Generate a compact context pack for an agent")
  .option("-p, --project <path>", "project root")
  .option("--format <format>", "output format: json or markdown", "json")
  .option("--max-tokens <n>", "approximate token budget for selected context items")
  .option("--why", "include selection diagnostics and nearby excluded candidates")
  .requiredOption("-t, --target <query>", "target feature, concept, or file")
  .action(async opts => {
    const format = contextOutputFormat(opts.format);
    if (!format) {
      console.error("Context format must be either `json` or `markdown`.");
      process.exitCode = 1;
      return;
    }
    const maxTokens = contextMaxTokens(opts.maxTokens);
    if (opts.maxTokens !== undefined && maxTokens === undefined) {
      console.error("Context max tokens must be a positive integer.");
      process.exitCode = 1;
      return;
    }
    const root = projectPath(opts.project);
    const nodes = await readTreeNodes(root);
    const files = await readFileSummaries(root);
    const concepts = await readConcepts(root);
    const invariants = await readInvariants(root);
    const changes = await readChangeRecords(root);
    const pack = buildContextPack({
      target: opts.target,
      nodes,
      files,
      concepts,
      invariants,
      changes,
      maxTokens,
      includeDiagnostics: Boolean(opts.why)
    });
    const out = atreePath(root, "context-packs", `${pack.id}.json`);
    await writeJson(out, pack);
    if (format === "markdown") process.stdout.write(formatContextPackMarkdown(pack));
    else console.log(JSON.stringify(pack, null, 2));
  });

program.command("propose")
  .description("Run an explicit LLM provider adapter and save validated proposal output for review")
  .option("-p, --project <path>", "project root")
  .requiredOption("--provider <name>", "provider adapter name")
  .option("--adapter <path>", "ESM adapter module path; defaults to adapters/<provider>/index.mjs when present")
  .option("--input <path>", "optional provider input file passed to the adapter")
  .action(async opts => {
    const root = projectPath(opts.project);
    const result = await runProposeCommand({
      projectRoot: root,
      provider: opts.provider,
      adapter: opts.adapter,
      input: opts.input
    });
    console.log(`Wrote proposal to ${path.relative(root, result.proposalPath).replaceAll(path.sep, "/")}`);
    console.log(`Validation: ${result.validation.status} (${result.validation.errorCount} errors, ${result.validation.warningCount} warnings).`);
    for (const issue of result.validation.issues) console.log(formatRuntimeValidationIssue(issue));
    if (result.validation.errorCount) process.exitCode = 1;
  });

program.command("evaluate")
  .description("Generate deterministic evaluation metrics")
  .option("-p, --project <path>", "project root")
  .action(async opts => {
    const root = projectPath(opts.project);
    const { report, filePath } = await writeEvaluationReport(root);
    console.log(`Wrote evaluation report to ${path.relative(root, filePath).replaceAll(path.sep, "/")}`);
    console.log(JSON.stringify(report, null, 2));
  });

program.command("goal")
  .description("Compile a complex user goal into assessment, affected-tree mapping, and bounded missions")
  .option("-p, --project <path>", "project root")
  .requiredOption("--file <path>", "Markdown file containing the original user goal")
  .option("--plan-only", "create the goal workspace and mission plan without execution")
  .option("--review-required", "create the plan and print the mission runner commands")
  .option("--full-auto", "plan the goal, then run missions when safe runner integration is available")
  .option("--create-pr", "write a draft PR body without pushing or merging")
  .option("--auto-route", "route the prompt before goal planning and stop when goal-driven planning is not recommended")
  .option("--force-goal", "force goal planning even when auto-route recommends another workflow")
  .action(async opts => {
    const root = projectPath(opts.project);
    process.exitCode = await runGoalCommand({
      projectRoot: root,
      file: opts.file,
      planOnly: Boolean(opts.planOnly),
      reviewRequired: Boolean(opts.reviewRequired),
      fullAuto: Boolean(opts.fullAuto),
      createPr: Boolean(opts.createPr),
      autoRoute: Boolean(opts.autoRoute),
      forceGoal: Boolean(opts.forceGoal)
    });
  });

program.command("route")
  .description("Classify a prompt as direct, goal-driven, assessment-pack, or manual-review")
  .option("-p, --project <path>", "project root")
  .option("--file <path>", "Markdown file containing the prompt to route")
  .option("--text <text>", "prompt text to route")
  .option("--json", "print machine-readable routing output")
  .option("--explain", "include affected node, concept, and file estimates in readable output")
  .action(async opts => {
    const root = projectPath(opts.project);
    process.exitCode = await runRouteCommand({
      projectRoot: root,
      file: opts.file,
      text: opts.text,
      json: Boolean(opts.json),
      explain: Boolean(opts.explain)
    });
  });

const changesCommand = program.command("changes")
  .description("Inspect semantic change records");

changesCommand.command("review")
  .description("List generated scan change records eligible for consolidation")
  .option("-p, --project <path>", "project root")
  .option("--summary", "print compact counts instead of generated scan record details")
  .option("--limit <n>", "limit generated scan record details in the full report")
  .action(async opts => {
    const root = projectPath(opts.project);
    process.exitCode = await runChangeReviewCommand({
      projectRoot: root,
      summary: Boolean(opts.summary),
      limit: opts.limit
    });
  });

const scopeCommand = program.command("scope")
  .description("Create and check prompt scope contracts for overreach control")
  .option("-p, --project <path>", "project root")
  .option("--prompt <text>", "user prompt to map into an abstraction-tree scope contract")
  .option("--json", "print machine-readable JSON")
  .action(async opts => {
    if (!opts.prompt) {
      console.error("Use `atree scope --prompt \"...\"` or `atree scope check`.");
      process.exitCode = 1;
      return;
    }
    const root = projectPath(opts.project);
    process.exitCode = await runScopeCreateCommand({
      projectRoot: root,
      prompt: opts.prompt,
      json: Boolean(opts.json)
    });
  });

scopeCommand.command("check")
  .description("Compare the current Git diff against a scope contract")
  .option("-p, --project <path>", "project root")
  .option("--scope <path>", "scope JSON path, or `latest`", "latest")
  .option("--json", "print machine-readable JSON")
  .action(async opts => {
    const root = projectPath(opts.project);
    process.exitCode = await runScopeCheckCommand({
      projectRoot: root,
      scope: opts.scope,
      json: Boolean(opts.json)
    });
  });

program.command("serve")
  .description("Serve the visual app locally")
  .option("-p, --project <path>", "project root")
  .option("--port <number>", "port; defaults to config visualApp.defaultPort or 4317")
  .option("--host <host>", "host to bind; defaults to 127.0.0.1")
  .action(async opts => {
    const root = projectPath(opts.project);
    const config = await readConfig(root);
    const port = Number(opts.port ?? config.visualApp?.defaultPort ?? 4317);
    const { host, warning } = selectServeHost(opts.host);
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
        const state = await loadApiState(root, projectRoot => loadApiAgentHealth(projectRoot, collectValidationIssues));
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(state));
        return;
      }
      serveStatic(req, res, () => fallback(res));
    });
    if (warning) console.warn(warning);
    server.listen(port, host, () => console.log(`Abstraction Tree app: ${formatServeUrl(host, port)}`));
  });

function fallback(res: import("node:http").ServerResponse) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html");
  res.end(`<html><body><h1>Abstraction Tree</h1><p>The app bundle was found, but the requested route did not resolve.</p><p>API state is available at <a href="/api/state">/api/state</a>.</p></body></html>`);
}

program.parseAsync().catch(error => {
  if (error instanceof RuntimeSchemaValidationError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  throw error;
});
