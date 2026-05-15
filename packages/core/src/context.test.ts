import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildContextPack, formatContextPackMarkdown } from "./context.js";
import { CONTEXT_PACK_LIMITS } from "./contextLimits.js";
import { evaluateGeneratedMemoryQuality } from "./evaluator.js";
import { buildImportGraph } from "./importGraph.js";
import { routePrompt } from "./promptRouter.js";
import type { Concept, ContextPack, ContextSelectionKind, FileSummary, Invariant, TreeNode } from "./schema.js";
import { scanProject } from "./scanner.js";
import { buildDeterministicTree } from "./treeBuilder.js";

test("buildContextPack pulls concept-related files and nodes into vague target queries", () => {
  const files = [
    file("src/billing/stripe.ts", ["authorizeCharge"], ["createPaymentIntent"]),
    file("src/profile/avatar.ts", ["resizeAvatar"], [])
  ];
  const nodes = [
    node("file.stripe", "Stripe Adapter", "Third party billing adapter.", ["src/billing/stripe.ts"]),
    node("file.avatar", "Avatar", "User profile image handling.", ["src/profile/avatar.ts"])
  ];
  const concepts: Concept[] = [{
    id: "payment",
    title: "Payment",
    summary: "Payment authorization and checkout charge flow.",
    relatedNodeIds: ["file.stripe"],
    relatedFiles: ["src/billing/stripe.ts"],
    tags: ["payment", "billing"],
    evidence: [conceptEvidence("payment", "src/billing/stripe.ts")]
  }];
  const invariants: Invariant[] = [{
    id: "invariant.payment",
    title: "Payment authorization stays explicit",
    description: "Charge creation must preserve authorization boundaries.",
    nodeIds: ["file.stripe"],
    filePaths: ["src/billing/stripe.ts"],
    severity: "high"
  }];

  const pack = buildContextPack({ target: "payment authorization", nodes, files, concepts, invariants, changes: [] });

  assert.deepEqual(pack.relevantNodes.map(n => n.id), ["file.stripe"]);
  assert.deepEqual(pack.relevantFiles.map(f => f.path), ["src/billing/stripe.ts"]);
  assert.deepEqual(pack.relevantConcepts.map(c => c.id), ["payment"]);
  assert.deepEqual(pack.invariants.map(i => i.id), ["invariant.payment"]);
});

test("buildContextPack scores symbols and exports, not just file paths", () => {
  const files = [file("src/ui/form.tsx", ["CheckoutForm"], ["CheckoutForm"])];
  const nodes = [node("file.form", "Form", "UI form component.", ["src/ui/form.tsx"])];

  const pack = buildContextPack({ target: "checkout", nodes, files, concepts: [], invariants: [], changes: [] });

  assert.deepEqual(pack.relevantFiles.map(f => f.path), ["src/ui/form.tsx"]);
});

test("buildContextPack scores and emits node explanations", () => {
  const files = [file("src/scope/guard.ts", ["ScopeGuard"], ["ScopeGuard"])];
  const nodes = [{
    ...node("file.scope.guard", "Scope Guard", "Local guard component.", ["src/scope/guard.ts"]),
    explanation: "This node explains prompt overreach restriction and safe scope boundaries for implementation agents.",
    reasonForExistence: "This node exists so agents can understand why scope control matters before editing.",
    separationLogic: "Children would be partitioned by scope boundary."
  }];

  const pack = buildContextPack({ target: "overreach restriction", nodes, files, concepts: [], invariants: [], changes: [] });
  const markdown = formatContextPackMarkdown(pack);

  assert.deepEqual(pack.relevantNodes.map(n => n.id), ["file.scope.guard"]);
  assert.match(markdown, /Explanation: This node explains prompt overreach restriction/);
  assert.match(markdown, /Reason for existence: This node exists so agents can understand why scope control matters/);
  assert.match(markdown, /Separation logic: Children would be partitioned by scope boundary/);
});

