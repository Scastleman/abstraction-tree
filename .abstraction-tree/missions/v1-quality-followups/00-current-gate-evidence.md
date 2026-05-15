---
id: mission-00-current-gate-evidence
title: Capture current post-change release-gate evidence
priority: P0
risk: medium
category: quality
affectedFiles:
  - scripts/capture-release-gate-evidence.mjs
  - scripts/capture-release-gate-evidence.test.mjs
  - docs/V1_RELEASE_CANDIDATE_REVIEW.md
  - docs/V1_RELEASE_GATE.md
  - docs/release-evidence/
affectedNodes:
  - subsystem.tests.quality
  - subsystem.docs.examples
  - subsystem.packaging.adapters
dependsOn: []
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Capture current post-change release-gate evidence

## Goal

Create or improve local automation for rerunning the full release gate on the current commit and recording evidence in the v1 release review without declaring v1 readiness.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

The v1 review says the clean-checkout gate passed on 2026-05-15, but it also says that evidence predates the current mission-improvement diff. That makes current proof incomplete. Codex can implement a repeatable evidence-capture script and update docs once the commands pass, but a human must decide final v1 readiness.

## Scope

- Add or improve a release-gate evidence capture script.
- Update docs with a section template for current-commit evidence.
- Keep wording conservative: evidence captured, not v1-ready unless human approved.
- Do not publish or move npm dist-tags.

## Out of Scope

Publishing, dist-tag changes, declaring v1 readiness, or inventing successful command output.

## Required Checks

- Unit tests for the evidence script.
- `npm run docs:commands` if docs add commands.
- Full release-gate command list if feasible locally.
- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`.

## Success Criteria

- There is a reproducible command or script for capturing current release-gate evidence.
- The evidence output includes git SHA, environment, command outputs, exit codes, and final git status.
- Docs state whether the current commit has passed, failed, or not yet been run.
- No release/publish action is performed.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 00: Capture current post-change release-gate evidence

## Mission metadata

- **Mission file:** `00-current-gate-evidence.md`
- **Priority:** P0
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Create or improve local automation for rerunning the full release gate on the current commit and recording evidence in the v1 release review without declaring v1 readiness.

## Evidence and problem statement

The v1 review says the clean-checkout gate passed on 2026-05-15, but it also says that evidence predates the current mission-improvement diff. That makes current proof incomplete. Codex can implement a repeatable evidence-capture script and update docs once the commands pass, but a human must decide final v1 readiness.

## Scope Codex may change

- Add or improve a release-gate evidence capture script.
- Update docs with a section template for current-commit evidence.
- Keep wording conservative: evidence captured, not v1-ready unless human approved.
- Do not publish or move npm dist-tags.

## Likely files or modules

Likely files: `scripts/`, `scripts/*.test.mjs`, `docs/V1_RELEASE_CANDIDATE_REVIEW.md`, `docs/V1_RELEASE_GATE.md`, `docs/release-evidence/`.

## Implementation plan

1. Add a script such as `scripts/capture-release-gate-evidence.mjs` that runs the documented command list in order and captures command, cwd, start/end timestamps, exit code, stdout, stderr, and git status.
2. Support Windows and Unix shells. On Windows, prefer invoking npm through `npm.cmd` or the npm CLI path to avoid `npm.ps1` execution-policy problems.
3. Write evidence to `docs/release-evidence/<date>-current-gate.md` or a clearly named temporary artifact.
4. Add tests for command list construction, timestamp formatting, failed-command handling, and path normalization.
5. Update `docs/V1_RELEASE_CANDIDATE_REVIEW.md` to distinguish baseline evidence from current-commit evidence.
6. If the gate fails, record blocker status rather than masking failures.

## Required tests and validation

- Unit tests for the evidence script.
- `npm run docs:commands` if docs add commands.
- Full release-gate command list if feasible locally.
- `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`.

## Acceptance criteria

- There is a reproducible command or script for capturing current release-gate evidence.
- The evidence output includes git SHA, environment, command outputs, exit codes, and final git status.
- Docs state whether the current commit has passed, failed, or not yet been run.
- No release/publish action is performed.

## Risks and review notes

Potential risk: a script can make release evidence look official. Keep labels explicit: `candidate evidence`, `not a v1 decision`, and `maintainer signoff required`.

## Out of scope

Publishing, dist-tag changes, declaring v1 readiness, or inventing successful command output.
