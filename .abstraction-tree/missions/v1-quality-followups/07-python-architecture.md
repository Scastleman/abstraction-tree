---
id: mission-07-python-architecture
title: Add Python architecture heuristics
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

Add Python architecture heuristics

## Goal

Improve architecture inference and context ranking for Python packages such as Click.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

In diverse testing, `pallets/click` scanned cleanly but had 0% architecture coverage. Context for option/envvar parsing missed stronger files like parser/default/options tests.

## Scope

- Add Python-specific architecture nodes and path/symbol heuristics.
- Improve ranking of Python source/test files.
- Keep default scan deterministic.

## Out of Scope

No Python AST dependency required unless lightweight and justified.

## Required Checks

- Architecture inference tests for Python fixtures.
- Context benchmark for option/envvar prompt.
- `npm test`, `npm run coverage`.

## Success Criteria

- Python fixture architecture coverage is nonzero.
- Context includes parser/options/default source and tests for relevant prompts.
- Route/context agreement improves in benchmarks.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 07: Add Python architecture heuristics

## Mission metadata

- **Mission file:** `07-python-architecture.md`
- **Priority:** P1
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Improve architecture inference and context ranking for Python packages such as Click.

## Evidence and problem statement

In diverse testing, `pallets/click` scanned cleanly but had 0% architecture coverage. Context for option/envvar parsing missed stronger files like parser/default/options tests.

## Scope Codex may change

- Add Python-specific architecture nodes and path/symbol heuristics.
- Improve ranking of Python source/test files.
- Keep default scan deterministic.

## Likely files or modules

Likely files: `packages/core/src/treeBuilder.ts`, `packages/core/src/context.ts`, tests, docs.

## Implementation plan

1. Detect Python packages through `pyproject.toml`, `setup.py`, `setup.cfg`, `src/<package>/`, and top-level package folders.
2. Detect tests via `tests/`, `test_*.py`, and `*_test.py`.
3. Detect CLI patterns from imports and symbols: `click`, `typer`, `argparse`, `main`, console entry points.
4. Add architecture nodes such as Package API, CLI Entry Points, Parser/Options Layer, Tests, Docs, and Packaging Metadata.
5. Boost exact path/symbol matches in context for `.py` files.
6. Add fixture tests modeled after Click.

## Required tests and validation

- Architecture inference tests for Python fixtures.
- Context benchmark for option/envvar prompt.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Python fixture architecture coverage is nonzero.
- Context includes parser/options/default source and tests for relevant prompts.
- Route/context agreement improves in benchmarks.

## Risks and review notes

Risk: false architecture nodes in arbitrary Python repos. Base confidence on multiple signals and use fallback behavior when evidence is weak.

## Out of scope

No Python AST dependency required unless lightweight and justified.
