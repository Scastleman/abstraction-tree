import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFile } from "./scanner.js";
import { detectFileDrift } from "./validator.js";

test("detectFileDrift reports stale file summaries and new files", () => {
  const stored = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\n", 26);
  const current = summarizeFile("src/checkout.ts", ".ts", "export const checkout = 1;\nexport const tax = 0;\n", 48);
  const added = summarizeFile("src/payment.ts", ".ts", "export const payment = 1;\n", 25);

  const issues = detectFileDrift([stored], [current, added]);

  assert.ok(issues.some(issue => issue.filePath === "src/checkout.ts" && issue.message.includes("changed since the last scan")));
  assert.ok(issues.some(issue => issue.filePath === "src/payment.ts" && issue.message.includes("missing from abstraction memory")));
});

test("detectFileDrift reports files removed from disk", () => {
  const stored = summarizeFile("src/old.ts", ".ts", "export const oldFlow = true;\n", 28);

  const issues = detectFileDrift([stored], []);

  assert.ok(issues.some(issue => issue.filePath === "src/old.ts" && issue.message.includes("no longer present")));
});
