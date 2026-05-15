---
id: mission-11-scope-contracts
title: Improve scope-contract grounding and overreach reporting
priority: P2
risk: medium
category: safety
affectedFiles:
  - packages/core/src/scope.ts
  - packages/core/src/scope.test.ts
  - packages/core/src/diffSummary.ts
  - packages/cli/src/scopeCommand.ts
  - docs/SCOPE_CONTRACTS.md
affectedNodes:
  - subsystem.core.engine
  - subsystem.cli.local.api
  - subsystem.docs.examples
dependsOn:
  - mission-10-route-context-consistency
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Improve scope-contract grounding and overreach reporting

## Goal

Ground scope contracts in stronger file evidence and add clearer overreach categories for reviewable agent work.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

Scope contracts are a key safety surface. If context and route can lose concrete edit files, scope contracts can also be too broad or too narrow.

## Scope

- Improve scope file selection.
- Add more specific violation categories.
- Keep scope checks conservative and review-oriented.

## Out of Scope

No automatic blocking beyond current intended scope semantics without explicit docs.

## Required Checks

- Scope unit tests.
- Diff summary tests for new violation categories.
- `npm test`, `npm run coverage`.

## Success Criteria

- Scope contract includes likely implementation and nearby test files.
- Scope check reports specific overreach reasons.
- Generated memory and source/test/doc changes are distinguished.
- Existing scope behavior remains backwards compatible.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 11: Improve scope-contract grounding and overreach reporting

## Mission metadata

- **Mission file:** `11-scope-contracts.md`
- **Priority:** P2
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Ground scope contracts in stronger file evidence and add clearer overreach categories for reviewable agent work.

## Evidence and problem statement

Scope contracts are a key safety surface. If context and route can lose concrete edit files, scope contracts can also be too broad or too narrow.

## Scope Codex may change

- Improve scope file selection.
- Add more specific violation categories.
- Keep scope checks conservative and review-oriented.

## Likely files or modules

Likely files: `packages/core/src/scope.ts`, `packages/core/src/diffSummary.ts`, `packages/cli/src/scopeCommand.ts`, tests, docs.

## Implementation plan

1. Use import graph edges, selected node ownership, route/context evidence, concept evidence, and adjacent tests to infer allowed files.
2. Add violation categories: generated-only change, docs-only change, package metadata change, implementation-without-test, source-changed-memory-not-refreshed, cross-subsystem change.
3. Improve scope rationale to explain why files are allowed or excluded.
4. Add Markdown output sections for risky areas and recommended reviewer checks.
5. Add tests for full-stack route/middleware/controller/frontend changes and source/test/memory combinations.

## Required tests and validation

- Scope unit tests.
- Diff summary tests for new violation categories.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Scope contract includes likely implementation and nearby test files.
- Scope check reports specific overreach reasons.
- Generated memory and source/test/doc changes are distinguished.
- Existing scope behavior remains backwards compatible.

## Risks and review notes

Risk: too many warnings can reduce usefulness. Group warnings and rank by severity.

## Out of scope

No automatic blocking beyond current intended scope semantics without explicit docs.
