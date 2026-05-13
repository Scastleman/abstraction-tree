import assert from "node:assert/strict";
import test from "node:test";
import { buildGoalWorkspacePlan, type Concept, type FileSummary, type Invariant, type TreeNode } from "./index.js";

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
