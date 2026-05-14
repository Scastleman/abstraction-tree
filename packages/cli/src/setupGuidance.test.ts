import assert from "node:assert/strict";
import test from "node:test";
import { defaultConfig } from "@abstraction-tree/core";
import { formatInitGuidance, formatScanGuidance } from "./setupGuidance.js";

test("init guidance for full mode points to scan and serve --open", () => {
  assert.deepEqual(formatInitGuidance("full", "."), [
    "Next:",
    "  atree scan --project .",
    "  atree serve --project . --open"
  ]);
});

test("scan guidance for full mode points to serve --open", () => {
  const config = defaultConfig(process.cwd(), "full", "Visual Project");

  assert.deepEqual(formatScanGuidance(config, "."), [
    "View the project map:",
    "  atree serve --project . --open"
  ]);
});

test("scan guidance for core mode explains how to enable the app", () => {
  const config = defaultConfig(process.cwd(), "core", "Core Project");

  assert.deepEqual(formatScanGuidance(config, "../my project"), [
    "Core mode is active. To enable the visual app:",
    "  atree mode full --project \"../my project\"",
    "  atree serve --project \"../my project\" --open"
  ]);
});