test("buildContextPack uses the project explanation as project summary when available", () => {
  const nodes = [{
    ...node("project.intent", "Project", "Short project summary.", []),
    explanation: "This project explanation describes the purpose in enough detail for agents."
  }];

  const pack = buildContextPack({ target: "project", nodes, files: [], concepts: [], invariants: [], changes: [] });

  assert.equal(pack.projectSummary, "This project explanation describes the purpose in enough detail for agents.");
});

test("buildContextPack falls back to owned files when source files are empty", () => {
  const files = [file("src/legacy/report.ts", ["renderReport"], [])];
  const nodes = [{
    ...node("file.report", "Report", "Legacy report generation.", []),
    ownedFiles: ["src/legacy/report.ts"]
  }];

  const pack = buildContextPack({ target: "report", nodes, files, concepts: [], invariants: [], changes: [] });

  assert.deepEqual(pack.relevantNodes.map(n => n.id), ["file.report"]);
  assert.deepEqual(pack.relevantFiles.map(f => f.path), ["src/legacy/report.ts"]);
});

test("buildContextPack falls back to dependsOn when dependencies are empty", () => {
  const files = [file("src/runtime/task.ts", ["runTask"], [])];
  const nodes = [{
    ...node("file.task", "Task Runner", "Runs background work.", ["src/runtime/task.ts"]),
    dependencies: [],
    dependsOn: ["legacy.scheduler.service"]
  }];

  const pack = buildContextPack({ target: "scheduler service", nodes, files, concepts: [], invariants: [], changes: [] });

  assert.deepEqual(pack.relevantNodes.map(n => n.id), ["file.task"]);
});

test("buildContextPack keeps generated packs below over-broad evaluation thresholds", () => {
  const files = Array.from({ length: 60 }, (_, index) => file(`src/automation/task-${index}.ts`, [`AutomationTask${index}`], []));
  const nodes = files.map((summary, index) =>
    node(`file.automation.${index}`, `Automation ${index}`, "Automation runtime behavior.", [summary.path])
  );
  const concepts = files.map((summary, index): Concept => ({
    id: `automation-${index}`,
    title: `Automation ${index}`,
    summary: "Automation concept.",
    relatedNodeIds: [`file.automation.${index}`],
    relatedFiles: [summary.path],
    tags: ["automation"],
    evidence: [conceptEvidence("automation", summary.path)]
  }));

  const pack = buildContextPack({ target: "automation", nodes, files, concepts, invariants: [], changes: [] });

  assert.equal(pack.relevantNodes.length, CONTEXT_PACK_LIMITS.nodes);
  assert.equal(pack.relevantFiles.length, CONTEXT_PACK_LIMITS.files);
  assert.equal(pack.relevantConcepts.length, CONTEXT_PACK_LIMITS.concepts);
});

test("buildContextPack records scoring diagnostics and nearby exclusions when requested", () => {
  const files = Array.from({ length: CONTEXT_PACK_LIMITS.files + 2 }, (_, index) =>
    file(`src/payment/flow-${index}.ts`, [`PaymentFlow${index}`], [`PaymentFlow${index}`])
  );
  const nodes = Array.from({ length: CONTEXT_PACK_LIMITS.nodes + 2 }, (_, index) =>
    node(`file.payment.${index}`, `Payment ${index}`, "Payment flow behavior.", [files[index % files.length].path])
  );
  const concepts: Concept[] = [{
    id: "payment",
    title: "Payment",
    summary: "Payment flow concept.",
    relatedNodeIds: [nodes[0].id],
    relatedFiles: [files[0].path],
    tags: ["payment"],
    evidence: [conceptEvidence("payment", files[0].path)]
  }];
  const invariants: Invariant[] = [{
    id: "invariant.payment",
    title: "Payment flow remains explicit",
    description: "Payment behavior must preserve explicit flow boundaries.",
    nodeIds: [nodes[0].id],
    filePaths: [files[0].path],
    severity: "high"
  }];

  const pack = buildContextPack({ target: "payment", nodes, files, concepts, invariants, changes: [], includeDiagnostics: true });

  assert.ok(pack.diagnostics);
  assertSelectedDiagnostics(pack, "node", pack.relevantNodes.map(node => node.id));
  assertSelectedDiagnostics(pack, "file", pack.relevantFiles.map(file => file.path));
  assertSelectedDiagnostics(pack, "concept", ["payment"]);
  assertSelectedDiagnostics(pack, "invariant", ["invariant.payment"]);
  assert.ok(pack.diagnostics.excludedNearby.some(item => item.excludedReason === "hard-limit"));
});

