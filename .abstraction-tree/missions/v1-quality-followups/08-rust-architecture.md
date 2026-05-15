---
id: mission-08-rust-architecture
title: Add Rust CLI architecture heuristics
priority: P1
risk: medium
category: product-value
affectedFiles:
  - packages/core/src/treeBuilder.ts
  - packages/core/src/treeBuilder.test.ts
  - packages/core/src/scanner.ts
  - packages/core/src/importGraph.ts
  - docs/CONFIGURATION.md
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

Add Rust CLI architecture heuristics

## Goal

Improve architecture inference and context ranking for Rust CLI projects such as fd.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

In diverse testing, `sharkdp/fd` scanned successfully but had 0% architecture coverage. Context selected weak metadata for traversal/hidden-file prompts instead of stronger Rust source and tests.

## Scope

- Add Rust-specific architecture nodes and path heuristics.
- Improve context weighting for Rust files and README option text.
- Keep deterministic behavior.

## Out of Scope

No dependency on rustc or cargo required for default scan.

## Required Checks

- Rust fixture architecture tests.
- Context benchmark for hidden-file traversal prompt.
- `npm test`, `npm run coverage`.

## Success Criteria

- Rust fixture architecture coverage is nonzero.
- Relevant prompts include `src/*.rs`, README, and tests before CI metadata.
- Route decisions remain plausible.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 08: Add Rust CLI architecture heuristics

## Mission metadata

- **Mission file:** `08-rust-architecture.md`
- **Priority:** P1
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Improve architecture inference and context ranking for Rust CLI projects such as fd.

## Evidence and problem statement

In diverse testing, `sharkdp/fd` scanned successfully but had 0% architecture coverage. Context selected weak metadata for traversal/hidden-file prompts instead of stronger Rust source and tests.

## Scope Codex may change

- Add Rust-specific architecture nodes and path heuristics.
- Improve context weighting for Rust files and README option text.
- Keep deterministic behavior.

## Likely files or modules

Likely files: `packages/core/src/treeBuilder.ts`, `packages/core/src/context.ts`, tests, docs.

## Implementation plan

1. Detect Rust projects with `Cargo.toml`, `Cargo.lock`, `src/main.rs`, `src/lib.rs`, `src/bin/`, `tests/`, and `benches/`.
2. Identify likely CLI modules through filenames and symbols: `cli`, `args`, `config`, `walk`, `traverse`, `filter`, `ignore`.
3. Add architecture nodes: Binary Entrypoint, CLI Argument Surface, Traversal/Search Engine, Config/Ignore Rules, Integration Tests, Packaging Metadata.
4. Boost README option matches and integration test names for CLI prompts.
5. Deprioritize CI/dependency metadata unless prompt mentions CI/release/dependencies.

## Required tests and validation

- Rust fixture architecture tests.
- Context benchmark for hidden-file traversal prompt.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Rust fixture architecture coverage is nonzero.
- Relevant prompts include `src/*.rs`, README, and tests before CI metadata.
- Route decisions remain plausible.

## Risks and review notes

Risk: too many CLI assumptions. Use filenames and imports/symbols as evidence, and keep generic fallback.

## Out of scope

No dependency on rustc or cargo required for default scan.
