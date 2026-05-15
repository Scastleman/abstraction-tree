import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppExplorer, LoadError } from "./App.js";
import { AgentHealthPanel } from "./components/AgentHealthPanel.js";
import { ChangeHistory } from "./components/ChangeHistory.js";
import { ConceptPanel } from "./components/ConceptPanel.js";
import { GoalWorkflowPanel } from "./components/GoalWorkflowPanel.js";
import { InvariantPanel } from "./components/InvariantPanel.js";
import { NodeDetails } from "./components/NodeDetails.js";
import { TreeList, buildTreeItems, flattenTreeItems, flattenVisibleTreeItems, moveTreeSelection } from "./components/TreeList.js";
import { fetchAbstractionState, readApiTokenFromLocation } from "./hooks/useAbstractionState.js";
import type { AbstractionTreeState as State, TreeNode, WorkflowViewState } from "@abstraction-tree/core";

test("fetchAbstractionState reports failed /api/state responses", async () => {
  await assert.rejects(
    fetchAbstractionState(async () => new Response("Unavailable", { status: 503, statusText: "Service Unavailable" })),
    /\/api\/state responded with 503 Service Unavailable/
  );
});

test("fetchAbstractionState sends bearer token when supplied", async () => {
  let requestInit: RequestInit | undefined;
  await fetchAbstractionState(async (_input, init) => {
    requestInit = init;
    return new Response(JSON.stringify(sampleState()), {
      headers: { "content-type": "application/json" }
    });
  }, undefined, "network-token");

  const headers = new Headers(requestInit?.headers);
  assert.equal(headers.get("authorization"), "Bearer network-token");
});

test("readApiTokenFromLocation reads the URL fragment token", () => {
  assert.equal(readApiTokenFromLocation({ hash: "#atree_token=network-token" }), "network-token");
  assert.equal(readApiTokenFromLocation({ hash: "#atree_token=network-token&unused=true" }), "network-token");
  assert.equal(readApiTokenFromLocation({ hash: "#other=value" }), undefined);
});

test("LoadError renders a useful /api/state error and retry control", () => {
  const html = renderToStaticMarkup(<LoadError error="/api/state responded with 500." onRetry={() => undefined} />);

  assert.match(html, /Unable to load Abstraction Tree/);
  assert.match(html, /\/api\/state responded with 500/);
  assert.match(html, /Retry/);
  assert.match(html, /role="alert"/);
});

test("LoadError renders a token form for unauthorized /api/state responses", () => {
  const html = renderToStaticMarkup(
    <LoadError
      error="/api/state responded with 401 Unauthorized."
      needsToken
      onRetry={() => undefined}
      onTokenSubmit={() => undefined}
    />
  );

  assert.match(html, /API token/);
  assert.match(html, /type="password"/);
  assert.match(html, /Unlock/);
});

test("AppExplorer renders the selected node summary once", () => {
  const html = renderToStaticMarkup(
    <AppExplorer
      error={null}
      isRefreshing={false}
      onRefresh={() => undefined}
      onRetry={() => undefined}
      state={sampleState()}
      status="ready"
    />
  );

  assert.equal(html.match(/Root project purpose\./g)?.length, 1);
  assert.ok(html.indexOf("Summary") < html.indexOf("Root project purpose."));
  assert.match(html, /Explanation/);
  assert.match(html, /Separation Logic/);
});

test("TreeList builds and renders nested parent child relationships", () => {
  const html = renderToStaticMarkup(
    <TreeList nodes={sampleNodes()} onSelect={() => undefined} selectedId="feature.checkout" />
  );
  const visibleIds = flattenVisibleTreeItems(buildTreeItems(sampleNodes()), new Set(["project.intent"])).map(item => item.node.id);

  assert.deepEqual(flattenTreeItems(buildTreeItems(sampleNodes())).map(item => item.node.id), [
    "project.intent",
    "architecture.app",
    "feature.checkout",
    "feature.search"
  ]);
  assert.match(html, /role="tree"/);
  assert.match(html, /aria-level="1"/);
  assert.match(html, /aria-level="2"/);
  assert.doesNotMatch(html, /aria-level="3"/);
  assert.match(html, /aria-label="Collapse Project intent"/);
  assert.match(html, /aria-label="Expand Visual app"/);
  assert.deepEqual(visibleIds, ["project.intent", "architecture.app"]);
  assert.ok(html.indexOf("Project intent") < html.indexOf("Visual app"));
  assert.equal(html.indexOf("Checkout explorer"), -1);
});

