import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGeneratedMemoryQuality } from "./evaluator.js";
import { buildImportGraphFromFiles } from "./importGraph.js";
import { buildDeterministicTree } from "./treeBuilder.js";
import { validateConcepts } from "./validator.js";
import { BUILT_IN_ATREE_PROFILES } from "./workspace.js";
import type { Concept, FileSummary, ImportGraph } from "./schema.js";

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

test("buildDeterministicTree prunes filler concepts and preserves configured domain vocabulary", () => {
  const result = buildDeterministicTree("language-tool", [
    file("src/the/and/orchestrator.ts", ["TheAndOfService", "GoFlow"], ["createGoFlow"]),
    file("tests/go.test.ts", ["GoFlow"], []),
    markdownFile("docs/the-and-guide.md"),
    markdownFile("docs/and-the-overview.md")
  ], {
    config: {
      domainVocabulary: [{
        concept: "go",
        synonyms: ["go"],
        weight: 6
      }]
    }
  });

  const concepts = new Map(result.concepts.map(concept => [concept.id, concept]));

  assertExpectedConcepts(concepts, ["go"]);
  assertAbsentConcepts(concepts, ["and", "the", "guide", "overview"]);
  assert.equal(result.nodes.some(node => node.id === "concept-node.and" || node.id === "concept-node.the"), false);
  assertIncludes(concepts.get("go")?.relatedFiles ?? [], ["src/the/and/orchestrator.ts", "tests/go.test.ts"]);
});

