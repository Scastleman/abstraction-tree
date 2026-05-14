# Mission 0 — Baseline Inspection Only

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable project-memory and prompt-to-mission system for coding agents.

This mission is inspection only.

Do not implement features yet.

## Rules

- Do not rewrite files unless needed to write the inspection report.
- Do not push to remote.
- Do not delete files.
- Do not hide failures.
- Be honest about what works and what does not.
- Stop after writing the report.

## Inspect

Read:

- `README.md`
- `docs/`
- `package.json`
- `.gitignore`
- `.github/workflows/ci.yml`
- `packages/core/src/`
- `packages/cli/src/`
- `packages/app/src/`
- `scripts/`
- `adapters/codex/`
- `.abstraction-tree/`
- `.abstraction-tree/automation/`
- `.abstraction-tree/runs/`
- `.abstraction-tree/lessons/`
- `.abstraction-tree/evaluations/`

## Run Checks

Run:

```bash
git status
npm install
npm run build
npm test
npm run atree:validate
```

If a command fails, record the exact failure and continue with the assessment where possible.

## Write Report

Create a report:

`.abstraction-tree/evaluations/YYYY-MM-DD-HHMM-baseline-assessment.md`

Use this format:

```md
# Baseline Assessment

## Current State

## What Works

## What Fails

## Important Risks

## Source-Control Hygiene Issues

## Automation Loop Issues

## Validation Issues

## Evaluation / Metrics Gaps

## Visual App Gaps

## LLM Abstraction Gaps

## Recommended Mission Order

## Checks Run

## Final Verdict
```

Do not implement fixes in this mission.

Stop after writing the report.
