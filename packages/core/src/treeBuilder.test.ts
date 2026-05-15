import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicTree } from "./treeBuilder.js";
import type { FileSummary, ImportGraph } from "./schema.js";

test("buildDeterministicTree infers concepts from repo-specific paths and symbols", () => {
  const result = buildDeterministicTree("billing-app", [
    file("src/billing/invoice.ts", ["InvoiceLedger"], ["createInvoice"]),
    file("tests/invoice.test.ts", ["InvoiceLedger"], [])
  ]);

  const concept = result.concepts.find(c => c.id === "invoice");

  assert.ok(concept);
  assert.equal(concept.title, "Invoice");
  assert.deepEqual(concept.relatedFiles, ["src/billing/invoice.ts", "tests/invoice.test.ts"]);
  assert.ok(concept.relatedNodeIds.includes("file.src.billing.invoice.ts"));
  assertIncludes(concept.evidence.map(evidence => evidence.kind), ["path", "symbol", "export"]);
});

test("buildDeterministicTree uses README purpose for the root project node", () => {
  const result = buildDeterministicTree("demo-project", [
    file("README.md", [], [], [], {
      extension: ".md",
      language: "Markdown",
      parseStrategy: "regex",
      summary: "Demo Project helps agents understand code before making changes."
    })
  ]);

  const root = result.nodes.find(node => node.id === "project.intent");

  assert.equal(root?.summary, "Demo Project helps agents understand code before making changes.");
});

test("buildDeterministicTree generates human-readable explanations for high-level and ownership nodes", () => {
  const result = buildDeterministicTree("demo-project", [
    file("src/app.ts", ["AppShell"], ["AppShell"], ["./runtime"]),
    file("src/runtime.ts", ["runApp"], ["runApp"])
  ]);
  const nodes = new Map(result.nodes.map(candidate => [candidate.id, candidate]));

  assert.match(nodes.get("project.intent")?.explanation ?? "", /project-level purpose/i);
  assert.match(nodes.get("project.intent")?.reasonForExistence ?? "", /durable purpose/i);
  assert.match(nodes.get("project.architecture")?.explanation ?? "", /runtime and package architecture/i);
  assert.match(nodes.get("project.code")?.explanation ?? "", /concrete package, folder, and file ownership/i);
  assert.match(nodes.get("module.src")?.explanation ?? "", /Owned files include src\/app\.ts/);
  assert.match(nodes.get("file.src.app.ts")?.explanation ?? "", /Important symbols include AppShell/);
  assert.match(nodes.get("project.intent")?.separationLogic ?? "", /human-facing subsystem ownership/i);
  assert.match(nodes.get("module.src")?.separationLogic ?? "", /one scanned file per node/i);
  assert.equal(nodes.get("file.src.app.ts")?.separationLogic, undefined);
});