test("buildContextPack applies max token budget to selected context items", () => {
  const files = Array.from({ length: 6 }, (_, index) =>
    file(`src/budget/payment-${index}.ts`, [`PaymentBudget${index}`], [`PaymentBudget${index}`])
  );
  const nodes = files.map((summary, index) =>
    node(`file.budget.${index}`, `Payment Budget ${index}`, "Payment budget behavior with enough summary text to cost tokens.", [summary.path])
  );
  const unlimited = buildContextPack({ target: "payment budget", nodes, files, concepts: [], invariants: [], changes: [], includeDiagnostics: true });
  assert.ok(unlimited.diagnostics);
  const baseEstimate = unlimited.diagnostics.estimatedTokens - selectedTokenTotal(unlimited);
  const firstItem = unlimited.diagnostics.selected[0];
  assert.ok(firstItem);

  const budgeted = buildContextPack({
    target: "payment budget",
    nodes,
    files,
    concepts: [],
    invariants: [],
    changes: [],
    maxTokens: baseEstimate + firstItem.estimatedTokens
  });

  assert.ok(budgeted.diagnostics);
  assert.ok(totalSelectedItems(budgeted) < totalSelectedItems(unlimited));
  assert.ok(budgeted.diagnostics.estimatedTokens <= budgeted.diagnostics.maxTokens!);
  assert.ok(budgeted.diagnostics.excludedNearby.some(item => item.excludedReason === "token-budget"));
});

test("buildContextPack preserves representative selected-node files by compacting rich nodes under tight budgets", () => {
  const files = [
    file("backend/middleware/authMiddleware.js", ["protect", "authMiddleware"], ["protect"]),
    file("frontend/package.json", ["dependencies"], [])
  ];
  const nodes = [{
    ...node("architecture.auth.routes", "Authentication Routes", "Authentication middleware protected routes.", [files[0].path]),
    explanation: "Authentication routes coordinate protected backend middleware with frontend goal access. ".repeat(40),
    reasonForExistence: "This node exists so protected-route work starts at the middleware ownership boundary. ".repeat(20),
    separationLogic: "Children are separated by backend route, middleware, controller, and frontend state responsibilities. ".repeat(20)
  }];
  const unlimited = buildContextPack({
    target: "authentication middleware protected routes",
    nodes,
    files,
    concepts: [],
    invariants: [],
    changes: [],
    includeDiagnostics: true
  });
  assert.ok(unlimited.diagnostics);
  const baseEstimate = unlimited.diagnostics.estimatedTokens - selectedTokenTotal(unlimited);
  const fullNode = unlimited.diagnostics.selected.find(item => item.kind === "node" && item.id === "architecture.auth.routes");
  assert.ok(fullNode);

  const budgeted = buildContextPack({
    target: "authentication middleware protected routes",
    nodes,
    files,
    concepts: [],
    invariants: [],
    changes: [],
    maxTokens: baseEstimate + fullNode.estimatedTokens
  });

  assert.deepEqual(budgeted.relevantFiles.map(file => file.path), ["backend/middleware/authMiddleware.js"]);
  assert.equal(budgeted.relevantNodes[0]?.explanation, undefined);
  assert.ok(budgeted.diagnostics);
  assert.ok(budgeted.diagnostics.estimatedTokens <= budgeted.diagnostics.maxTokens!);
  assert.ok(
    budgeted.diagnostics.selected
      .find(item => item.kind === "node" && item.id === "architecture.auth.routes")
      ?.reasons.some(reason => reason.includes("compacted selected node"))
  );
  assert.ok(
    budgeted.diagnostics.selected
      .find(item => item.kind === "file" && item.id === "backend/middleware/authMiddleware.js")
      ?.reasons.some(reason => reason.includes("forced by selected node ownership"))
  );
});

