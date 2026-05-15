---
id: mission-13-repo-type-profiles
title: Add optional repo-type quality profiles
priority: P2
risk: medium
category: developer-experience
affectedFiles:
  - packages/core/src/schema.ts
  - packages/core/src/workspace.ts
  - packages/core/src/treeBuilder.ts
  - packages/cli/src/index.ts
  - docs/CONFIGURATION.md
affectedNodes:
  - subsystem.core.engine
  - subsystem.cli.local.api
  - subsystem.docs.examples
dependsOn:
  - mission-07-python-architecture
  - mission-08-rust-architecture
  - mission-09-docs-book-architecture
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Add optional repo-type quality profiles

## Goal

Make the new configuration surface easier to use by shipping built-in profile presets for common repository shapes.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

The project now supports subsystem patterns, domain vocabulary, concept weights, mission planning, and import aliases. Profiles would help users get better defaults without writing config from scratch.

## Scope

- Add built-in profile definitions.
- Add CLI option such as `atree scan --profile rust-cli`.
- Allow profiles to merge with custom config.
- Keep default behavior unchanged when no profile is selected.

## Out of Scope

No auto-detect-and-change behavior unless separately implemented and documented.

## Required Checks

- Config merge tests.
- CLI scan option tests.
- Fixture tests showing profiles alter tree structure.
- `npm test`, `npm run coverage`, `npm run docs:commands`.

## Success Criteria

- Users can run `atree scan --profile rust-cli`.
- Profile config merges with custom config.
- Default scan behavior is unchanged without profile.
- Docs include examples.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 13: Add optional repo-type quality profiles

## Mission metadata

- **Mission file:** `13-repo-type-profiles.md`
- **Priority:** P2
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Make the new configuration surface easier to use by shipping built-in profile presets for common repository shapes.

## Evidence and problem statement

The project now supports subsystem patterns, domain vocabulary, concept weights, mission planning, and import aliases. Profiles would help users get better defaults without writing config from scratch.

## Scope Codex may change

- Add built-in profile definitions.
- Add CLI option such as `atree scan --profile rust-cli`.
- Allow profiles to merge with custom config.
- Keep default behavior unchanged when no profile is selected.

## Likely files or modules

Likely files: `packages/core/src/workspace.ts`, `packages/core/src/schema.ts`, `packages/cli/src/index.ts`, `docs/CONFIGURATION.md`, tests.

## Implementation plan

1. Define profiles: `node-monorepo`, `react-app`, `python-package`, `rust-cli`, `go-service`, `docs-book`, and `mixed-fullstack`.
2. Each profile may define subsystem patterns, docs/test/build patterns, concept signal weights, mission planning defaults, and ignored path hints.
3. Add `--profile <name>` to scan.
4. Support multiple profiles only if simple; otherwise document one profile per scan.
5. Merge profile config before local explicit overrides so project config wins.
6. Add docs and tests.

## Required tests and validation

- Config merge tests.
- CLI scan option tests.
- Fixture tests showing profiles alter tree structure.
- `npm test`, `npm run coverage`, `npm run docs:commands`.

## Acceptance criteria

- Users can run `atree scan --profile rust-cli`.
- Profile config merges with custom config.
- Default scan behavior is unchanged without profile.
- Docs include examples.

## Risks and review notes

Risk: profile names can imply guaranteed understanding. Present profiles as heuristic boosts.

## Out of scope

No auto-detect-and-change behavior unless separately implemented and documented.
