---
id: mission-14-non-js-dependency-graphs
title: Add lightweight non-JS dependency graph extraction
priority: P2
risk: high
category: product-value
affectedFiles:
  - packages/core/src/importGraph.ts
  - packages/core/src/scanner.ts
  - packages/core/src/schema.ts
  - packages/core/src/treeBuilder.ts
  - packages/core/src/*.test.ts
affectedNodes:
  - subsystem.core.engine
  - subsystem.tests.quality
dependsOn:
  - mission-07-python-architecture
  - mission-08-rust-architecture
  - mission-09-docs-book-architecture
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Add lightweight non-JS dependency graph extraction

## Goal

Deepening non-JS evidence will improve architecture inference and context selection for Python, Rust, Go, and docs repositories.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

Current import graph support is strongest for JS/TS. Diverse testing showed that Python, Rust, and docs-heavy repos scan successfully but have thin architecture inference.

## Scope

- Add lightweight deterministic dependency extraction without requiring compilers.
- Keep language-specific behavior conservative.
- Add schema support if needed.

## Out of Scope

No compiler invocation or language server requirement in default scan.

## Required Checks

- Language fixture tests for Python, Rust, Go, and Markdown.
- Import graph cycle/unresolved tests for non-JS where applicable.
- `npm test`, `npm run coverage`.

## Success Criteria

- Non-JS local dependency edges appear in import graph or equivalent dependency graph.
- Architecture/context improves for Python/Rust/docs fixtures.
- Existing JS/TS import graph behavior is unchanged.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 14: Add lightweight non-JS dependency graph extraction

## Mission metadata

- **Mission file:** `14-non-js-dependency-graphs.md`
- **Priority:** P2/P3
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Deepening non-JS evidence will improve architecture inference and context selection for Python, Rust, Go, and docs repositories.

## Evidence and problem statement

Current import graph support is strongest for JS/TS. Diverse testing showed that Python, Rust, and docs-heavy repos scan successfully but have thin architecture inference.

## Scope Codex may change

- Add lightweight deterministic dependency extraction without requiring compilers.
- Keep language-specific behavior conservative.
- Add schema support if needed.

## Likely files or modules

Likely files: `packages/core/src/importGraph.ts` or new language graph modules, `packages/core/src/scanner.ts`, tests, docs.

## Implementation plan

1. Python: resolve `import x` and `from x import y` to project-local package files where possible.
2. Rust: resolve `mod`, `use crate::`, and `use super::` patterns to `src/*.rs` and module directories.
3. Go: resolve imports under the module path from `go.mod`.
4. Markdown/docs: resolve links to local `.md` files, listings, images, and referenced code files.
5. Add edge kinds or language tags to import graph.
6. Feed edges into architecture inference and context scoring.

## Required tests and validation

- Language fixture tests for Python, Rust, Go, and Markdown.
- Import graph cycle/unresolved tests for non-JS where applicable.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Non-JS local dependency edges appear in import graph or equivalent dependency graph.
- Architecture/context improves for Python/Rust/docs fixtures.
- Existing JS/TS import graph behavior is unchanged.

## Risks and review notes

Risk: partial dependency resolvers can be misleading. Mark them as deterministic best-effort and expose unresolved/unknown cases.

## Out of scope

No compiler invocation or language server requirement in default scan.
