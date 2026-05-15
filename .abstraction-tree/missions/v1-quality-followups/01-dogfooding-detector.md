---
id: mission-01-dogfooding-detector
title: Fix `doctor --strict` dogfooding false positives
priority: P0
risk: medium
category: safety
affectedFiles:
  - packages/cli/src/doctor.ts
  - packages/cli/src/doctor.test.ts
  - packages/core/src/validator.ts
  - docs/V1_RELEASE_CANDIDATE_REVIEW.md
affectedNodes:
  - subsystem.cli.local.api
  - subsystem.core.engine
  - subsystem.tests.quality
dependsOn:
  - mission-00-current-gate-evidence
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Fix `doctor --strict` dogfooding false positives

## Goal

Tighten dogfooding-memory contamination detection so external projects with generic subsystem names are not incorrectly flagged.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

`rust-lang/book` triggered a `doctor --strict` warning after a fresh init and scan. The likely trigger was generic inferred node IDs such as `subsystem.goal.mission.automation` and `subsystem.cli.local.api`, not copied Abstraction Tree memory. This affects a stable command and should be fixed or explicitly deferred before v1.

## Scope

- Change dogfooding-memory detection logic.
- Add fixture tests for true positives and false positives.
- Preserve real detection for copied Abstraction Tree memory.
- Update docs if warning behavior changes.

## Out of Scope

No removal of dogfooding-memory isolation. Do not silence all warnings.

## Required Checks

- Unit tests for doctor/dogfooding detection.
- `npm run atree -- doctor --project . --strict`.
- Run a fixture resembling `rust-lang/book` if possible.
- `npm test`, `npm run coverage`.

## Success Criteria

- Fresh external docs/book-like workspace does not trigger copied-memory warning.
- A copied Abstraction Tree `.abstraction-tree` fixture still triggers a warning.
- Warning output includes specific hard evidence.
- Strict doctor remains stable and useful.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 01: Fix `doctor --strict` dogfooding false positives

## Mission metadata

- **Mission file:** `01-dogfooding-detector.md`
- **Priority:** P0
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Tighten dogfooding-memory contamination detection so external projects with generic subsystem names are not incorrectly flagged.

## Evidence and problem statement

`rust-lang/book` triggered a `doctor --strict` warning after a fresh init and scan. The likely trigger was generic inferred node IDs such as `subsystem.goal.mission.automation` and `subsystem.cli.local.api`, not copied Abstraction Tree memory. This affects a stable command and should be fixed or explicitly deferred before v1.

## Scope Codex may change

- Change dogfooding-memory detection logic.
- Add fixture tests for true positives and false positives.
- Preserve real detection for copied Abstraction Tree memory.
- Update docs if warning behavior changes.

## Likely files or modules

Likely files: `packages/cli/src/doctor.ts`, `packages/cli/src/doctor.test.ts`, `packages/core/src/validator.ts`, `docs/DATA_MODEL.md`, `docs/V1_RELEASE_CANDIDATE_REVIEW.md`.

## Implementation plan

1. Locate `doctor` and dogfooding-memory detection code.
2. Replace generic-node-ID detection with hard-evidence scoring.
3. Require multiple strong signals before warning: Abstraction Tree package names, `packages/core/src` paths, repo identity, committed runs/lessons copied before local commands, specific README/product text, or matching package manifests.
4. Explicitly ignore locally generated `evaluations/`, generated scan records, generic subsystem names, and normal external-project `.abstraction-tree` outputs.
5. Add test fixtures for: fresh docs repo, copied dogfooding memory, generic subsystem names, and real Abstraction Tree repo.
6. Improve warning text to list exact evidence that triggered it.

## Required tests and validation

- Unit tests for doctor/dogfooding detection.
- `npm run atree -- doctor --project . --strict`.
- Run a fixture resembling `rust-lang/book` if possible.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Fresh external docs/book-like workspace does not trigger copied-memory warning.
- A copied Abstraction Tree `.abstraction-tree` fixture still triggers a warning.
- Warning output includes specific hard evidence.
- Strict doctor remains stable and useful.

## Risks and review notes

Risk: weakening detection too much could let copied memory pass silently. Use evidence scoring rather than deleting the check.

## Out of scope

No removal of dogfooding-memory isolation. Do not silence all warnings.