test("buildDeterministicTree puts inferred human subsystems at the first layer", () => {
  const files = [
    file("package.json"),
    file("packages/core/package.json"),
    file("packages/core/src/index.ts", [], ["scanProject"], ["./scanner.js", "./treeBuilder.js", "./context.js"]),
    file("packages/core/src/scanner.ts", ["scanProject"], ["scanProject"], ["node:fs/promises", "ignore", "typescript"]),
    file("packages/core/src/treeBuilder.ts", ["buildDeterministicTree"], ["buildDeterministicTree"], ["node:path"]),
    file("packages/core/src/goal.ts", ["buildGoalWorkspacePlan"], ["buildGoalWorkspacePlan"]),
    file("packages/core/src/promptRouter.ts", ["routePrompt"], ["routePrompt"]),
    file("packages/core/src/runtimeSchema.ts", ["validateRuntimeSchema"], ["validateRuntimeSchema"]),
    file("packages/core/src/evaluator.ts", ["evaluateProject"], ["evaluateProject"]),
    file("packages/core/src/treeBuilder.test.ts", ["buildDeterministicTree"], []),
    file("packages/cli/package.json"),
    file("packages/cli/src/index.ts", ["program"], [], ["commander", "node:http", "sirv", "@abstraction-tree/core"]),
    file("packages/app/package.json"),
    file("packages/app/src/main.tsx", ["App"], [], ["react", "react-dom/client", "lucide-react"]),
    file("packages/app/src/styles.css", [], []),
    file("packages/full/package.json"),
    file("packages/full/bin/atree.js", [], [], ["@abstraction-tree/cli"]),
    markdownFile("README.md"),
    markdownFile("docs/MISSION_RUNNER.md"),
    markdownFile("docs/DATA_MODEL.md"),
    file("scripts/run-missions.mjs", [], []),
    file("scripts/lint.mjs", [], [])
  ];

  const result = buildDeterministicTree("abstraction-tree", files, { importGraph: monorepoImportGraph() });
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  const root = nodes.get("project.intent");
  const indexes = nodes.get("project.indexes");

  assert.ok(root);
  assert.ok(indexes);
  assertIncludes(root.children, [
    "subsystem.visual.app",
    "subsystem.core.engine",
    "subsystem.cli.local.api",
    "subsystem.goal.mission.automation",
    "subsystem.memory.validation.logs",
    "subsystem.docs.examples",
    "subsystem.packaging.adapters",
    "subsystem.tests.quality",
    "project.indexes"
  ]);
  assertIncludes(indexes.children, ["project.domain", "project.architecture", "project.code"]);
  assert.equal(nodes.get("project.domain")?.parent, "project.indexes");
  assert.match(nodes.get("subsystem.visual.app")?.explanation ?? "", /human subsystem/i);
  assert.match(nodes.get("subsystem.visual.app")?.reasonForExistence ?? "", /inspectable by humans/i);
  assertIncludes(nodes.get("subsystem.visual.app")?.children ?? [], [
    "subsystem.visual.app.slice.app.shell.state",
    "subsystem.visual.app.slice.styling"
  ]);
  assertIncludes(nodes.get("subsystem.visual.app.slice.app.shell.state")?.children ?? [], [
    "subsystem.visual.app.file.packages.app.src.main.tsx"
  ]);
  assert.match(nodes.get("subsystem.visual.app.slice.app.shell.state")?.explanation ?? "", /responsibility slice/i);
  assert.match(nodes.get("subsystem.visual.app.file.packages.app.src.main.tsx")?.explanation ?? "", /file leaf/i);
  assert.match(nodes.get("project.indexes")?.separationLogic ?? "", /index style/i);
  assertIncludes(result.files.find(candidate => candidate.path === "packages/app/src/main.tsx")?.ownedByNodeIds ?? [], [
    "subsystem.visual.app",
    "subsystem.visual.app.slice.app.shell.state",
    "subsystem.visual.app.file.packages.app.src.main.tsx"
  ]);
  assertIncludes(result.files.find(candidate => candidate.path === "packages/core/src/treeBuilder.ts")?.ownedByNodeIds ?? [], [
    "subsystem.core.engine",
    "subsystem.core.engine.slice.understanding.pipeline",
    "subsystem.core.engine.file.packages.core.src.treebuilder.ts"
  ]);
});

test("buildDeterministicTree does not invent an app subsystem without app evidence", () => {
  const result = buildDeterministicTree("library", [
    file("src/engine.ts", ["runEngine"], ["runEngine"]),
    file("src/engine.test.ts", ["runEngine"], []),
    markdownFile("README.md")
  ]);

  assert.equal(result.nodes.some(node => node.id === "subsystem.visual.app"), false);
  assert.ok(result.nodes.some(node => node.id === "project.indexes"));
});