test("TreeList keeps ancestor branches visible when a descendant matches search", () => {
  const visibleIds = flattenTreeItems(buildTreeItems(sampleNodes(), "checkout")).map(item => item.node.id);

  assert.deepEqual(visibleIds, ["project.intent", "architecture.app", "feature.checkout"]);
});

test("flattenVisibleTreeItems hides descendants until their branch is expanded", () => {
  const items = buildTreeItems(sampleNodes());
  const rootOnly = flattenVisibleTreeItems(items, new Set(["project.intent"])).map(item => item.node.id);
  const expandedApp = flattenVisibleTreeItems(items, new Set(["project.intent", "architecture.app"])).map(item => item.node.id);

  assert.deepEqual(rootOnly, ["project.intent", "architecture.app"]);
  assert.deepEqual(expandedApp, ["project.intent", "architecture.app", "feature.checkout", "feature.search"]);
});

test("moveTreeSelection handles arrow and boundary keys", () => {
  const visibleIds = ["project.intent", "architecture.app", "feature.checkout"];

  assert.equal(moveTreeSelection(visibleIds, "project.intent", "ArrowDown"), "architecture.app");
  assert.equal(moveTreeSelection(visibleIds, "architecture.app", "ArrowUp"), "project.intent");
  assert.equal(moveTreeSelection(visibleIds, "feature.checkout", "End"), "feature.checkout");
  assert.equal(moveTreeSelection(visibleIds, "feature.checkout", "Home"), "project.intent");
  assert.equal(moveTreeSelection(visibleIds, "feature.checkout", "PageDown"), undefined);
});

test("mission panels render independently", () => {
  const state = sampleState();
  const html = [
    renderToStaticMarkup(<NodeDetails node={state.nodes[0]} />),
    renderToStaticMarkup(<AgentHealthPanel health={state.agentHealth} />),
    renderToStaticMarkup(<ConceptPanel concepts={state.concepts} />),
    renderToStaticMarkup(<InvariantPanel invariants={state.invariants} />),
    renderToStaticMarkup(<ChangeHistory changes={state.changes} />),
    renderToStaticMarkup(<GoalWorkflowPanel workflow={sampleWorkflow()} />)
  ].join("\n");

  assert.match(html, /Confidence/);
  assert.match(html, /Summary/);
  assert.match(html, /Reason For Its Existence/);
  assert.match(html, /Separation Logic/);
  assert.match(html, /Scope Evidence/);
  assert.match(html, /Latest run/);
  assert.match(html, /Scope contract/);
  assert.match(html, /Navigation/);
  assert.match(html, /Tree memory/);
  assert.match(html, /Visual app refactor/);
  assert.match(html, /Goal Workspaces/);
  assert.match(html, /Mission Plan/);
  assert.match(html, /Scope Review/);
  assert.match(html, /Coherence Review/);
});

test("NodeDetails starts with the selected node representation summary", () => {
  const html = renderToStaticMarkup(<NodeDetails node={sampleNodes()[0]} />);

  assert.ok(html.indexOf("Summary") < html.indexOf("Level"));
  assert.ok(html.indexOf("Root project purpose.") < html.indexOf("Confidence"));
  assert.ok(html.indexOf("Explanation") > html.indexOf("Root project purpose."));
  assert.ok(html.indexOf("Reason For Its Existence") > html.indexOf("Explanation"));
  assert.ok(html.indexOf("Separation Logic") > html.indexOf("Reason For Its Existence"));
});

test("GoalWorkflowPanel renders mission stages, scope filters, and report links", () => {
  const html = renderToStaticMarkup(<GoalWorkflowPanel workflow={sampleWorkflow()} />);

  assert.match(html, /Improve visual workflow/);
  assert.match(html, /Analysis/);
  assert.match(html, /Planning/);
  assert.match(html, /Execution/);
  assert.match(html, /Review/);
  assert.match(html, /High impact/);
  assert.match(html, /Questionable/);
  assert.match(html, /Goal assessment/);
  assert.match(html, /api\/artifact\?path=/);
});

