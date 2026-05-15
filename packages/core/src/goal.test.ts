import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { buildGoalWorkspacePlan, routePrompt, type Concept, type FileSummary, type Invariant, type TreeNode } from "./index.js";

test("goal planner creates deterministic goal workspace artifacts", () => {
  const plan = buildGoalWorkspacePlan({
    goalText: "Add atree goal so complex prompts become bounded missions with review-required execution.",
    goalFile: "prompts/subscription-billing.md",
    mode: "plan-only",
    createdAt: new Date(2026, 4, 13, 8, 30),
    nodes: fixtureNodes(),
    files: fixtureFiles(),
    concepts: fixtureConcepts(),
    invariants: fixtureInvariants()
  });

  assert.equal(plan.id, "2026-05-13-0830-subscription-billing");
  assert.equal(plan.metadata.status, "planned");
  assert.equal(plan.goalRelativePath, ".abstraction-tree/goals/2026-05-13-0830-subscription-billing/goal.md");
  assert.match(plan.assessmentMarkdown, /# Goal Assessment/);
  assert.match(plan.assessmentMarkdown, /## Recommended Mission Breakdown/);
  assert.equal(plan.affectedTree.goal_id, plan.id);
  assert.ok(plan.affectedTree.affected_nodes.some(node => node.node_id === "architecture.cli.surface"));
  assert.ok(plan.affectedTree.affected_files.some(file => file.path === "packages/cli/src/index.ts"));
  assert.equal(plan.missionPlan.mission_dir, `${plan.workspaceRelativePath}/missions`);
  assert.ok(plan.missions.length >= 4);

  for (const mission of plan.missions) {
    assert.match(mission.content, /^---\n/);
    assert.match(mission.content, /parallelGroup:/);
    assert.match(mission.content, /parallelGroupSafe: false/);
    assert.match(mission.content, /affectedFiles:\n\s+-/);
    assert.match(mission.content, /# Mission/);
    assert.match(mission.content, /## Abstraction Tree Position/);
    assert.match(mission.content, /## Required Checks/);
    assert.equal(mission.mission.source_goal, plan.goalRelativePath);
  }
});

test("goal planner writes create-pr planning body without execution claims", () => {
  const plan = buildGoalWorkspacePlan({
    goalText: "Plan a safe goal-driven workflow and prepare a PR body.",
    goalFile: "goal.md",
    mode: "create-pr",
    createdAt: new Date(2026, 4, 13, 9, 15),
    nodes: fixtureNodes(),
    files: fixtureFiles(),
    concepts: fixtureConcepts(),
    invariants: fixtureInvariants()
  });

  assert.equal(plan.metadata.mode, "create-pr");
  assert.ok(plan.prBodyMarkdown);
  assert.match(plan.prBodyMarkdown ?? "", /# Goal-Driven Abstraction Tree PR/);
  assert.match(plan.prBodyMarkdown ?? "", /None\. This PR body was prepared after deterministic planning only\./);
});

test("goal planner carries route-estimated files into affected tree and missions", () => {
  const goalText = "Add subscription billing with Stripe checkout, webhooks, user plans, tests, and docs.";
  const route = routePrompt({
    prompt: goalText,
    nodes: fixtureNodes(),
    files: fixtureFiles(),
    concepts: fixtureConcepts(),
    invariants: fixtureInvariants()
  });
  const plan = buildGoalWorkspacePlan({
    goalText,
    goalFile: "goal.md",
    mode: "plan-only",
    createdAt: new Date(2026, 4, 13, 9, 45),
    nodes: fixtureNodes(),
    files: fixtureFiles(),
    concepts: fixtureConcepts(),
    invariants: fixtureInvariants()
  });
  const affectedFiles = new Set(plan.affectedTree.affected_files.map(file => file.path));
  const missionFiles = new Set(plan.missions.flatMap(mission => mission.mission.affectedFiles));

  for (const filePath of route.estimatedFiles.filter(filePath => filePath.startsWith("packages/"))) {
    assert.ok(affectedFiles.has(filePath), `affected tree missing route file ${filePath}`);
    assert.ok(missionFiles.has(filePath), `missions missing route file ${filePath}`);
  }
  assert.ok(plan.affectedTree.affected_files.some(file => file.reason.includes("Route evidence selected this file.")));
});

test("goal planner derives mission shapes for external repository conventions", async t => {
  const cases = [
    {
      name: "vitejs/vite",
      goalText: "Update plugin container module resolution with tests and docs.",
      files: viteFiles(),
      nodes: [
        node("architecture.plugin-runtime", "Plugin runtime", "architecture", "Vite plugin container and module resolution.", [
          "packages/vite/src/node/server/pluginContainer.ts",
          "packages/vite/src/node/plugin.ts",
          "playground/optimizer/__tests__/optimizer.spec.ts",
          "docs/guide/api-plugin.md"
        ])
      ],
      manifests: {
        "package.json": {
          packageManager: "pnpm@9.0.0",
          scripts: {
            build: "tsx scripts/build.ts",
            test: "vitest run",
            "docs:build": "vitepress build docs"
          }
        },
        "pnpm-workspace.yaml": "packages:\n  - packages/*\n"
      },
      expectedFiles: [
        "packages/vite/src/node/server/pluginContainer.ts",
        "playground/optimizer/__tests__/optimizer.spec.ts",
        "docs/guide/api-plugin.md"
      ],
      expectedChecks: ["pnpm run build", "pnpm run test", "pnpm run docs:build"]
    },
    {
      name: "pallets/click",
      goalText: "Improve option parsing envvar default handling with docs and regression tests.",
      files: clickFiles(),
      nodes: [
        node("architecture.python-package", "Python package", "architecture", "Click parser, shell completion, tests, and docs.", [
          "src/click/parser.py",
          "src/click/core.py",
          "tests/test_options.py",
          "docs/options.rst"
        ])
      ],
      manifests: {
        "pyproject.toml": "[project]\nname = 'click'\n",
        "docs/conf.py": "project = 'click'\n"
      },
      expectedFiles: ["src/click/parser.py", "tests/test_options.py", "docs/options.rst", "pyproject.toml"],
      expectedChecks: ["python -m build", "python -m pytest", "sphinx-build docs docs/_build"]
    },
    {
      name: "sharkdp/fd",
      goalText: "Add hidden file traversal filtering mode across CLI flags docs and integration tests.",
      files: fdFiles(),
      nodes: [
        node("architecture.rust-cli", "Rust CLI", "architecture", "fd command-line traversal, filtering, and integration tests.", [
          "src/cli.rs",
          "src/walk.rs",
          "tests/tests.rs",
          "README.md"
        ])
      ],
      manifests: {
        "Cargo.toml": "[package]\nname = 'fd'\n"
      },
      expectedFiles: ["src/walk.rs", "tests/tests.rs", "README.md", "Cargo.toml"],
      expectedChecks: ["cargo build", "cargo test", "cargo doc --no-deps"]
    }
  ];

  for (const fixture of cases) {
    const root = await tempProject(t, fixture.name);
    for (const [filePath, content] of Object.entries(fixture.manifests)) {
      await writeProjectFile(root, filePath, typeof content === "string" ? content : JSON.stringify(content, null, 2));
    }

    const plan = buildGoalWorkspacePlan({
      goalText: fixture.goalText,
      goalFile: "goal.md",
      mode: "plan-only",
      createdAt: new Date(2026, 4, 13, 11, 0),
      projectRoot: root,
      nodes: [node("project.intent", "Project intent", "project", `${fixture.name} project.`, ["README.md"]), ...fixture.nodes],
      files: fixture.files,
      concepts: [],
      invariants: []
    });

    const affectedFiles = plan.missions.flatMap(mission => mission.mission.affectedFiles);
    const checks = plan.missionPlan.missions.flatMap(mission => mission.success_checks);
    for (const expectedFile of fixture.expectedFiles) assert.ok(affectedFiles.includes(expectedFile), `${fixture.name} includes ${expectedFile}`);
    for (const expectedCheck of fixture.expectedChecks) assert.ok(checks.includes(expectedCheck), `${fixture.name} includes ${expectedCheck}`);
    assert.doesNotMatch(affectedFiles.join("\n"), /packages\/core\/src\/goal\.ts|packages\/cli\/src\/goalCommand\.ts|GOAL_DRIVEN_MISSION_WORKFLOW/u);
  }
});

test("goal planner applies mission planning overrides", () => {
  const plan = buildGoalWorkspacePlan({
    goalText: "Change invoice processing with custom docs and quality coverage.",
    goalFile: "goal.md",
    mode: "plan-only",
    createdAt: new Date(2026, 4, 13, 11, 30),
    nodes: [
      node("project.intent", "Project intent", "project", "Billing project.", ["README.md"]),
      node("module.billing", "Billing module", "module", "Invoice processing and customer billing.", ["src/invoices.ts"])
    ],
    files: [
      file("README.md", "Project overview.", false),
      file("src/invoices.ts", "Invoice processing.", false, ["processInvoice"]),
      file("handbook/billing/invoices.md", "Billing handbook.", false),
      file("quality/billing/invoices.spec.ts", "Invoice quality tests.", true),
      file("build/ci.yml", "Build workflow.", false)
    ],
    concepts: [],
    invariants: [],
    missionPlanning: {
      docsPatterns: ["handbook/**/*.md"],
      testPatterns: ["quality/**/*.spec.ts"],
      buildPatterns: ["build/*.yml"],
      buildCommands: ["custom build"],
      testCommands: ["custom test"],
      docsCommands: ["custom docs"],
      validationCommands: ["custom validate"]
    }
  });

  const affectedFiles = plan.missions.flatMap(mission => mission.mission.affectedFiles);
  const checks = plan.missionPlan.missions.flatMap(mission => mission.success_checks);
  assert.ok(affectedFiles.includes("handbook/billing/invoices.md"));
  assert.ok(affectedFiles.includes("quality/billing/invoices.spec.ts"));
  assert.ok(affectedFiles.includes("build/ci.yml"));
  assert.ok(checks.includes("custom build"));
  assert.ok(checks.includes("custom test"));
  assert.ok(checks.includes("custom docs"));
  assert.ok(checks.includes("custom validate"));
});

async function tempProject(t: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `atree-goal-${name.replace(/[^a-z0-9]+/giu, "-")}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeProjectFile(root: string, filePath: string, content: string): Promise<void> {
  const absolutePath = path.join(root, filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function fixtureNodes(): TreeNode[] {
  return [
    node("project.intent", "Project intent", "project", "Abstraction Tree keeps agents scoped.", ["README.md"]),
    node("architecture.cli.surface", "CLI surface", "architecture", "The CLI exposes scan, validate, scope, and mission planning commands.", [
      "packages/cli/src/index.ts",
      "packages/cli/src/goalCommand.ts"
    ]),
    node("architecture.core.engine", "Core engine", "architecture", "Core builds deterministic project memory and planning helpers.", [
      "packages/core/src/goal.ts"
    ])
  ];
}

function fixtureFiles(): FileSummary[] {
  return [
    file("README.md", "Project overview and command documentation.", false),
    file("packages/cli/src/index.ts", "Commander CLI command surface.", false, ["goal", "Command"]),
    file("packages/cli/src/goalCommand.ts", "Goal command writer for goal workspaces.", false, ["runGoalCommand"]),
    file("packages/core/src/goal.ts", "Core goal planner maps prompts to missions.", false, ["buildGoalWorkspacePlan"]),
    file("packages/core/src/goal.test.ts", "Goal planner tests.", true)
  ];
}

function viteFiles(): FileSummary[] {
  return [
    file("package.json", "Vite package manifest.", false),
    file("pnpm-workspace.yaml", "pnpm workspace.", false),
    file("README.md", "Vite project overview.", false),
    file("packages/vite/src/node/server/pluginContainer.ts", "Plugin container module resolution.", false, ["PluginContainer"]),
    file("packages/vite/src/node/plugin.ts", "Plugin API.", false, ["Plugin"]),
    file("playground/optimizer/__tests__/optimizer.spec.ts", "Optimizer integration tests.", true),
    file("docs/guide/api-plugin.md", "Plugin API guide.", false)
  ];
}

function clickFiles(): FileSummary[] {
  return [
    file("pyproject.toml", "Python project manifest.", false),
    file("README.rst", "Click project overview.", false),
    file("src/click/parser.py", "Option parser implementation.", false, ["OptionParser"]),
    file("src/click/core.py", "Command core implementation.", false, ["Command"]),
    file("tests/test_options.py", "Option parsing tests.", true),
    file("docs/conf.py", "Sphinx docs config.", false),
    file("docs/options.rst", "Option docs.", false)
  ];
}

function fdFiles(): FileSummary[] {
  return [
    file("Cargo.toml", "Rust crate manifest.", false),
    file("README.md", "fd CLI documentation.", false),
    file("src/cli.rs", "CLI flags.", false, ["build_app"]),
    file("src/walk.rs", "Filesystem traversal.", false, ["walk"]),
    file("tests/tests.rs", "Integration tests.", true)
  ];
}

function fixtureConcepts(): Concept[] {
  return [{
    id: "goal-planning",
    title: "Goal planning",
    summary: "Maps complex prompts to bounded missions.",
    relatedNodeIds: ["architecture.cli.surface"],
    relatedFiles: ["packages/core/src/goal.ts", "packages/cli/src/index.ts"],
    tags: ["goal", "mission"],
    evidence: []
  }];
}

function fixtureInvariants(): Invariant[] {
  return [{
    id: "invariant.no-auto-push",
    title: "No automatic push",
    description: "Automation must not push or merge without user approval.",
    nodeIds: ["architecture.cli.surface"],
    filePaths: ["packages/cli/src/index.ts"],
    severity: "high"
  }];
}

function node(id: string, title: string, level: string, summary: string, ownedFiles: string[]): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: level,
    level,
    summary,
    children: [],
    sourceFiles: ownedFiles,
    ownedFiles,
    responsibilities: [summary],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: {
      allowedToChange: ownedFiles,
      mustNotChange: []
    },
    confidence: 0.8
  };
}

function file(filePath: string, summary: string, isTest: boolean, symbols: string[] = []): FileSummary {
  return {
    path: filePath,
    extension: filePath.slice(filePath.lastIndexOf(".")),
    language: filePath.endsWith(".md") ? "Markdown" : "TypeScript",
    sizeBytes: 10,
    lines: 1,
    imports: [],
    exports: symbols,
    symbols,
    isTest,
    summary,
    ownedByNodeIds: []
  };
}
