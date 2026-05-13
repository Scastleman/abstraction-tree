import assert from "node:assert/strict";
import test from "node:test";
import { buildContextPack, formatContextPackMarkdown } from "./context.js";
import { CONTEXT_PACK_LIMITS } from "./contextLimits.js";
import type { Concept, ContextPack, ContextSelectionKind, FileSummary, Invariant, TreeNode } from "./schema.js";

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
    separationLogic: "Children would be partitioned by scope boundary."
  }];

  const pack = buildContextPack({ target: "overreach restriction", nodes, files, concepts: [], invariants: [], changes: [] });
  const markdown = formatContextPackMarkdown(pack);

  assert.deepEqual(pack.relevantNodes.map(n => n.id), ["file.scope.guard"]);
  assert.match(markdown, /Explanation: This node explains prompt overreach restriction/);
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

test("formatContextPackMarkdown emits markdown context packs", () => {
  const files = [file("src/ui/form.tsx", ["CheckoutForm"], ["CheckoutForm"])];
  const nodes = [{
    ...node("file.form", "Form", "UI form component.", ["src/ui/form.tsx"]),
    explanation: "Checkout form node explanation for context markdown."
  }];
  const pack = buildContextPack({ target: "checkout", nodes, files, concepts: [], invariants: [], changes: [], includeDiagnostics: true });

  const markdown = formatContextPackMarkdown(pack);

  assert.match(markdown, /^# Context Pack: checkout/);
  assert.match(markdown, /## Relevant Files/);
  assert.match(markdown, /`src\/ui\/form.tsx`/);
  assert.match(markdown, /Explanation:/);
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
