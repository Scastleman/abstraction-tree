---
id: mission-010
title: Add context-pack token budgets and `--why` diagnostics
priority: P1
status: completed
project: abstraction-tree
---

# Mission 010: Add context-pack token budgets and `--why` diagnostics

## Objective

Make context packs easier to trust and safer for agents by explaining selection reasons and respecting target budgets.

## Why this matters

Context selection is currently relevance-scored with hardcoded limits. Agents need to know why files were selected and how much context is being consumed.

## Scope

- Add CLI options: `--format json|markdown`, `--max-tokens <n>`, and `--why`.
- Track scoring reasons for nodes, files, concepts, and invariants.
- Estimate token cost or character budget per selected item.
- Show excluded-but-nearby candidates when `--why` is enabled.
- Add tests for scoring diagnostics and budget truncation.

## Non-goals

- Do not require a tokenizer package in the first pass if a documented approximation is enough.

## Likely touchpoints

- `packages/core/src/context.ts`
- `packages/core/src/context.test.ts`
- `packages/cli/src/index.ts`
- `docs/AGENT_PROTOCOL.md`

## Acceptance criteria

- [ ] Context packs can be emitted as Markdown.
- [ ] `--why` explains every selected file or node.
- [ ] `--max-tokens` or equivalent budget meaningfully limits output size.
- [ ] Existing JSON output remains backward compatible by default.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Record implementation summary here.
- Record tests run here.
- Record follow-up risks here.

Implementation summary:
- Added optional context-pack diagnostics with per-item scores, selected-item token estimates, reasons, and nearby exclusions.
- Added approximate `--max-tokens` budget selection, `--why` diagnostics, and `--format json|markdown` CLI output while keeping default JSON packs unchanged.
- Added Markdown formatting and documented the deterministic `approximate-json-chars-div-4` estimator.

Tests run:
- `npm run build`
- `npm test`
- `npm run atree:validate`
- `node packages/core/dist/context.test.js`

Follow-up risks:
- Token counts are deterministic estimates, not provider-tokenizer counts.
- `--why` diagnostics explain selection and nearby exclusions, but their own output size is diagnostic overhead outside the selected-item budget estimate.