test("buildDeterministicTree keeps repo concept fixtures stable and filters documentation filler", () => {
  const result = buildDeterministicTree("abstraction-tree", [
    file("packages/core/src/importGraph.ts", ["ImportGraph", "ImportGraphEdge", "buildImportGraph"], ["buildImportGraph"]),
    file("packages/core/src/importGraph.test.ts", ["ImportGraph", "ImportGraphEdge"], []),
    file("packages/core/src/runtimeSchema.ts", ["RuntimeSchemaKind", "RuntimeSchemaValidationError", "validateRuntimeSchema"], ["validateRuntimeSchema"]),
    file("packages/core/src/runtimeSchema.test.ts", ["RuntimeSchemaValidationError"], []),
    file("packages/core/src/context.ts", ["ContextPack", "buildContextPack"], ["buildContextPack"]),
    file("packages/core/src/context.test.ts", ["ContextPack"], []),
    file("packages/core/src/changeReview.ts", ["ChangeRecord", "reviewChangeRecords"], ["reviewChangeRecords"]),
    file("packages/core/src/changeReview.test.ts", ["ChangeRecord"], []),
    file("src/services/orders.ts", ["OrdersLedger", "createOrder"], ["createOrder"]),
    file("tests/order.test.ts", ["OrderLedger"], []),
    markdownFile("docs/payment-guide.md"),
    markdownFile("docs/payment-overview.md"),
    markdownFile("docs/usage-notes.md")
  ]);

  const concepts = new Map(result.concepts.map(concept => [concept.id, concept]));
  assertExpectedConcepts(concepts, ["change.record", "context.pack", "import.graph", "order", "runtime.schema"]);
  assertAbsentConcepts(concepts, ["guide", "mjs", "note", "orders", "overview", "payment", "read", "record", "root", "usage"]);

  assertIncludes(concepts.get("import.graph")?.relatedFiles ?? [], [
    "packages/core/src/importGraph.test.ts",
    "packages/core/src/importGraph.ts"
  ]);
  assertIncludes(concepts.get("runtime.schema")?.evidence.map(evidence => evidence.kind) ?? [], ["path", "symbol", "export"]);
  assertIncludes(concepts.get("order")?.relatedFiles ?? [], ["src/services/orders.ts", "tests/order.test.ts"]);

  for (const concept of concepts.values()) {
    assert.ok(concept.evidence.length > 0, `Expected ${concept.id} to include evidence`);
  }
});

test("buildDeterministicTree applies configured subsystem patterns", () => {
  const result = buildDeterministicTree("ops-tool", [
    file("src/commands/reconcile.command.ts", ["ReconcileCommand"], ["runReconcile"]),
    file("src/runtime/worker.ts", ["Worker"], ["runWorker"])
  ], {
    config: {
      subsystemPatterns: [{
        id: "subsystem.cli.commands",
        title: "Configured CLI Commands",
        summary: "Command handlers supplied by project configuration.",
        paths: ["src/commands/**"],
        fileNames: ["*.command.ts"],
        priority: 50,
        weight: 0.2,
        responsibilities: ["Own project-specific CLI command handlers."]
      }]
    }
  });
  const nodes = new Map(result.nodes.map(node => [node.id, node]));

  assert.ok(nodes.has("subsystem.cli.commands"));
  assert.deepEqual(nodes.get("subsystem.cli.commands")?.sourceFiles, ["src/commands/reconcile.command.ts"]);
  assertIncludes(nodes.get("project.intent")?.children ?? [], ["subsystem.cli.commands"]);
  assertIncludes(result.files.find(candidate => candidate.path === "src/commands/reconcile.command.ts")?.ownedByNodeIds ?? [], [
    "subsystem.cli.commands",
    "subsystem.cli.commands.file.src.commands.reconcile.command.ts"
  ]);
});

test("buildDeterministicTree applies configured domain vocabulary and concept weights", () => {
  const result = buildDeterministicTree("inventory", [
    file("src/catalog/sku.ts", ["SkuLedger"], ["createSku"]),
    file("src/orders/order.ts", ["OrderLedger"], ["createOrder"]),
    file("tests/order.test.ts", ["OrderLedger"], [])
  ], {
    config: {
      domainVocabulary: [{
        concept: "inventory",
        synonyms: ["sku"],
        weight: 20
      }],
      conceptSignalWeights: {
        export: 5
      }
    }
  });

  const inventory = result.concepts.find(concept => concept.id === "inventory");

  assert.equal(result.concepts[0]?.id, "inventory");
  assert.ok(inventory);
  assertIncludes(inventory.tags, ["inventory", "sku"]);
  assert.deepEqual(inventory.relatedFiles, ["src/catalog/sku.ts"]);
  assert.equal(result.concepts.some(concept => concept.id === "sku"), false);
});

