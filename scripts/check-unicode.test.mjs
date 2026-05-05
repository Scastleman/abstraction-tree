import assert from "node:assert/strict";
import test from "node:test";
import { findSuspiciousUnicode, sanitizeLine } from "./check-unicode.mjs";

test("findSuspiciousUnicode reports bidi controls with location and code point", () => {
  const marker = String.fromCodePoint(0x202e);
  const findings = findSuspiciousUnicode("src/example.ts", `const safe = true;\nconst hidden = "${marker}";`);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].filePath, "src/example.ts");
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].codePoint, "U+202E");
  assert.equal(findings[0].name, "RIGHT-TO-LEFT OVERRIDE");
});

test("sanitizeLine replaces controls with visible placeholders", () => {
  const marker = String.fromCodePoint(0x2066);

  assert.equal(sanitizeLine(`before${marker}after`), "before<U+2066>after");
});
