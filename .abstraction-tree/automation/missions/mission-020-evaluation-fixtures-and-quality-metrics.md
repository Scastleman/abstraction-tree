---
id: mission-020
title: Add evaluation fixtures and quality metrics for generated memory
priority: P2
status: completed
project: abstraction-tree
---

# Mission 020: Add evaluation fixtures and quality metrics for generated memory

## Objective

Move beyond structural counters by testing whether generated tree, concept, and context outputs are semantically useful on stable fixtures.

## Why this matters

The evaluator already counts drift, runs, changes, lessons, and context breadth. It should also detect regression in generated memory quality for known projects.

## Scope

- Create fixture projects with expected tree nodes, concepts, invariants, and context-pack inclusions.
- Add snapshot-like tests that are stable but not overly brittle.
- Add metrics for noisy concepts, missing expected concepts, unresolved imports, and architecture coverage.
- Report fixture quality metrics in `atree evaluate` or a dedicated test script.
- Use metrics to guide future scanner/tree-builder changes.

## Non-goals

- Do not claim objective semantic correctness from a small fixture set.
- Do not make generated memory impossible to evolve.

## Likely touchpoints

- `packages/core/src/evaluator.ts`
- `packages/core/src/evaluator.test.ts`
- `examples/**`
- `docs/ROADMAP.md`

## Acceptance criteria

- [x] At least two fixture projects have expected-output tests.
- [x] Quality metrics fail on obvious noisy or missing concepts.
- [x] Evaluation output includes useful generated-memory quality signals.
- [x] Docs explain how to update fixtures when behavior intentionally changes.

## Suggested checks

```bash
npm run build
npm test
npm run atree:evaluate
npm run atree:validate
```

## Completion notes

- Implementation summary: Added generated-memory quality metrics to evaluator output, including fixture expectation coverage, noisy concept detection, unresolved import counts, architecture coverage, and expected context-pack inclusion checks. Added stable fixture expectation files for `examples/small-web-app` and `examples/inventory-api`, plus a dedicated generated-memory fixture test script.
- Tests run: `npm.cmd run typecheck -w @abstraction-tree/core`; `npm.cmd run build`; `node scripts\generated-memory-fixtures.test.mjs`; `npm.cmd test`; `npm.cmd run atree:scan`; `npm.cmd run atree:evaluate`; `npm.cmd run atree:validate`.
- Follow-up risks: Fixture expectations intentionally cover durable semantic signals rather than full snapshots, so future scanner/tree-builder changes should update fixture expectations only when the new behavior is intentional and still semantically useful.