function sampleState(): State {
  return {
    agentHealth: {
      latestRun: {
        file: ".abstraction-tree/runs/2026-05-08-0100-agent-run.md",
        result: "success",
        task: "Refactor visual app"
      },
      validation: {
        issueCount: 0,
        errorCount: 0,
        warningCount: 0
      },
      scope: {
        file: ".abstraction-tree/scopes/2026-05-13-1200-scope-check.json",
        prompt: "Refactor visual app",
        status: "clean",
        requiresClarification: false,
        affectedNodeCount: 1,
        allowedFileCount: 3,
        violationCount: 0,
        checkedAt: "2026-05-13T12:10:00.000Z"
      }
    },
    changes: [{
      id: "mission-011",
      timestamp: "2026-05-08T00:00:00.000Z",
      title: "Visual app refactor",
      reason: "Split visual app components and added tests.",
      filesChanged: ["packages/app/src/App.tsx"],
      affectedNodeIds: ["architecture.visual.app"],
      invariantsPreserved: ["tree-memory"],
      risk: "low"
    }],
    concepts: [{
      id: "navigation",
      title: "Navigation",
      summary: "Keyboard and tree navigation behavior.",
      relatedNodeIds: ["project.intent"],
      relatedFiles: ["packages/app/src/components/TreeList.tsx"],
      tags: ["ui"],
      evidence: []
    }],
    config: {
      version: "0.1.0",
      projectName: "Sample",
      createdAt: "2026-05-08T00:00:00.000Z",
      sourceRoot: ".",
      ignored: [],
      respectGitignore: false,
      treeBuilder: "deterministic",
      installMode: "full",
      visualApp: {
        enabled: true,
        defaultPort: 4317
      }
    },
    files: [],
    importGraph: {
      edges: [],
      externalImports: [],
      unresolvedImports: [],
      cycles: [],
      workspacePackages: []
    },
    invariants: [{
      id: "tree-memory",
      title: "Tree memory",
      description: "Tree memory stays aligned with code changes.",
      nodeIds: ["project.intent"],
      filePaths: ["packages/app/src/App.tsx"],
      severity: "medium"
    }],
    nodes: sampleNodes(),
    ontology: []
  };
}

function sampleNodes(): TreeNode[] {
  return [
    node("project.intent", "Project intent", "intent", "Root project purpose.", ["architecture.app"]),
    node("architecture.app", "Visual app", "architecture", "Visual application shell.", ["feature.checkout", "feature.search"], "project.intent"),
    node("feature.checkout", "Checkout explorer", "feature", "Nested checkout UI.", [], "architecture.app", ["src/checkout.tsx"]),
    node("feature.search", "Search", "feature", "Search UI.", [], "architecture.app")
  ];
}

