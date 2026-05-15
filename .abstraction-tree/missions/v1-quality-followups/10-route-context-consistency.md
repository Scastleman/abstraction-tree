---
id: mission-10-route-context-consistency
title: Align route, context, scope, and goal file scoring
priority: P1
risk: high
category: quality
affectedFiles:
  - packages/core/src/promptRouter.ts
  - packages/core/src/context.ts
  - packages/core/src/scope.ts
  - packages/core/src/goal.ts
  - packages/core/src/*.test.ts
affectedNodes:
  - subsystem.core.engine
  - subsystem.goal.mission.automation
  - subsystem.tests.quality
dependsOn:
  - mission-04-context-fallback
  - mission-06-context-quality-benchmarks
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Align route, context, scope, and goal file scoring

## Goal

Reduce disagreement where route estimates identify strong files but context packs or scope contracts omit them.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

Diverse testing showed route estimates often found useful files while context packs sometimes selected zero or weak files. This creates confusing and less useful agent guidance.

## Scope

- Refactor shared scoring helpers where practical.
- Feed route evidence into context/scope/goal planning when available.
- Add diagnostics for disagreement.

## Out of Scope

No LLM, embeddings, or online services in default scoring.

## Required Checks

- Unit tests for shared scorer.
- Benchmark tests for route/context agreement.
- Regression tests for direct vs goal-driven routing.
- `npm test`, `npm run coverage`.

## Success Criteria

- Same prompt produces consistent affected-file evidence across route, context, scope, and goal.
- Exclusions are explained.
- No major routing behavior regressions.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 10: Align route, context, scope, and goal file scoring

## Mission metadata

- **Mission file:** `10-route-context-consistency.md`
- **Priority:** P1/P2
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Reduce disagreement where route estimates identify strong files but context packs or scope contracts omit them.

## Evidence and problem statement

Diverse testing showed route estimates often found useful files while context packs sometimes selected zero or weak files. This creates confusing and less useful agent guidance.

## Scope Codex may change

- Refactor shared scoring helpers where practical.
- Feed route evidence into context/scope/goal planning when available.
- Add diagnostics for disagreement.

## Likely files or modules

Likely files: `packages/core/src/promptRouter.ts`, `packages/core/src/context.ts`, `packages/core/src/scope.ts`, `packages/core/src/goal.ts`, tests.

## Implementation plan

1. Identify duplicated scoring logic in prompt router, context pack builder, scope builder, and goal planner.
2. Extract shared file/node/concept scoring utilities with stable deterministic behavior.
3. Add optional route-evidence input to context or goal planning.
4. Include route-estimated files in context fallback candidates.
5. Add diagnostics when route-selected files are excluded by context due to token budget or hard limits.
6. Add tests that route/context/scope all include a consistent core set of affected files for benchmark prompts.

## Required tests and validation

- Unit tests for shared scorer.
- Benchmark tests for route/context agreement.
- Regression tests for direct vs goal-driven routing.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Same prompt produces consistent affected-file evidence across route, context, scope, and goal.
- Exclusions are explained.
- No major routing behavior regressions.

## Risks and review notes

Risk: broad refactor could destabilize router. Prefer incremental shared helpers and tests.

## Out of scope

No LLM, embeddings, or online services in default scoring.
