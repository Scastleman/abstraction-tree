---
id: mission-12-artifact-security
title: Improve visual artifact security and usability
priority: P2
risk: medium
category: safety
affectedFiles:
  - packages/cli/src/apiState.ts
  - packages/cli/src/apiState.test.ts
  - packages/cli/src/serveHost.ts
  - packages/app/src/components/GoalWorkflowPanel.tsx
  - docs/VISUAL_DEMO.md
  - docs/DATA_MODEL.md
affectedNodes:
  - subsystem.cli.local.api
  - subsystem.visual.app
  - subsystem.tests.quality
dependsOn: []
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Improve visual artifact security and usability

## Goal

Tighten `/api/artifact` safety and make redacted artifact display clearer to users.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

The app now opens text artifacts from `.abstraction-tree/` and redacts obvious secrets. This is useful, but artifact display remains sensitive because prompts, paths, logs, and generated reports may contain private information.

## Scope

- Add optional artifact-serving disable switch.
- Improve redaction tests.
- Make UI labels explicit that artifact text is redacted and local.
- Keep token auth for network hosts.

## Out of Scope

No claim that redaction is perfect. No serving files outside `.abstraction-tree/`.

## Required Checks

- API artifact tests.
- App component tests if existing app test style supports it.
- Docs command check.
- `npm test`, `npm run coverage`.

## Success Criteria

- Artifact serving can be disabled.
- Unauthorized network artifact requests remain blocked.
- Redaction handles common secret forms.
- UI and docs clearly state artifact display is redacted but still sensitive.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 12: Improve visual artifact security and usability

## Mission metadata

- **Mission file:** `12-artifact-security.md`
- **Priority:** P2
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Tighten `/api/artifact` safety and make redacted artifact display clearer to users.

## Evidence and problem statement

The app now opens text artifacts from `.abstraction-tree/` and redacts obvious secrets. This is useful, but artifact display remains sensitive because prompts, paths, logs, and generated reports may contain private information.

## Scope Codex may change

- Add optional artifact-serving disable switch.
- Improve redaction tests.
- Make UI labels explicit that artifact text is redacted and local.
- Keep token auth for network hosts.

## Likely files or modules

Likely files: `packages/cli/src/apiState.ts`, `packages/cli/src/index.ts`, `packages/app/src/components/GoalWorkflowPanel.tsx`, tests, `docs/VISUAL_DEMO.md`, `docs/DATA_MODEL.md`.

## Implementation plan

1. Add config or CLI option such as `--no-artifacts` or `visualApp.artifacts.enabled: false`.
2. Add artifact policy to `/api/state` so the UI can hide links when disabled.
3. Expand redaction tests for JSON, Markdown, shell variables, nested key/value pairs, bearer tokens, GitHub tokens, API keys, and multiline logs.
4. Add UI labels: “Redacted local artifact” and “Only .abstraction-tree text artifacts are served.”
5. Add copy-redacted-text utility if straightforward.
6. Document artifact display risks and safe usage.

## Required tests and validation

- API artifact tests.
- App component tests if existing app test style supports it.
- Docs command check.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- Artifact serving can be disabled.
- Unauthorized network artifact requests remain blocked.
- Redaction handles common secret forms.
- UI and docs clearly state artifact display is redacted but still sensitive.

## Risks and review notes

Risk: redaction can never guarantee removal of all secrets. Docs must say “obvious/common secret-like values,” not “all secrets.”

## Out of scope

No claim that redaction is perfect. No serving files outside `.abstraction-tree/`.
