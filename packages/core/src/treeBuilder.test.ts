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
