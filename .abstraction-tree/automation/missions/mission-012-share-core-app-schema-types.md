---
id: mission-012
title: Share schema/types between core and app
priority: P1
status: completed
project: abstraction-tree
---

# Mission 012: Share schema/types between core and app

## Objective

Eliminate manual drift between core schema interfaces and app-side TypeScript types.

## Why this matters

The app duplicates core data types with looser optional fields. As schema evolves, app rendering can silently drift from core memory.

## Scope

- Export a UI-safe state type from core or a shared package.
- Update app imports to consume shared types.
- If direct core imports bloat the app, generate a shared `.d.ts` or schema artifact during build.
- Add a type-level or runtime contract test for `/api/state`.
- Remove redundant app type definitions where possible.

## Non-goals

- Do not force browser bundles to include Node-only core code.
- Do not loosen core schema for UI convenience.

## Likely touchpoints

- `packages/core/src/schema.ts`
- `packages/app/src/types.ts`
- `packages/app/src/main.tsx`
- `packages/cli/src/index.ts`

## Acceptance criteria

- [x] Core and app agree on state shape from one source of truth.
- [x] App build does not bundle unintended Node-only modules.
- [x] Contract test fails when `/api/state` shape diverges.
- [x] Duplicated app interfaces are removed or minimized.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: Added the shared `AbstractionTreeState` and `AgentHealth`
  contracts in core, moved `/api/state` loading into `packages/cli/src/apiState.ts`,
  and removed the duplicated app-side type declarations in favor of type-only core
  imports.
- Tests run: `npm run build`, `npm test`, `npm run atree:scan`, and
  `npm run atree:validate`.
- Follow-up risks: The app now relies on the core package's published type surface;
  packaging checks should remain part of release validation.
