---
id: mission-009
title: Improve concept extraction quality and evidence
priority: P1
status: completed
project: abstraction-tree
---

# Mission 009: Improve concept extraction quality and evidence

## Objective

Reduce noisy concepts and make generated concepts explainable, stable, and useful for agent context.

## Why this matters

Current concept extraction is lexical over paths, symbols, and exports. It can surface generic filler tokens, especially from Markdown docs.

## Scope

- Add concept quality fixtures with expected concepts for this repo and the example app.
- Expand stop words and penalize generic documentation filler words.
- Require stronger evidence for Markdown-derived concepts.
- Cluster related singular/plural and compound terms.
- Persist concept evidence such as path, symbol, export, and doc signals.

## Non-goals

- Do not add default LLM concept inference in this mission.
- Do not make output nondeterministic.

## Likely touchpoints

- `packages/core/src/treeBuilder.ts`
- `packages/core/src/treeBuilder.test.ts`
- `packages/core/src/schema.ts`
- `.abstraction-tree/concepts.json`

## Acceptance criteria

- [ ] Noisy filler concepts are reduced in regenerated memory.
- [ ] Expected domain concepts remain present.
- [ ] Each concept includes evidence sufficient for debugging.
- [ ] Fixture tests fail on major concept-quality regressions.

## Suggested checks

```bash
npm run build
npm test
npm run atree:scan
npm run atree:validate
```

## Completion notes

- Implementation summary: Added deterministic concept evidence, stronger concept scoring/filtering, Markdown doc signal handling, singular/plural normalization, compound concept clustering, and fixture coverage for repo and example-app concept quality. Regenerated `.abstraction-tree/concepts.json` with evidence and repaired stale change-record node references after concept ids changed.
- Tests run: `npm run build`; `npm test`; `npm run atree:scan`; `npm run atree:validate`.
- Follow-up risks: Concept selection is still deterministic and lexical; future tuning may need a compatibility strategy for historical change records when concept ids are intentionally renamed or dropped.
