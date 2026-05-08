---
id: mission-017
title: Add `/api/state` contract tests
priority: P1
status: completed
project: abstraction-tree
---

# Mission 017: Add `/api/state` contract tests

## Objective

Guarantee that the CLI-served app API returns the shape expected by the visual app.

## Why this matters

The CLI constructs `/api/state` from config, ontology, tree, files, concepts, invariants, changes, and agent health. The app depends on this shape but currently duplicates types.

## Scope

- Extract state loading into a testable function from `packages/cli/src/index.ts`.
- Add tests using fixture `.abstraction-tree` memory.
- Validate that missing optional directories produce stable empty/default values.
- Add a runtime contract schema if mission 002 is complete or a local shape assertion otherwise.
- Document API state fields for app development.

## Non-goals

- Do not turn the local API into a public stable HTTP API yet.
- Do not add authentication in this mission.

## Likely touchpoints

- `packages/cli/src/index.ts`
- `packages/cli/src/*.test.ts`
- `packages/app/src/types.ts`
- `docs/DATA_MODEL.md`

## Acceptance criteria

- [x] Tests fail if API state omits fields required by the app.
- [x] Missing run/evaluation/automation files are handled safely.
- [x] The app can rely on one documented state shape.
- [x] Contract tests run in CI.

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

- Added a core runtime `/api/state` schema validator and wired the CLI state loader to assert it before returning state.
- Expanded CLI contract tests with populated fixture `.abstraction-tree` memory, required top-level field rejection, and missing health-file defaults.
- Moved derived app agent-health loading into the testable API state module and documented the state fields in `docs/DATA_MODEL.md`.

Tests run:

- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run atree:validate`
- `npm.cmd run format:check`
- `npm.cmd run lint`
- `npm.cmd run check:unicode`
- `node --input-type=module -e "await import('./packages/core/dist/runtimeSchema.test.js'); await import('./packages/cli/dist/apiState.test.js');"`

Follow-up risks:

- `/api/state` remains an internal CLI/app contract; this mission documents and validates the current shape without making it a public stable HTTP API.