test("buildContextPack ranks Rust traversal source and tests ahead of dependency metadata", () => {
  const files = [
    file(".github/dependabot.yml", ["ignore rules"], []),
    file("Cargo.toml", ["fd dependencies"], []),
    file("README.md", ["hidden files traversal"], []),
    file("src/walk.rs", ["ignore_hidden", "traverse"], []),
    file("tests/tests.rs", ["hidden_files_are_filtered"], [])
  ];
  const nodes = [
    node("module.traversal", "Traversal", "Ignore rules and hidden file traversal.", files.map(summary => summary.path))
  ];

  const pack = buildContextPack({ target: "ignore rules hidden files traversal", nodes, files, concepts: [], invariants: [], changes: [] });

  const paths = pack.relevantFiles.map(file => file.path);
  assert.equal(paths[0], "src/walk.rs");
  assert.ok(paths.indexOf("tests/tests.rs") < paths.indexOf(".github/dependabot.yml"));
  assert.ok(paths.indexOf("README.md") < paths.indexOf("Cargo.toml"));
});

test("buildContextPack ranks Click option parser source and tests ahead of broad docs", () => {
  const files = [
    file("docs/options.rst", ["Options"], []),
    file("pyproject.toml", ["click package"], []),
    file("src/click/parser.py", ["OptionParser", "value_from_envvar", "handle_parse_result"], []),
    file("tests/test_options.py", ["test_envvar_default", "test_option_parser"], [])
  ];
  const nodes = [
    node("module.click.options", "Click Options", "Option parsing envvar default handling.", files.map(summary => summary.path))
  ];

  const pack = buildContextPack({ target: "option parsing envvar default handling", nodes, files, concepts: [], invariants: [], changes: [] });

  const paths = pack.relevantFiles.map(file => file.path);
  assert.ok(paths.indexOf("src/click/parser.py") < paths.indexOf("docs/options.rst"));
  assert.ok(paths.indexOf("tests/test_options.py") < paths.indexOf("docs/options.rst"));
  assert.ok(paths.indexOf("docs/options.rst") < paths.indexOf("pyproject.toml"));
});

test("buildContextPack preserves route-estimated files for the same prompt", () => {
  const files = [
    file("backend/controllers/goalController.js", ["getGoals", "createGoal"], []),
    file("backend/middleware/authMiddleware.js", ["protect"], ["protect"]),
    file("backend/routes/goalRoutes.js", ["goalRoutes", "protect"], []),
    file("frontend/src/features/goals/goalSlice.js", ["goalSlice", "getGoals"], []),
    file("frontend/src/pages/Dashboard.jsx", ["Dashboard"], [])
  ];
  const nodes = [
    node("architecture.local.api.routes", "Local API Routes", "Authentication middleware protected backend goals routes.", [
      "backend/controllers/goalController.js",
      "backend/middleware/authMiddleware.js",
      "backend/routes/goalRoutes.js"
    ]),
    node("architecture.visual.app.ui", "Visual App UI", "Frontend goals dashboard flow.", [
      "frontend/src/features/goals/goalSlice.js",
      "frontend/src/pages/Dashboard.jsx"
    ])
  ];
  const prompt = "Implement authentication middleware protected routes across frontend backend goals dashboard flow";
  const route = routePrompt({ prompt, nodes, files, concepts: [], invariants: [] });

  const pack = buildContextPack({
    target: prompt,
    nodes,
    files,
    concepts: [],
    invariants: [],
    changes: [],
    includeDiagnostics: true
  });

  assert.equal(route.decision, "goal-driven");
  for (const filePath of route.estimatedFiles) {
    assert.ok(pack.relevantFiles.some(summary => summary.path === filePath), `context missing route file ${filePath}`);
  }
  assert.equal(pack.diagnostics?.routeDisagreements?.length ?? 0, 0);
});

