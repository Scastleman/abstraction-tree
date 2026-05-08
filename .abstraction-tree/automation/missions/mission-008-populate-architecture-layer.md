---
id: mission-008
title: Populate the runtime/dataflow architecture layer
priority: P1
status: completed
project: abstraction-tree
---

# Mission 008: Populate the runtime/dataflow architecture layer

## Objective

Make `project.architecture` contain real runtime, entrypoint, dataflow, and package-boundary nodes rather than a mostly placeholder layer.

## Why this matters

The tree builder creates a project architecture node, but deterministic output primarily contains folder modules and file nodes. A meaningful architecture layer is essential to the project promise.

## Scope

- Use package manifests, CLI commands, app entrypoints, local API routes, and resolved imports to infer architecture nodes.
- Create nodes for CLI surface, core engine, scanner/tree/context pipeline, visual app API, visual app UI, and package distribution.
- Connect architecture nodes to owned files and dependencies.
- Add tests with expected architecture nodes for this repo and the example fixture.
- Document deterministic architecture inference limits.

## Non-goals

- Do not pretend to infer full business semantics without evidence.
- Do not remove folder/file nodes.

## Likely touchpoints

- `packages/core/src/treeBuilder.ts`
- `packages/core/src/treeBuilder.test.ts`
- `.abstraction-tree/tree.json`
- `docs/ARCHITECTURE.md`

## Acceptance criteria

- [x] `project.architecture` has meaningful children after scanning this repo.
- [x] Architecture nodes include source files and dependency references.
- [x] Validation passes with populated architecture nodes.
- [x] Tests protect expected architecture output shape.

## Suggested checks

```bash
npm run build
npm test
npm run atree:scan
npm run atree:validate
```

## Completion notes

- Implementation summary: Added deterministic architecture inference beneath `project.architecture`, backed by package manifest metadata, workspace package entrypoints, bin commands, UI/API path signals, server imports, and resolved import graph edges. Scan now passes the import graph into tree construction, and generated architecture nodes cover CLI surface, core engine, scanner/tree/context pipeline, visual app API, visual app UI, local API/dataflow, and package distribution where evidence exists.
- Tests run: `npm run build`; `npm test`; `npm run atree:scan`; `npm run atree:validate`.
- Follow-up risks: Inference remains deterministic and evidence-limited. It does not model bundler aliases, deployment topology, dynamic route registration, runtime-only business semantics, or complete request/user journeys beyond manifest, path, import, and package metadata signals.
