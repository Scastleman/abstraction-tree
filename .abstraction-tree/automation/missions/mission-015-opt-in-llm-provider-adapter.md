---
id: mission-015
title: Implement the first explicit opt-in LLM provider adapter
priority: P2
status: completed
project: abstraction-tree
---

# Mission 015: Implement the first explicit opt-in LLM provider adapter

## Objective

Exercise the existing provider-neutral LLM interface without changing deterministic defaults or writing unvalidated LLM output directly to memory.

## Why this matters

The core already exposes `LlmAbstractionBuilder`, and docs say LLM output should be proposal-only until validated. A minimal adapter will prove the interface and review flow.

## Scope

- Add an adapter package or example adapter outside the deterministic core path.
- Add CLI command such as `atree propose --provider <name>` or an adapter integration example.
- Store proposals separately from canonical `.abstraction-tree` memory.
- Run existing validators against proposed ontology/tree changes.
- Document human review and policy gates before applying proposals.

## Non-goals

- Do not call an LLM during default `scan`, `validate`, `context`, `evaluate`, or `serve`.
- Do not require API keys for deterministic MVP commands.

## Likely touchpoints

- `packages/core/src/llm/**`
- `packages/cli/src/index.ts`
- `docs/ARCHITECTURE.md`
- `docs/AGENT_PROTOCOL.md`

## Acceptance criteria

- [x] Default commands remain deterministic and API-key-free.
- [x] Adapter output is saved as proposals, not canonical memory.
- [x] Proposal validation catches malformed or unsafe changes.
- [x] Docs explain adapter setup and review workflow.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: Added core proposal collection, validation, review-gated proposal records, and `.abstraction-tree/proposals/` storage; added explicit `atree propose --provider <name>` adapter loading; added a checkout-local `adapters/local-json` reference adapter for captured provider JSON; documented setup, validation, review, and policy gates.
- Tests run: `npm.cmd run build`; `npm.cmd test`; `npm.cmd run atree:scan`; `npm.cmd run atree:validate`.
- Follow-up risks: Real networked provider adapters still need provider-specific prompt, auth, retry, redaction, and rate-limit handling; proposal application remains intentionally manual until a separate reviewed apply workflow exists.