test("context-quality benchmarks cover diverse repository findings", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const benchmarkRoot = path.join(root, "examples", "context-quality-benchmarks");
  const fixtures = [
    { projectName: "vite-lite", root: path.join(benchmarkRoot, "vite-lite") },
    { projectName: "click-lite", root: path.join(benchmarkRoot, "click-lite") },
    { projectName: "fd-lite", root: path.join(benchmarkRoot, "fd-lite") },
    { projectName: "rust-book-lite", root: path.join(benchmarkRoot, "rust-book-lite") },
    { projectName: "mern-lite", root: path.join(benchmarkRoot, "mern-lite") }
  ];
  const categories = new Set<string>();

  for (const fixtureProject of fixtures) {
    const fixture = await readBenchmarkFixture(fixtureProject.root);
    for (const expected of fixture.expectedContextPacks ?? []) {
      if (expected.category) categories.add(expected.category);
      assert.ok(expected.expectedFilePaths?.length, `${fixtureProject.projectName} must declare expected context files`);
    }
    for (const expected of fixture.expectedRoutes ?? []) {
      if (expected.category) categories.add(expected.category);
      assert.ok(expected.expectedFilePaths?.length, `${fixtureProject.projectName} must declare expected route files`);
    }

    const scan = await scanProject(fixtureProject.root);
    const importGraph = await buildImportGraph(fixtureProject.root, scan.files);
    const built = buildDeterministicTree(fixtureProject.projectName, scan.files, { importGraph });
    const contextPacks = (fixture.expectedContextPacks ?? []).map(expected =>
      buildContextPack({
        target: expected.target,
        nodes: built.nodes,
        files: built.files,
        concepts: built.concepts,
        invariants: built.invariants,
        changes: [],
        maxTokens: expected.maxTokens,
        includeDiagnostics: true
      })
    );
    for (const expected of fixture.expectedRoutes ?? []) {
      const route = routePrompt({
        prompt: expected.prompt,
        nodes: built.nodes,
        files: built.files,
        concepts: built.concepts,
        invariants: built.invariants
      });
      const routeContext = buildContextPack({
        target: expected.prompt,
        nodes: built.nodes,
        files: built.files,
        concepts: built.concepts,
        invariants: built.invariants,
        changes: [],
        includeDiagnostics: true
      });
      const contextFiles = new Set(routeContext.relevantFiles.map(file => file.path));
      const expectedRouteFiles = route.estimatedFiles.filter(file => expected.expectedFilePaths?.includes(file));
      assert.ok(expectedRouteFiles.length, `${fixtureProject.projectName} route/context benchmark must have route-estimated expected files`);
      for (const filePath of expectedRouteFiles) {
        assert.ok(contextFiles.has(filePath), `${fixtureProject.projectName} route/context agreement missing ${filePath}`);
      }
    }
    const quality = evaluateGeneratedMemoryQuality({
      nodes: built.nodes,
      files: built.files,
      concepts: built.concepts,
      invariants: built.invariants,
      importGraph,
      contextPacks,
      fixture,
      fixturePath: ".abstraction-tree/evaluation-fixture.json"
    });

    assert.deepEqual(
      quality.context.missingExpectedInclusions,
      [],
      benchmarkFailure(fixtureProject.projectName, "context", quality.context.missingExpectedInclusions)
    );
    assert.equal(
      quality.context.passingExpectedContextPackCount,
      quality.context.expectedContextPackCount,
      benchmarkFailure(fixtureProject.projectName, "context", quality.context.missingExpectedInclusions)
    );
    assert.deepEqual(
      quality.routes.decisionMismatches,
      [],
      benchmarkFailure(fixtureProject.projectName, "route decisions", quality.routes.decisionMismatches)
    );
    assert.deepEqual(
      quality.routes.missingExpectedInclusions,
      [],
      benchmarkFailure(fixtureProject.projectName, "route inclusions", quality.routes.missingExpectedInclusions)
    );
    assert.equal(
      quality.routes.passingExpectedRouteCount,
      quality.routes.expectedRouteCount,
      benchmarkFailure(fixtureProject.projectName, "routes", [
        ...quality.routes.decisionMismatches,
        ...quality.routes.missingExpectedInclusions
      ])
    );
  }

  assert.deepEqual([...categories].sort(), [
    "documentation-heavy-mdbook",
    "large-js-ts-monorepo",
    "mixed-react-express-mongo-app",
    "python-utility-library",
    "rust-cli-project"
  ]);
});

