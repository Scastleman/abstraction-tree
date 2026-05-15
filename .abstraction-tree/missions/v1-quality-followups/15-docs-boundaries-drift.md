---
id: mission-15-docs-boundaries-drift
title: Reconcile docs drift and maturity boundaries
priority: P1
risk: low
category: developer-experience
affectedFiles:
  - docs/ROADMAP.md
  - docs/STABLE_VS_EXPERIMENTAL.md
  - docs/VISUAL_DEMO.md
  - docs/V1_RELEASE_CANDIDATE_REVIEW.md
  - README.md
affectedNodes:
  - subsystem.docs.examples
dependsOn:
  - mission-12-artifact-security
  - mission-13-repo-type-profiles
  - mission-14-non-js-dependency-graphs
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Reconcile docs drift and maturity boundaries

## Goal

Ensure docs consistently describe which surfaces are stable, beta, experimental, or implemented read-only views.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

The visual demo now describes goal workflow views, but the roadmap still says visual goal workspace and mission-plan panels are not first-class. Docs should reflect the current implementation while preserving conservative beta boundaries.

## Scope

- Update roadmap, stable-vs-experimental docs, visual demo, data model, getting started, and README as needed.
- Do not overstate v1 readiness.
- Clarify that workflow views are read-only/beta unless maintainers decide otherwise.

## Out of Scope

No v1 declaration, release tag changes, or public feedback claims.

## Required Checks

- `npm run docs:commands`.
- `npm run format:check`.
- Optional docs phrase-check test.
- Full docs review after changes.

## Success Criteria

- Public docs no longer contradict implemented workflow views.
- Stable/beta/experimental boundaries are consistent.
- v1 review remains conservative.
- Docs command check passes.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 15: Reconcile docs drift and maturity boundaries

## Mission metadata

- **Mission file:** `15-docs-boundaries-drift.md`
- **Priority:** P2
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Ensure docs consistently describe which surfaces are stable, beta, experimental, or implemented read-only views.

## Evidence and problem statement

The visual demo now describes goal workflow views, but the roadmap still says visual goal workspace and mission-plan panels are not first-class. Docs should reflect the current implementation while preserving conservative beta boundaries.

## Scope Codex may change

- Update roadmap, stable-vs-experimental docs, visual demo, data model, getting started, and README as needed.
- Do not overstate v1 readiness.
- Clarify that workflow views are read-only/beta unless maintainers decide otherwise.

## Likely files or modules

Likely files: `docs/ROADMAP.md`, `docs/STABLE_VS_EXPERIMENTAL.md`, `docs/VISUAL_DEMO.md`, `docs/DATA_MODEL.md`, `README.md`, `scripts/check-doc-commands.mjs`.

## Implementation plan

1. Audit docs for claims about visual workflow views, goal planning, route/scope/evaluate maturity, provider proposals, mission execution, and v1 readiness.
2. Update roadmap to move implemented read-only workflow views out of “missing” and into “implemented beta/read-only” if appropriate.
3. Keep `goal --run`, `goal --full-auto`, mission execution, provider proposals, and dogfooding loop experimental.
4. Update docs command references.
5. Add a docs check if feasible to detect stale phrases like “does not yet expose goal workspaces” after implementation.

## Required tests and validation

- `npm run docs:commands`.
- `npm run format:check`.
- Optional docs phrase-check test.
- Full docs review after changes.

## Acceptance criteria

- Public docs no longer contradict implemented workflow views.
- Stable/beta/experimental boundaries are consistent.
- v1 review remains conservative.
- Docs command check passes.

## Risks and review notes

Risk: docs can accidentally promote beta features to stable. Keep maturity labels explicit.

## Out of scope

No v1 declaration, release tag changes, or public feedback claims.