test("buildDeterministicTree populates architecture nodes for the Abstraction Tree package shape", () => {
  const files = [
    file("package.json"),
    file("packages/core/package.json"),
    file("packages/core/src/index.ts", [], ["scanProject"], ["./scanner.js", "./treeBuilder.js", "./context.js"]),
    file("packages/core/src/scanner.ts", ["scanProject"], ["scanProject"], ["node:fs/promises", "ignore", "typescript"]),
    file("packages/core/src/importGraph.ts", ["buildImportGraph"], ["buildImportGraph"], ["node:fs/promises"]),
    file("packages/core/src/treeBuilder.ts", ["buildDeterministicTree"], ["buildDeterministicTree"], ["node:path"]),
    file("packages/core/src/context.ts", ["buildContextPack"], ["buildContextPack"]),
    file("packages/cli/package.json"),
    file("packages/cli/src/index.ts", ["program"], [], ["commander", "node:http", "sirv", "@abstraction-tree/core"]),
    file("packages/app/package.json"),
    file("packages/app/src/main.tsx", ["App"], [], ["react", "react-dom/client", "lucide-react"]),
    file("packages/app/src/types.ts", ["State"], ["State"]),
    file("packages/full/package.json"),
    file("packages/full/bin/atree.js", [], [], ["@abstraction-tree/cli"])
  ];

  const result = buildDeterministicTree("abstraction-tree", files, { importGraph: monorepoImportGraph() });
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  const architecture = nodes.get("project.architecture");

  assert.ok(architecture);
  assertIncludes(architecture.children, [
    "architecture.cli.surface",
    "architecture.core.engine",
    "architecture.scanner.tree.context.pipeline",
    "architecture.visual.app.api",
    "architecture.visual.app.ui",
    "architecture.package.distribution"
  ]);

  for (const nodeId of architecture.children) {
    const architectureNode = nodes.get(nodeId);
    assert.ok(architectureNode, `Expected ${nodeId}`);
    assert.ok(architectureNode.sourceFiles.length > 0, `${nodeId} should cite source files`);
    assert.ok(architectureNode.dependencies.length > 0, `${nodeId} should cite dependency references`);
  }

  assertIncludes(nodes.get("architecture.visual.app.api")?.dependencies ?? [], ["api-route:/api/state"]);
  assertIncludes(nodes.get("architecture.package.distribution")?.dependencies ?? [], ["bin:atree", "package:@abstraction-tree/core"]);
  assertIncludes(result.files.find(candidate => candidate.path === "packages/cli/src/index.ts")?.ownedByNodeIds ?? [], ["architecture.cli.surface"]);
});

test("buildDeterministicTree infers API, UI, and dataflow architecture for a small web app fixture", () => {
  const result = buildDeterministicTree("small-web-app", [
    file("package.json"),
    file("src/api/checkout.ts", ["checkout"], ["checkout"], ["../services/cart", "../services/payment", "../services/orders"]),
    file("src/components/CheckoutForm.tsx", ["CheckoutForm"], ["CheckoutForm"]),
    file("src/services/cart.ts", ["validateCart"], ["validateCart"]),
    file("src/services/orders.ts", ["createOrder"], ["createOrder"]),
    file("src/services/payment.ts", ["authorizePayment"], ["authorizePayment"])
  ], { importGraph: smallWebAppImportGraph() });
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  const architecture = nodes.get("project.architecture");

  assert.ok(architecture);
  assertIncludes(architecture.children, [
    "architecture.local.api.routes",
    "architecture.visual.app.ui",
    "architecture.runtime.dataflow",
    "architecture.package.distribution"
  ]);

  const dataflow = nodes.get("architecture.runtime.dataflow");
  assert.ok(dataflow);
  assertIncludes(dataflow.sourceFiles, [
    "src/api/checkout.ts",
    "src/services/cart.ts",
    "src/services/orders.ts",
    "src/services/payment.ts"
  ]);
  assertIncludes(dataflow.dependencies, [
    "file.src.api.checkout.ts",
    "file.src.services.cart.ts",
    "file.src.services.orders.ts",
    "file.src.services.payment.ts"
  ]);
});