function sampleWorkflow(): WorkflowViewState {
  return {
    contextPacks: [{
      id: "context.visual-workflow",
      target: "visual workflow",
      file: ".abstraction-tree/context-packs/context.visual-workflow.json",
      createdAt: "2026-05-13T12:00:00.000Z",
      stats: {
        nodes: 2,
        files: 3,
        concepts: 1,
        invariants: 1,
        changes: 1,
        selectedDiagnostics: 4,
        excludedDiagnostics: 1,
        estimatedTokens: 1200
      }
    }],
    goalWorkspaces: [{
      id: "2026-05-13-1200-visual-workflow",
      title: "Improve visual workflow",
      status: "planned",
      mode: "review-required",
      createdAt: "2026-05-13T12:00:00.000Z",
      workspacePath: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow",
      goalPath: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/goal.md",
      missionDirPath: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/missions",
      summary: "Add visual support for goal workspaces.",
      stats: {
        affectedFileCount: 3,
        affectedNodeCount: 1,
        affectedConceptCount: 1,
        invariantCount: 1,
        plannedTaskCount: 2,
        unresolvedItemCount: 1,
        checkCount: 2,
        failedCheckCount: 0
      },
      reports: [{
        label: "Goal assessment",
        path: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/goal-assessment.md",
        kind: "markdown"
      }, {
        label: "Mission plan",
        path: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/mission-plan.json",
        kind: "json"
      }],
      missionStages: [{
        id: "analysis",
        title: "Analysis",
        status: "complete",
        summary: "Scope has been mapped.",
        actions: ["Goal assessment written."],
        contextPacks: [{
          label: "visual workflow",
          path: ".abstraction-tree/context-packs/context.visual-workflow.json",
          kind: "context-pack"
        }],
        evidence: [{
          label: "Goal assessment",
          path: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/goal-assessment.md",
          kind: "markdown"
        }]
      }, {
        id: "planning",
        title: "Planning",
        status: "complete",
        summary: "Two missions planned.",
        actions: ["visual-workflow-00-scope: Map scope"],
        contextPacks: [],
        evidence: []
      }, {
        id: "execution",
        title: "Execution",
        status: "pending",
        summary: "Mission execution is pending review.",
        actions: ["not-run: npm.cmd test"],
        contextPacks: [],
        evidence: []
      }, {
        id: "review",
        title: "Review",
        status: "complete",
        summary: "Coherence review written.",
        actions: ["Coherence review written."],
        contextPacks: [],
        evidence: []
      }],
      missions: [{
        id: "visual-workflow-00-scope",
        title: "Map scope, invariants, and non-goals",
        priority: "P0",
        risk: "low",
        dependsOn: [],
        affectedAreas: ["app"],
        successChecks: ["npm.cmd test"],
        evidence: [{
          label: "00-scope.md",
          path: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/missions/00-scope.md",
          kind: "mission"
        }]
      }],
      scopeReviewId: "2026-05-13-1200-visual-workflow-scope",
      coherenceReviewId: "2026-05-13-1200-visual-workflow-coherence",
      score: 5
    }],
    scopeReviews: [{
      id: "2026-05-13-1200-visual-workflow-scope",
      status: "ready",
      file: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/scope-contract.json",
      prompt: "Add visual support for goal workspaces.",
      createdAt: "2026-05-13T12:00:00.000Z",
      workspaceId: "2026-05-13-1200-visual-workflow",
      summary: "ready: Add visual support for goal workspaces. No scope check violations recorded.",
      stats: {
        selectedCount: 2,
        excludedCount: 1,
        questionableCount: 1,
        violationCount: 0,
        affectedNodeCount: 1,
        allowedFileCount: 3
      },
      selections: [{
        id: "packages/app/src/App.tsx",
        label: "packages/app/src/App.tsx",
        kind: "file",
        status: "selected",
        impact: "high",
        reason: "Selected by affected-tree mapping."
      }, {
        id: "ci",
        label: "ci",
        kind: "area",
        status: "excluded",
        impact: "high",
        reason: "Excluded because it is outside the selected scope areas."
      }, {
        id: "ambiguous scope",
        label: "Scope ambiguity",
        kind: "check",
        status: "questionable",
        impact: "high",
        reason: "Clarify whether this includes mission execution."
      }],
      violations: [],
      evidence: [{
        label: "Scope contract",
        path: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/scope-contract.json",
        kind: "scope"
      }]
    }],
    coherenceReviews: [{
      id: "2026-05-13-1200-visual-workflow-coherence",
      status: "planned",
      file: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/coherence-review.md",
      workspaceId: "2026-05-13-1200-visual-workflow",
      summary: "Mission execution is incomplete.",
      findings: [{
        label: "Final verdict",
        value: "planned",
        tone: "warn"
      }],
      evidence: [{
        label: "Coherence review",
        path: ".abstraction-tree/goals/2026-05-13-1200-visual-workflow/coherence-review.md",
        kind: "markdown"
      }]
    }]
  };
}

function node(
  id: string,
  title: string,
  level: string,
  summary: string,
  children: string[],
  parent?: string,
  ownedFiles: string[] = []
): TreeNode {
  return {
    id,
    name: title,
    title,
    abstractionLevel: level,
    level,
    summary,
    explanation: `${title} explains its role, owned scope, relationships, and safe change guidance for human and agent readers.`,
    reasonForExistence: `${title} exists to make this project area understandable and safely scoped for humans and agents.`,
    separationLogic: children.length ? `${title} children are partitioned by the next narrower scope boundary.` : undefined,
    children,
    parent,
    sourceFiles: ownedFiles,
    ownedFiles,
    responsibilities: [],
    dependencies: [],
    dependsOn: [],
    changeLog: [],
    invariants: [],
    changePolicy: {
      allowedToChange: ownedFiles,
      mustNotChange: []
    },
    confidence: 0.9
  };
}