test("concept quality validation and evaluation flag filler concepts", () => {
  const filler = memoryConcept("and", {
    relatedFiles: ["docs/and-the-guide.md"],
    evidence: [{
      kind: "doc",
      filePath: "docs/and-the-guide.md",
      value: "And The Guide",
      term: "and",
      score: 1
    }]
  });
  const useful = memoryConcept("checkout", {
    relatedFiles: ["src/checkout.ts"],
    evidence: [{
      kind: "symbol",
      filePath: "src/checkout.ts",
      value: "CheckoutFlow",
      term: "checkout",
      score: 3
    }]
  });

  const issues = validateConcepts([filler, useful]);
  const report = evaluateGeneratedMemoryQuality({
    nodes: [],
    files: [],
    concepts: [filler, useful],
    invariants: [],
    importGraph: emptyImportGraph(),
    contextPacks: []
  });

  assert.ok(issues.some(issue =>
    issue.severity === "warning" &&
    issue.message.includes("Concept and has low-quality concept signal: filler concept id")
  ));
  assert.ok(issues.some(issue =>
    issue.severity === "warning" &&
    issue.message.includes("Concept and has low-quality concept signal: filler-only evidence")
  ));
  assert.equal(report.concepts.noisyConceptCount, 1);
  assert.deepEqual(report.concepts.noisyConceptIds, ["and"]);
  assert.equal(report.concepts.fillerOnlyEvidenceConcepts, 1);
  assert.deepEqual(report.concepts.fillerOnlyEvidenceConceptIds, ["and"]);
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

test("buildDeterministicTree uses selected profile config to alter subsystem structure", () => {
  const rustCliProfile = BUILT_IN_ATREE_PROFILES.find(profile => profile.name === "rust-cli");
  assert.ok(rustCliProfile);
  const files = [
    configFile("Cargo.toml", ["package", "bin"]),
    rustFile("src/main.rs", ["main", "Cli"], ["mod:cli"]),
    rustFile("src/cli.rs", ["Args", "Parser"]),
    rustFile("src/search.rs", ["collect_entries"]),
    rustFile("tests/cli_test.rs", ["runs_help"], [], true)
  ];
  const withoutProfile = buildDeterministicTree("fd-lite", files);
  const withProfile = buildDeterministicTree("fd-lite", files, { config: rustCliProfile.config });
  const nodes = new Map(withProfile.nodes.map(node => [node.id, node]));

  assert.equal(withoutProfile.nodes.some(node => node.id === "subsystem.rust.cli"), false);
  assertIncludes(nodes.get("project.intent")?.children ?? [], [
    "subsystem.rust.cli",
    "subsystem.rust.core",
    "subsystem.rust.tests",
    "subsystem.rust.packaging"
  ]);
  assert.deepEqual(nodes.get("subsystem.rust.cli")?.sourceFiles, ["src/cli.rs", "src/main.rs"]);
  assertIncludes(withProfile.files.find(candidate => candidate.path === "src/main.rs")?.ownedByNodeIds ?? [], [
    "subsystem.rust.cli"
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

test("buildDeterministicTree infers Python package architecture for Click-style packages", () => {
  const files = [
    configFile("pyproject.toml", ["project", "project.scripts", "tool.pytest.ini_options"]),
    pythonFile("src/click/__init__.py"),
    pythonFile("src/click/core.py", ["Command", "parse_args"], [".parser"]),
    pythonFile("src/click/parser.py", ["OptionParser", "value_from_envvar", "handle_parse_result"]),
    pythonFile("src/click/cli.py", ["main"], ["click"]),
    pythonFile("tests/test_defaults.py", ["test_envvar_default_is_used"], ["click.parser"], true),
    pythonFile("tests/test_options.py", ["test_explicit_option_beats_envvar_default"], ["click.parser"], true),
    rstFile("docs/options.rst", ["Options"]),
    pythonFile("docs/conf.py")
  ];
  const importGraph = buildImportGraphFromFiles(files);
  const result = buildDeterministicTree("click", files, { importGraph });
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  const architecture = nodes.get("project.architecture");
  const quality = evaluateGeneratedMemoryQuality({
    nodes: result.nodes,
    files: result.files,
    concepts: result.concepts,
    invariants: result.invariants,
    importGraph,
    contextPacks: []
  });

  assert.ok(architecture);
  assertIncludes(architecture.children, [
    "architecture.python.package.api",
    "architecture.python.cli.entrypoints",
    "architecture.python.parser.options",
    "architecture.python.tests",
    "architecture.python.docs",
    "architecture.python.packaging.metadata"
  ]);
  assertIncludes(nodes.get("architecture.python.package.api")?.sourceFiles ?? [], [
    "src/click/__init__.py",
    "src/click/core.py",
    "src/click/parser.py"
  ]);
  assertIncludes(nodes.get("architecture.python.parser.options")?.sourceFiles ?? [], [
    "src/click/core.py",
    "src/click/parser.py"
  ]);
  assertIncludes(nodes.get("architecture.python.tests")?.sourceFiles ?? [], [
    "tests/test_defaults.py",
    "tests/test_options.py"
  ]);
  assertIncludes(nodes.get("architecture.python.docs")?.sourceFiles ?? [], [
    "docs/conf.py",
    "docs/options.rst"
  ]);
  assertIncludes(nodes.get("architecture.python.packaging.metadata")?.sourceFiles ?? [], ["pyproject.toml"]);
  assertIncludes(importGraph.edges.map(edge => `${edge.from}->${edge.to}`), [
    "src/click/core.py->src/click/parser.py",
    "tests/test_defaults.py->src/click/parser.py",
    "tests/test_options.py->src/click/parser.py"
  ]);
  assert.ok(quality.architecture.architectureCoveragePercent > 0);
});

test("buildDeterministicTree infers Rust CLI architecture for fd-style crates", () => {
  const files = [
    configFile("Cargo.toml", ["package", "package.name:fd-lite", "bin", "bin.name:fd", "bin.path:src/main.rs"]),
    rustFile("src/main.rs", ["main"], ["mod:cli", "mod:walk"]),
    rustFile("src/cli.rs", ["Options", "parse_hidden_flag"]),
    rustFile("src/walk.rs", ["ignore_hidden", "collect_entries"]),
    rustFile("tests/tests.rs", ["hidden_files_are_filtered_by_default"], ["fd_lite::walk::ignore_hidden"], true),
    markdownFile("README.md")
  ];
  const importGraph = buildImportGraphFromFiles(files);
  const result = buildDeterministicTree("fd-lite", files, { importGraph });
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  const architecture = nodes.get("project.architecture");
  const quality = evaluateGeneratedMemoryQuality({
    nodes: result.nodes,
    files: result.files,
    concepts: result.concepts,
    invariants: result.invariants,
    importGraph,
    contextPacks: []
  });

  assert.ok(architecture);
  assertIncludes(architecture.children, [
    "architecture.rust.binary.entrypoint",
    "architecture.rust.cli.arguments",
    "architecture.rust.traversal.search",
    "architecture.rust.config.ignore",
    "architecture.rust.integration.tests",
    "architecture.rust.packaging.metadata"
  ]);
  assert.deepEqual(nodes.get("architecture.rust.binary.entrypoint")?.sourceFiles, ["src/main.rs"]);
  assert.deepEqual(nodes.get("architecture.rust.cli.arguments")?.sourceFiles, ["src/cli.rs"]);
  assert.deepEqual(nodes.get("architecture.rust.traversal.search")?.sourceFiles, ["src/walk.rs"]);
  assert.deepEqual(nodes.get("architecture.rust.config.ignore")?.sourceFiles, ["src/walk.rs"]);
  assert.deepEqual(nodes.get("architecture.rust.integration.tests")?.sourceFiles, ["tests/tests.rs"]);
  assert.deepEqual(nodes.get("architecture.rust.packaging.metadata")?.sourceFiles, ["Cargo.toml"]);
  assertIncludes(importGraph.edges.map(edge => `${edge.from}->${edge.to}`), [
    "src/main.rs->src/cli.rs",
    "src/main.rs->src/walk.rs",
    "tests/tests.rs->src/walk.rs"
  ]);
  assert.ok(quality.architecture.architectureCoveragePercent > 0);
  assertIncludes(result.files.find(candidate => candidate.path === "src/walk.rs")?.ownedByNodeIds ?? [], [
    "architecture.rust.traversal.search",
    "architecture.rust.config.ignore"
  ]);
});

test("buildDeterministicTree infers documentation book architecture for mdBook-style repositories", () => {
  const files = [
    configFile("book.toml", ["book", "book.title", "output.html"]),
    markdownBookFile("src/SUMMARY.md", ["Summary", "Understanding Ownership", "What Is Ownership?", "References and Borrowing"], [
      "ch04-01-what-is-ownership.md",
      "ch04-02-references-and-borrowing.md"
    ]),
    markdownBookFile("src/ch04-00-understanding-ownership.md", ["Understanding Ownership"]),
    markdownBookFile("src/ch04-01-what-is-ownership.md", ["What Is Ownership?"], [
      "../listings/ch04-understanding-ownership/listing-04-01/src/main.rs"
    ]),
    markdownBookFile("src/ch04-02-references-and-borrowing.md", ["References and Borrowing"]),
    rustFile("listings/ch04-understanding-ownership/listing-04-01/src/main.rs", ["takes_ownership"]),
    file("scripts/build-book.mjs", ["mdbook build"], [], [], {
      extension: ".mjs",
      language: "JavaScript",
      parseStrategy: "regex"
    }),
    file("scripts/check-links.mjs", ["mdbook linkcheck"], [], [], {
      extension: ".mjs",
      language: "JavaScript",
      parseStrategy: "regex"
    }),
    file(".github/workflows/book.yml", ["mdbook build", "mdbook test"], [], [], {
      extension: ".yml",
      language: "YAML",
      parseStrategy: "regex"
    }),
    markdownBookFile("translations/es/src/ch04-01-what-is-ownership.md", ["Que es ownership"])
  ];
  const importGraph = buildImportGraphFromFiles(files);
  const result = buildDeterministicTree("rust-book-lite", files, { importGraph });
  const nodes = new Map(result.nodes.map(node => [node.id, node]));
  const architecture = nodes.get("project.architecture");
  const quality = evaluateGeneratedMemoryQuality({
    nodes: result.nodes,
    files: result.files,
    concepts: result.concepts,
    invariants: result.invariants,
    importGraph,
    contextPacks: []
  });

  assert.ok(architecture);
  assertIncludes(architecture.children, [
    "architecture.docs.book.structure",
    "architecture.docs.book.chapter.content",
    "architecture.docs.book.listings.examples",
    "architecture.docs.book.build.publishing",
    "architecture.docs.book.translation.editions",
    "architecture.docs.book.editorial.quality"
  ]);
  assertIncludes(nodes.get("architecture.docs.book.structure")?.sourceFiles ?? [], [
    "book.toml",
    "src/SUMMARY.md"
  ]);
  assertIncludes(nodes.get("architecture.docs.book.chapter.content")?.sourceFiles ?? [], [
    "src/ch04-00-understanding-ownership.md",
    "src/ch04-01-what-is-ownership.md",
    "src/ch04-02-references-and-borrowing.md"
  ]);
  assertIncludes(nodes.get("architecture.docs.book.listings.examples")?.sourceFiles ?? [], [
    "listings/ch04-understanding-ownership/listing-04-01/src/main.rs"
  ]);
  assertIncludes(nodes.get("architecture.docs.book.build.publishing")?.sourceFiles ?? [], [
    ".github/workflows/book.yml",
    "book.toml",
    "scripts/build-book.mjs"
  ]);
  assertIncludes(nodes.get("architecture.docs.book.translation.editions")?.sourceFiles ?? [], [
    "translations/es/src/ch04-01-what-is-ownership.md"
  ]);
  assertIncludes(nodes.get("architecture.docs.book.editorial.quality")?.sourceFiles ?? [], [
    ".github/workflows/book.yml",
    "scripts/check-links.mjs"
  ]);
  assert.ok(quality.architecture.architectureCoveragePercent >= 80);
  assertIncludes(importGraph.edges.map(edge => `${edge.from}->${edge.to}`), [
    "src/SUMMARY.md->src/ch04-01-what-is-ownership.md",
    "src/SUMMARY.md->src/ch04-02-references-and-borrowing.md",
    "src/ch04-01-what-is-ownership.md->listings/ch04-understanding-ownership/listing-04-01/src/main.rs"
  ]);
  assertIncludes(nodes.get("architecture.docs.book.chapter.content")?.dependencies ?? [], [
    "file.listings.ch04.understanding.ownership.listing.04.01.src.main.rs"
  ]);
  assertIncludes(result.files.find(candidate => candidate.path === "src/ch04-01-what-is-ownership.md")?.ownedByNodeIds ?? [], [
    "architecture.docs.book.chapter.content"
  ]);
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

function markdownBookFile(path: string, symbols: string[] = [], imports: string[] = []): FileSummary {
  return file(path, symbols, [], imports, {
    extension: ".md",
    language: "Markdown",
    parseStrategy: "regex"
  });
}

function configFile(filePath: string, symbols: string[] = []): FileSummary {
  return file(filePath, symbols, [], [], {
    extension: filePath.endsWith(".toml") ? ".toml" : filePath.endsWith(".cfg") ? ".cfg" : ".ini",
    language: filePath.endsWith(".toml") ? "TOML" : "INI",
    parseStrategy: "regex"
  });
}

function pythonFile(path: string, symbols: string[] = [], imports: string[] = [], isTest = false): FileSummary {
  return file(path, symbols, [], imports, {
    extension: ".py",
    language: "Python",
    parseStrategy: "regex",
    isTest
  });
}

function rustFile(path: string, symbols: string[] = [], imports: string[] = [], isTest = false): FileSummary {
  return file(path, symbols, [], imports, {
    extension: ".rs",
    language: "Rust",
    parseStrategy: "regex",
    isTest
  });
}

function rstFile(path: string, symbols: string[] = []): FileSummary {
  return file(path, symbols, [], [], {
    extension: ".rst",
    language: "reStructuredText",
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

function emptyImportGraph(): ImportGraph {
  return {
    edges: [],
    externalImports: [],
    unresolvedImports: [],
    cycles: [],
    workspacePackages: []
  };
}

function memoryConcept(id: string, overrides: Partial<Concept> = {}): Concept {
  return {
    id,
    title: id,
    summary: `${id} concept.`,
    relatedNodeIds: [],
    relatedFiles: [],
    tags: [id],
    evidence: [{
      kind: "symbol",
      filePath: "src/app.ts",
      value: id,
      term: id,
      score: 3
    }],
    ...overrides
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
