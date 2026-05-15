---
id: mission-06-context-quality-benchmarks
title: Create a repeatable context-quality benchmark suite
priority: P1
risk: medium
category: quality
affectedFiles:
  - packages/core/src/context.test.ts
  - packages/core/src/evaluator.ts
  - packages/core/src/evaluator.test.ts
  - examples/
  - docs/release-evidence/2026-05-15-diverse-repository-beta-evaluation.md
affectedNodes:
  - subsystem.core.engine
  - subsystem.tests.quality
  - subsystem.docs.examples
dependsOn:
  - mission-04-context-fallback
  - mission-05-concept-quality
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Create a repeatable context-quality benchmark suite

## Goal

Turn the diverse-repository findings into deterministic benchmark fixtures that protect context relevance over time.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

The diverse evaluation identified prompt/file expectations across Vite, Click, fd, rust-lang/book, and the Mern tutorial. These should become repeatable tests or benchmark fixtures so improvements do not regress.

## Scope

- Add fixtures or synthetic reduced projects that represent the observed patterns.
- Add expected inclusion checks for context, route, and maybe scope.
- Avoid cloning external repos inside normal unit tests.

## Out of Scope

No normal CI cloning of external repositories. No reliance on network availability.

## Required Checks

- Unit/integration tests using local fixtures.
- `npm run coverage`.
- Make benchmark deterministic and reasonably fast.

## Success Criteria

- Fixtures cover all five diverse-repo categories.
- Each fixture has at least one prompt with expected file inclusions.
- Failing benchmark explains missing files/nodes.
- Benchmarks do not require internet access in CI.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 06: Create a repeatable context-quality benchmark suite

## Mission metadata

- **Mission file:** `06-context-quality-benchmarks.md`
- **Priority:** P1
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Turn the diverse-repository findings into deterministic benchmark fixtures that protect context relevance over time.

## Evidence and problem statement

The diverse evaluation identified prompt/file expectations across Vite, Click, fd, rust-lang/book, and the Mern tutorial. These should become repeatable tests or benchmark fixtures so improvements do not regress.

## Scope Codex may change

- Add fixtures or synthetic reduced projects that represent the observed patterns.
- Add expected inclusion checks for context, route, and maybe scope.
- Avoid cloning external repos inside normal unit tests.

## Likely files or modules

Likely files: `examples/`, `packages/core/src/*test.ts`, `scripts/`, `docs/CI_INTEGRATION.md`.

## Implementation plan

1. Create compact fixtures under `examples/` or `packages/core/test-fixtures/` that mirror key structures: Vite pnpm monorepo, Click Python package, fd Rust CLI, mdBook docs repo, and Mern full-stack app.
2. Define prompts and expected inclusions in JSON.
3. Implement a benchmark runner or test helper that scans the fixture, builds context packs, routes prompts, and checks expected files/nodes/concepts.
4. Include token-budget variants, such as 4000-token tight budget and unbounded budget.
5. Report missing expected inclusions with actionable messages.
6. Optionally add a non-CI script for running against real external repositories.

## Required tests and validation

- Unit/integration tests using local fixtures.
- `npm run coverage`.
- Make benchmark deterministic and reasonably fast.

## Acceptance criteria

- Fixtures cover all five diverse-repo categories.
- Each fixture has at least one prompt with expected file inclusions.
- Failing benchmark explains missing files/nodes.
- Benchmarks do not require internet access in CI.

## Risks and review notes

Risk: fixtures can become too artificial. Keep them small but structurally faithful.

## Out of scope

No normal CI cloning of external repositories. No reliance on network availability.
