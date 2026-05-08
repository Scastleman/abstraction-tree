import assert from "node:assert/strict";
import test from "node:test";
import { summarizeRunMarkdown } from "./agentHealth.js";

test("summarizeRunMarkdown reads current task heading", () => {
  const summary = summarizeRunMarkdown(`# Agent Run Report

## Task

Improve health parsing.

## Result

success
`);

  assert.deepEqual(summary, {
    task: "Improve health parsing.",
    result: "success"
  });
});

test("summarizeRunMarkdown keeps legacy task chosen heading compatibility", () => {
  const summary = summarizeRunMarkdown(`# Agent Run Report

## Task Chosen

Keep old reports visible.

## Result

partial - tests were not run
`);

  assert.deepEqual(summary, {
    task: "Keep old reports visible.",
    result: "partial"
  });
});

test("summarizeRunMarkdown recognizes no-op result spellings", () => {
  assert.equal(summarizeRunMarkdown("## Result\n\nnoop\n").result, "no-op");
  assert.equal(summarizeRunMarkdown("## Result\n\nno op\n").result, "no-op");
});