function file(path: string, symbols: string[] = [], exports: string[] = [], imports: string[] = [], overrides: Partial<FileSummary> = {}): FileSummary {
  return {
    path,
    extension: overrides.extension ?? ".ts",
    language: overrides.language ?? "TypeScript",
    parseStrategy: overrides.parseStrategy ?? "typescript-ast",
    sizeBytes: 100,
    lines: 5,
    imports,
    exports,
    symbols,
    isTest: path.includes("test"),
    summary: `${path} summary.`,
    ownedByNodeIds: [],
    ...overrides
  };
}

function markdownFile(path: string): FileSummary {
  return file(path, [], [], [], {
    extension: ".md",
    language: "Markdown",
    parseStrategy: "regex"
  });
}

function monorepoImportGraph(): ImportGraph {
  return {
    edges: [{
      from: "packages/cli/src/index.ts",
      to: "packages/core/src/index.ts",
      specifier: "@abstraction-tree/core",
      kind: "workspace-package",
      packageName: "@abstraction-tree/core"
    }],
    externalImports: [
      { from: "packages/cli/src/index.ts", specifier: "commander", packageName: "commander" },
      { from: "packages/cli/src/index.ts", specifier: "sirv", packageName: "sirv" },
      { from: "packages/app/src/main.tsx", specifier: "react", packageName: "react" },
      { from: "packages/app/src/main.tsx", specifier: "react-dom/client", packageName: "react-dom" }
    ],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: [
      {
        name: "@abstraction-tree/app",
        root: "packages/app",
        manifestPath: "packages/app/package.json",
        entrypoint: "packages/app/src/main.tsx",
        scriptNames: ["build", "dev", "typecheck"],
        dependencyPackageNames: ["react", "react-dom", "vite"]
      },
      {
        name: "@abstraction-tree/cli",
        root: "packages/cli",
        manifestPath: "packages/cli/package.json",
        entrypoint: "packages/cli/src/index.ts",
        binCommands: ["abstraction-tree", "atree"],
        dependencyPackageNames: ["@abstraction-tree/core", "commander", "sirv"]
      },
      {
        name: "@abstraction-tree/core",
        root: "packages/core",
        manifestPath: "packages/core/package.json",
        entrypoint: "packages/core/src/index.ts",
        dependencyPackageNames: ["ignore", "typescript"]
      },
      {
        name: "abstraction-tree",
        root: "packages/full",
        manifestPath: "packages/full/package.json",
        entrypoint: "packages/full/bin/atree.js",
        binCommands: ["abstraction-tree", "atree"],
        dependencyPackageNames: ["@abstraction-tree/app", "@abstraction-tree/cli"]
      }
    ]
  };
}

function smallWebAppImportGraph(): ImportGraph {
  return {
    edges: [
      { from: "src/api/checkout.ts", to: "src/services/cart.ts", specifier: "../services/cart", kind: "relative" },
      { from: "src/api/checkout.ts", to: "src/services/orders.ts", specifier: "../services/orders", kind: "relative" },
      { from: "src/api/checkout.ts", to: "src/services/payment.ts", specifier: "../services/payment", kind: "relative" }
    ],
    externalImports: [],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: []
  };
}

function assertIncludes(actual: string[], expected: string[]): void {
  for (const value of expected) {
    assert.ok(actual.includes(value), `Expected ${JSON.stringify(actual)} to include ${value}`);
  }
}

function assertExpectedConcepts(concepts: Map<string, unknown>, expected: string[]): void {
  for (const id of expected) {
    assert.ok(concepts.has(id), `Expected concept ${id}`);
  }
}

function assertAbsentConcepts(concepts: Map<string, unknown>, absent: string[]): void {
  for (const id of absent) {
    assert.equal(concepts.has(id), false, `Did not expect concept ${id}`);
  }
}
