import assert from "node:assert/strict";
import test from "node:test";
import { routePrompt, type Concept, type FileSummary, type TreeNode } from "./index.js";

test("router sends simple documentation typo prompts to direct", () => {
  const result = routePrompt({
    prompt: "Fix the typo in README.",
    ...fixtureMemory()
  });

  assert.equal(result.decision, "direct");
  assert.equal(result.estimatedComplexity, "low");
  assert.equal(result.estimatedRisk, "low");
  assert.ok(result.estimatedAffectedLayers.includes("docs"));
  assert.match(result.recommendedCommand, /Direct execution recommended/);
});

test("router keeps small code bug fixes direct when memory points to a narrow area", () => {
  const result = routePrompt({
    prompt: "Fix the null check bug in checkout validation.",
    ...fixtureMemory()
  });

  assert.equal(result.decision, "direct");
  assert.notEqual(result.estimatedRisk, "high");
  assert.ok(result.estimatedFiles.includes("src/checkout/validation.ts"));
  assert.ok(result.reasons.some(reason => reason.includes("Abstraction memory matched")));
});

test("router sends complex multi-area implementation prompts to goal-driven", () => {
  const result = routePrompt({
    prompt: "Add subscription billing with Stripe checkout, webhooks, user plans, tests, and docs.",
    promptFile: "prompts/subscription-billing.md",
    ...fixtureMemory()
  });

  assert.equal(result.decision, "goal-driven");
  assert.equal(result.estimatedComplexity, "high");
  assert.equal(result.estimatedRisk, "high");
  assert.ok(result.estimatedAffectedLayers.includes("architecture"));
  assert.ok(result.estimatedAffectedLayers.includes("module"));
  assert.ok(result.estimatedAffectedLayers.includes("tests"));
  assert.ok(result.estimatedAffectedLayers.includes("docs"));
  assert.equal(result.recommendedCommand, "npm run atree:goal -- --file prompts/subscription-billing.md --review-required");
});

test("router sends broad strategy prompts to assessment packs", () => {
  const result = routePrompt({
    prompt: "Assess the whole repo and make a roadmap of improvements.",
    ...fixtureMemory()
  });

  assert.equal(result.decision, "assessment-pack");
  assert.equal(result.recommendedCommand, "npm run assessment:pack");
});

test("router sends destructive safety-bypass prompts to manual review", () => {
  const result = routePrompt({
    prompt: "Delete the existing validation system and bypass failing tests.",
    ...fixtureMemory()
  });

  assert.equal(result.decision, "manual-review");
  assert.equal(result.estimatedRisk, "high");
  assert.ok(result.reasons.some(reason => reason.includes("bypass tests")));
});

test("router does not treat negated safety constraints as the requested action", () => {
  const result = routePrompt({
    prompt: "Add a small docs note. Do not delete files, edit secrets, or bypass tests.",
    ...fixtureMemory()
  });

  assert.notEqual(result.decision, "manual-review");
});

test("router does not treat ambiguous high-impact rewrites as direct", () => {
  const result = routePrompt({
    prompt: "Rewrite the whole architecture.",
    ...fixtureMemory()
  });

  assert.notEqual(result.decision, "direct");
  assert.ok(["manual-review", "assessment-pack", "goal-driven"].includes(result.decision));
});

test("router handles missing abstraction memory with reduced confidence", () => {
  const result = routePrompt({
    prompt: "Fix the typo in README.",
    memoryAvailable: false,
    memoryIssues: ["tree.json is missing."]
  });

  assert.equal(result.decision, "direct");
  assert.ok(result.confidence < 0.8);
  assert.ok(result.reasons.some(reason => reason.includes("Abstraction memory missing or incomplete")));
});

function fixtureMemory(): {
  nodes: TreeNode[];
  files: FileSummary[];
  concepts: Concept[];
  memoryAvailable: boolean;
} {
  return {
    nodes: [
      node("project.intent", "Project intent", "project", "Project purpose and safe scope.", ["README.md"]),
      node("architecture.checkout", "Checkout architecture", "architecture", "Checkout validation and billing flow.", [
        "src/checkout/validation.ts",
        "src/billing/subscriptions.ts",
        "src/billing/webhooks.ts"
      ]),
      node("module.docs", "Documentation", "module", "README and docs explain workflows.", [
        "README.md",
        "docs/billing.md"
      ]),
      node("module.tests", "Tests", "module", "Unit tests cover checkout and billing behavior.", [
        "tests/checkout.test.ts",
        "tests/billing.test.ts"
      ])
    ],
    files: [
      file("README.md", "Project README documentation.", false),
      file("docs/billing.md", "Billing documentation.", false),
      file("src/checkout/validation.ts", "Checkout validation null checks.", false, ["validateCheckout"]),
      file("src/billing/subscriptions.ts", "Subscription billing plans.", false, ["createSubscription"]),
      file("src/billing/webhooks.ts", "Stripe webhook integration.", false, ["handleStripeWebhook"]),
      file("tests/checkout.test.ts", "Checkout validation tests.", true),
      file("tests/billing.test.ts", "Billing and webhook tests.", true)
    ],
    concepts: [{
      id: "billing",
      title: "Billing",
      summary: "Subscription billing and Stripe checkout.",
      relatedNodeIds: ["architecture.checkout"],
      relatedFiles: ["src/billing/subscriptions.ts", "src/billing/webhooks.ts", "docs/billing.md"],
      tags: ["billing", "stripe", "checkout"],
      evidence: []
    }],
    memoryAvailable: true
  };
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
