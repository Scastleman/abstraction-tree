---
id: mission-011
title: Refactor and test the visual app
priority: P1
status: completed
project: abstraction-tree
---

# Mission 011: Refactor and test the visual app

## Objective

Turn the visual app from a single-file dashboard into a tested explorer with robust loading, error, and navigation behavior.

## Why this matters

`packages/app/src/main.tsx` currently contains most UI logic in one file and fetches `/api/state` once. Splitting and testing it will make future UI work safer.

## Scope

- Split UI into components: `TreeList`, `NodeDetails`, `AgentHealthPanel`, `ConceptPanel`, `InvariantPanel`, and `ChangeHistory`.
- Move state fetching into a hook with loading, error, retry, and refresh support.
- Render a nested tree using parent/children relationships instead of a flat-only list.
- Add app tests with React Testing Library or Playwright.
- Improve keyboard navigation and accessibility labels.

## Non-goals

- Do not change the local-first data contract in this mission.
- Do not introduce a backend database.

## Likely touchpoints

- `packages/app/src/main.tsx`
- `packages/app/src/components/**`
- `packages/app/src/hooks/**`
- `packages/app/src/*.test.tsx`

## Acceptance criteria

- [x] UI components are independently testable.
- [x] Failed `/api/state` fetch shows a useful error and retry control.
- [x] Nested tree relationships are visible.
- [x] App build and tests pass in CI.

## Suggested checks

```bash
npm run build -w @abstraction-tree/app
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: Split the visual app into `App`, a `/api/state` hook,
  and the requested component modules. Added loading, error, retry, and refresh
  behavior; nested parent/child tree rendering; roving tree keyboard movement;
  search labels; and accessible loading/error states.
- Tests run: `npm run build -w @abstraction-tree/app`, `npm test`,
  `npm run atree:validate`, `npm run lint`, `npm run typecheck`,
  `npm run check:unicode`, `npm run build`, `npm run format:check`,
  and `npm run coverage`.
- Follow-up risks: `npm run pack:smoke` could not start `npm pack --dry-run`
  in this sandbox because Node `child_process.spawn` returns `EPERM`. App tests
  use Node's built-in runner with React server rendering and pure helper checks
  because React Testing Library and Playwright are not installed in this
  workspace.