test("formatContextPackMarkdown emits markdown context packs", () => {
  const files = [file("src/ui/form.tsx", ["CheckoutForm"], ["CheckoutForm"])];
  const nodes = [{
    ...node("file.form", "Form", "UI form component.", ["src/ui/form.tsx"]),
    explanation: "Checkout form node explanation for context markdown.",
    reasonForExistence: "Checkout form exists so checkout UI scope can be reviewed before editing."
  }];
  const pack = buildContextPack({ target: "checkout", nodes, files, concepts: [], invariants: [], changes: [], includeDiagnostics: true });

  const markdown = formatContextPackMarkdown(pack);

  assert.match(markdown, /^# Context Pack: checkout/);
  assert.match(markdown, /## Relevant Files/);
  assert.match(markdown, /`src\/ui\/form.tsx`/);
  assert.match(markdown, /Explanation:/);
  assert.match(markdown, /Reason for existence:/);
  assert.match(markdown, /## Why/);
});

function file(path: string, symbols: string[], exports: string[]): FileSummary {
  return {
    path,
    extension: ".ts",
    language: "TypeScript",
    parseStrategy: "typescript-ast",
    sizeBytes: 120,
    lines: 6,
    imports: [],
    exports,
    symbols,
    isTest: false,
    summary: `${path} summary.`,
    ownedByNodeIds: []
  };
}

function node(id: string, title: string, summary: string, sourceFiles: string[]): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: "component",
    level: "component",
    summary,
    explanation: `${title} explains ownership, dependencies, and safe edits for context-pack consumers.`,
    reasonForExistence: `${title} exists to explain why this scope boundary belongs in the tree.`,
    separationLogic: "Children are partitioned by the narrowest available context boundary.",
    children: [],
    sourceFiles,
    ownedFiles: sourceFiles,
    responsibilities: [summary],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: { allowedToChange: sourceFiles, mustNotChange: [] },
    confidence: 0.8
  };
}

function conceptEvidence(term: string, filePath: string): Concept["evidence"][number] {
  return {
    kind: "symbol",
    filePath,
    value: term,
    term,
    score: 3
  };
}

function assertSelectedDiagnostics(pack: ContextPack, kind: ContextSelectionKind, ids: string[]): void {
  for (const id of ids) {
    const diagnostic = pack.diagnostics?.selected.find(item => item.kind === kind && item.id === id);
    assert.ok(diagnostic, `missing selected diagnostic for ${kind} ${id}`);
    assert.ok(diagnostic.estimatedTokens > 0);
    assert.ok(diagnostic.reasons.length > 0);
  }
}

function selectedTokenTotal(pack: ContextPack): number {
  return pack.diagnostics?.selected.reduce((sum, item) => sum + item.estimatedTokens, 0) ?? 0;
}

function totalSelectedItems(pack: ContextPack): number {
  return pack.relevantNodes.length + pack.relevantFiles.length + pack.relevantConcepts.length + pack.invariants.length + pack.recentChanges.length;
}

interface BenchmarkFixture {
  expectedContextPacks?: Array<{
    target: string;
    category?: string;
    maxTokens?: number;
    expectedFilePaths?: string[];
  }>;
  expectedRoutes?: Array<{
    prompt: string;
    category?: string;
    expectedFilePaths?: string[];
  }>;
}

async function readBenchmarkFixture(projectRoot: string): Promise<BenchmarkFixture> {
  const raw = await readFile(path.join(projectRoot, ".abstraction-tree", "evaluation-fixture.json"), "utf8");
  return JSON.parse(raw) as BenchmarkFixture;
}

function benchmarkFailure(projectName: string, area: string, issues: string[]): string {
  return `${projectName} ${area} benchmark failed${issues.length ? `: ${issues.join("; ")}` : ""}`;
}
