---
id: mission-09-docs-book-architecture
title: Add documentation/book architecture heuristics
priority: P1
risk: medium
category: product-value
affectedFiles:
  - packages/core/src/treeBuilder.ts
  - packages/core/src/treeBuilder.test.ts
  - packages/core/src/context.ts
  - docs/CONFIGURATION.md
  - docs/VISUAL_DEMO.md
affectedNodes:
  - subsystem.core.engine
  - subsystem.tests.quality
  - subsystem.docs.examples
dependsOn:
  - mission-06-context-quality-benchmarks
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Add documentation/book architecture heuristics

## Goal

Make documentation-heavy repositories navigable by treating chapters, summaries, listings, and build tooling as architecture surfaces.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

`rust-lang/book` scanned at scale and validated, but architecture coverage was only 0.79%. Documentation repositories still have meaningful structure that can guide agents.

## Scope

- Add docs/book architecture inference.
- Improve route/context ranking for chapter titles and docs paths.
- Avoid treating generated local evaluation artifacts as contamination.

## Out of Scope

No external docs build required in default tests.

## Required Checks

- Docs/book fixture tests.
- Context benchmark for ownership chapter and typo prompt.
- `npm test`, `npm run coverage`.

## Success Criteria

- Docs/book fixture has meaningful architecture coverage.
- Chapter prompts select expected chapter files.
- Broad restructuring prompts include `SUMMARY.md`, chapter groups, listings, and build tooling as appropriate.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 09: Add documentation/book architecture heuristics

## Mission metadata

- **Mission file:** `09-docs-book-architecture.md`
- **Priority:** P1
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Make documentation-heavy repositories navigable by treating chapters, summaries, listings, and build tooling as architecture surfaces.

## Evidence and problem statement

`rust-lang/book` scanned at scale and validated, but architecture coverage was only 0.79%. Documentation repositories still have meaningful structure that can guide agents.

## Scope Codex may change

- Add docs/book architecture inference.
- Improve route/context ranking for chapter titles and docs paths.
- Avoid treating generated local evaluation artifacts as contamination.

## Likely files or modules

Likely files: `packages/core/src/treeBuilder.ts`, `packages/core/src/scanner.ts`, `packages/core/src/context.ts`, tests, docs.

## Implementation plan

1. Detect mdBook/docs repos via `src/SUMMARY.md`, `book.toml`, `theme/`, `listings/`, chapters, appendices, and build scripts.
2. Create architecture nodes: Book Structure, Chapter Content, Listings/Examples, Build and Publishing, Translation/Editions, Editorial Quality Checks.
3. Parse Markdown headings and chapter paths for context scoring.
4. Boost exact chapter title/path matches for typo and restructuring prompts.
5. Add fixture for a small book with summary, chapters, listings, and build config.

## Required tests and validation

- Docs/book fixture tests.
- Context benchmark for ownership chapter and typo prompt.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Docs/book fixture has meaningful architecture coverage.
- Chapter prompts select expected chapter files.
- Broad restructuring prompts include `SUMMARY.md`, chapter groups, listings, and build tooling as appropriate.

## Risks and review notes

Risk: overfitting to mdBook. Keep generic docs-tree fallback for non-mdBook docs repos.

## Out of scope

No external docs build required in default tests.
