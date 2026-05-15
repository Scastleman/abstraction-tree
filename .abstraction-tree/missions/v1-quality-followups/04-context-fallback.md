---
id: mission-04-context-fallback
title: Preserve concrete edit files in context packs under token budgets
priority: P1
risk: medium
category: quality
affectedFiles:
  - packages/core/src/context.ts
  - packages/core/src/context.test.ts
  - packages/core/src/contextLimits.ts
  - packages/core/src/promptRouter.ts
  - packages/core/src/goal.ts
affectedNodes:
  - subsystem.core.engine
  - subsystem.goal.mission.automation
  - subsystem.tests.quality
dependsOn:
  - mission-03-import-classification
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Preserve concrete edit files in context packs under token budgets

## Goal

Improve context-pack selection so selected nodes retain representative source/test files even when a small token budget forces compaction.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

Diverse testing found context packs that selected useful nodes but zero relevant files, or selected weak files while route estimates found stronger source files. This weakens agent usefulness because agents need concrete edit boundaries.

## Scope

- Modify context-pack candidate selection and budgeting.
- Add diagnostics explaining compacted or forced-in files.
- Keep token-budget behavior deterministic.

## Out of Scope

No unlimited context growth. No LLM or embedding dependency in default path.

## Required Checks

- Context pack unit tests under tight budgets.
- Golden fixtures for no-empty-relevantFiles when selected nodes own files.
- `npm test`, `npm run coverage`.

## Success Criteria

- Relevant nodes with owned files produce representative `relevantFiles`.
- Exact source/test matches outrank broad docs/metadata.
- Diagnostics explain files kept or dropped.
- Token budget is still respected or failure is explicitly reported.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 04: Preserve concrete edit files in context packs under token budgets

## Mission metadata

- **Mission file:** `04-context-fallback.md`
- **Priority:** P1
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Improve context-pack selection so selected nodes retain representative source/test files even when a small token budget forces compaction.

## Evidence and problem statement

Diverse testing found context packs that selected useful nodes but zero relevant files, or selected weak files while route estimates found stronger source files. This weakens agent usefulness because agents need concrete edit boundaries.

## Scope Codex may change

- Modify context-pack candidate selection and budgeting.
- Add diagnostics explaining compacted or forced-in files.
- Keep token-budget behavior deterministic.

## Likely files or modules

Likely files: `packages/core/src/context.ts`, `packages/core/src/context.test.ts`, `packages/core/src/contextLimits.ts`, docs for context diagnostics.

## Implementation plan

1. Add a fallback phase after node selection that chooses representative files from selected nodes.
2. Prefer direct token matches in file path, symbols, exports, and summary.
3. Prefer source/test/docs files relevant to prompt over package metadata and CI/dependency files unless prompt mentions CI/package/release.
4. Compact node explanations before dropping all files.
5. Add `forcedBySelectedNode` or similar diagnostics to explain inclusion.
6. Ensure at least one representative file is included when selected nodes own files and budget allows minimal metadata.
7. Add tests for Mern auth flow, Rust traversal prompt, and Click option parsing patterns.

## Required tests and validation

- Context pack unit tests under tight budgets.
- Golden fixtures for no-empty-relevantFiles when selected nodes own files.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Relevant nodes with owned files produce representative `relevantFiles`.
- Exact source/test matches outrank broad docs/metadata.
- Diagnostics explain files kept or dropped.
- Token budget is still respected or failure is explicitly reported.

## Risks and review notes

Risk: overfilling context packs. Use compact file summaries and hard ceilings.

## Out of scope

No unlimited context growth. No LLM or embedding dependency in default path.
