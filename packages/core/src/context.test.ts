import assert from "node:assert/strict";
import test from "node:test";
import { buildContextPack } from "./context.js";
import { CONTEXT_PACK_LIMITS } from "./contextLimits.js";
import type { Concept, FileSummary, Invariant, TreeNode } from "./schema.js";

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
    tags: ["payment", "billing"]
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
    tags: ["automation"]
  }));

  const pack = buildContextPack({ target: "automation", nodes, files, concepts, invariants: [], changes: [] });

  assert.equal(pack.relevantNodes.length, CONTEXT_PACK_LIMITS.nodes);
  assert.equal(pack.relevantFiles.length, CONTEXT_PACK_LIMITS.files);
  assert.equal(pack.relevantConcepts.length, CONTEXT_PACK_LIMITS.concepts);
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
