---
id: mission-007
title: Resolve local imports into a dependency graph
priority: P1
status: completed
project: abstraction-tree
---

# Mission 007: Resolve local imports into a dependency graph

## Objective

Convert raw import specifiers into resolved local file/package graph edges for architecture, impact, and cycle analysis.

## Why this matters

Tree nodes currently store dependencies as raw `import:<specifier>` strings. Resolved graph edges would make context packs and architecture views much more useful.

## Scope

- Add a graph builder that resolves relative JS/TS imports to repository file paths.
- Resolve workspace package imports to package roots or entrypoints where possible.
- Track external package imports separately from unresolved local imports.
- Expose graph data in memory or derived API output.
- Add cycle detection and tests for simple and workspace import graphs.

## Non-goals

- Do not attempt full bundler-specific resolution in the first pass.
- Do not require TypeScript program compilation for all repositories initially.

## Likely touchpoints

- `packages/core/src/scanner.ts`
- `packages/core/src/treeBuilder.ts`
- `packages/core/src/schema.ts`
- `packages/core/src/*graph*.ts`

## Acceptance criteria

- [x] Relative imports resolve to canonical repo paths.
- [x] Workspace package imports are recognized.
- [x] Unresolved imports are reported, not silently dropped.
- [x] Tests cover relative, index, extensionless, and package imports.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: Added `packages/core/src/importGraph.ts` with relative JS/TS import resolution, workspace package discovery from `workspaces`, entrypoint/subpath resolution, external import tracking, unresolved local import reporting, and file cycle detection. Scan now writes `.abstraction-tree/import-graph.json`, core memory can load it, and `/api/state` exposes it.
- Tests run: `npm run build`; `npm test`; `npm run atree:scan`; `npm run atree:validate`.
- Follow-up risks: Resolution intentionally remains source-file oriented and does not model bundler aliases, `tsconfig` path maps, conditional exports beyond the package entrypoint, or non-JS language import semantics.
