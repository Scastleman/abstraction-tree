---
id: mission-02-pnpm-workspaces
title: Add pnpm workspace discovery
priority: P0
risk: medium
category: product-value
affectedFiles:
  - packages/core/src/importGraph.ts
  - packages/core/src/importGraph.test.ts
  - packages/core/src/schema.ts
  - docs/CONFIGURATION.md
affectedNodes:
  - subsystem.core.engine
  - subsystem.tests.quality
  - subsystem.docs.examples
dependsOn:
  - mission-01-dogfooding-detector
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Add pnpm workspace discovery

## Goal

Extend workspace package detection so monorepos using `pnpm-workspace.yaml` produce package boundaries and workspace import resolution.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

`vitejs/vite` reported `workspacePackages: 0` even though it uses `pnpm-workspace.yaml`. That weakens package-boundary detection and import graph quality for a common JS/TS monorepo pattern.

## Scope

- Parse pnpm workspace files.
- Merge package roots with existing `package.json` workspace discovery.
- Add tests and docs.
- Do not add heavy YAML dependencies unless justified; a small parser for the `packages:` list may be enough.

## Out of Scope

No large monorepo-specific hard-coded package names.

## Required Checks

- Import graph tests for pnpm-only, package-json-only, mixed, and exclusion cases.
- Test workspace imports resolve inside a pnpm monorepo fixture.
- `npm test`, `npm run coverage`.

## Success Criteria

- A pnpm monorepo fixture reports workspace packages.
- Excluded patterns are respected.
- `vitejs/vite`-style package layouts no longer report zero workspace packages.
- Existing npm/yarn workspace behavior is unchanged.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 02: Add pnpm workspace discovery

## Mission metadata

- **Mission file:** `02-pnpm-workspaces.md`
- **Priority:** P0
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Extend workspace package detection so monorepos using `pnpm-workspace.yaml` produce package boundaries and workspace import resolution.

## Evidence and problem statement

`vitejs/vite` reported `workspacePackages: 0` even though it uses `pnpm-workspace.yaml`. That weakens package-boundary detection and import graph quality for a common JS/TS monorepo pattern.

## Scope Codex may change

- Parse pnpm workspace files.
- Merge package roots with existing `package.json` workspace discovery.
- Add tests and docs.
- Do not add heavy YAML dependencies unless justified; a small parser for the `packages:` list may be enough.

## Likely files or modules

Likely files: `packages/core/src/importGraph.ts`, `packages/core/src/importGraph.test.ts`, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`.

## Implementation plan

1. Add discovery for `pnpm-workspace.yaml` and `pnpm-workspace.yml`.
2. Parse `packages:` includes and `!` excludes.
3. Support simple YAML list forms: inline strings, quoted strings, and indented array items.
4. Expand patterns using existing workspace expansion utilities.
5. Merge pnpm-discovered roots with `package.json` `workspaces`.
6. Deduplicate by package name and manifest path.
7. Add diagnostics or tests for malformed pnpm workspace files if parsing is limited.
8. Update docs to say pnpm workspaces are supported.

## Required tests and validation

- Import graph tests for pnpm-only, package-json-only, mixed, and exclusion cases.
- Test workspace imports resolve inside a pnpm monorepo fixture.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- A pnpm monorepo fixture reports workspace packages.
- Excluded patterns are respected.
- `vitejs/vite`-style package layouts no longer report zero workspace packages.
- Existing npm/yarn workspace behavior is unchanged.

## Risks and review notes

Risk: YAML parsing edge cases. Keep parser scoped and document supported patterns, or use a well-maintained dependency if acceptable for package size.

## Out of scope

No large monorepo-specific hard-coded package names.
