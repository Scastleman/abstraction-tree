---
id: mission-03-import-classification
title: Classify static asset and generated-artifact imports separately
priority: P1
risk: medium
category: quality
affectedFiles:
  - packages/core/src/importGraph.ts
  - packages/core/src/importGraph.test.ts
  - packages/core/src/evaluator.ts
  - packages/core/src/schema.ts
  - packages/core/src/runtimeSchema.ts
  - docs/DATA_MODEL.md
affectedNodes:
  - subsystem.core.engine
  - subsystem.tests.quality
  - subsystem.docs.examples
dependsOn:
  - mission-02-pnpm-workspaces
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Classify static asset and generated-artifact imports separately

## Goal

Reduce false unresolved-import noise by separating static assets, virtual modules, and generated artifacts from true unresolved source imports.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

`vitejs/vite` had 117 unresolved imports, many of which were static assets such as `./assets/vite.svg` or generated outputs such as `./dist/index.js`. These should not be interpreted the same way as missing source files.

## Scope

- Extend import graph schema or derived evaluation fields.
- Add classification for asset, generated artifact, and virtual imports.
- Update evaluator messaging.
- Preserve true unresolved source import detection.

## Out of Scope

No broad suppression of unresolved imports.

## Required Checks

- Import graph tests for each classification.
- Evaluator tests showing reduced true unresolved count.
- Regression test that real unresolved source imports still fail/warn.
- `npm test`, `npm run coverage`.

## Success Criteria

- Static assets are not counted as true unresolved source imports.
- Generated build artifacts are classified separately.
- Evaluation reports distinguish these categories.
- Existing source import resolution behavior remains intact.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 03: Classify static asset and generated-artifact imports separately

## Mission metadata

- **Mission file:** `03-import-classification.md`
- **Priority:** P0/P1
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Reduce false unresolved-import noise by separating static assets, virtual modules, and generated artifacts from true unresolved source imports.

## Evidence and problem statement

`vitejs/vite` had 117 unresolved imports, many of which were static assets such as `./assets/vite.svg` or generated outputs such as `./dist/index.js`. These should not be interpreted the same way as missing source files.

## Scope Codex may change

- Extend import graph schema or derived evaluation fields.
- Add classification for asset, generated artifact, and virtual imports.
- Update evaluator messaging.
- Preserve true unresolved source import detection.

## Likely files or modules

Likely files: `packages/core/src/importGraph.ts`, `packages/core/src/evaluator.ts`, `packages/core/src/schema.ts`, `packages/core/src/runtimeSchema.ts`, tests, docs.

## Implementation plan

1. Define import categories such as `assetImports`, `generatedArtifactImports`, and `virtualImports`, or add a `classification` field to unresolved imports.
2. Recognize common asset extensions: `.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.ico`, `.css`, `.scss`, `.sass`, `.less`, `.wasm`, `.worker`, and framework-specific suffixes.
3. Recognize generated paths such as `dist/`, `dist-ts/`, `build/`, `.vite/`, `coverage/`, and known package build outputs.
4. Recognize virtual module prefixes such as `virtual:`, ``, and Vite-specific virtual/import query patterns.
5. Update evaluation so only true unresolved source imports count as architecture quality problems.
6. Add context-pack behavior so asset imports do not displace source relationships.

## Required tests and validation

- Import graph tests for each classification.
- Evaluator tests showing reduced true unresolved count.
- Regression test that real unresolved source imports still fail/warn.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Static assets are not counted as true unresolved source imports.
- Generated build artifacts are classified separately.
- Evaluation reports distinguish these categories.
- Existing source import resolution behavior remains intact.

## Risks and review notes

Risk: hiding real unresolved imports by over-broad classification. Use conservative extension/path matching and keep classified counts visible.

## Out of scope

No broad suppression of unresolved imports.
