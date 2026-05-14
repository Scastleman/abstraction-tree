# Mission 8 — Improve the Visual App as a Project-Comprehension Cockpit

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable project-memory and prompt-to-mission system for coding agents.

This mission makes one small visual app improvement.

## Rules

- Do one bounded improvement.
- Do not rewrite the app.
- Do not add a large visualization framework unless already present.
- Do not push to remote.
- Do not hide failures.
- Stop after this mission.

## Task

Improve the visual app in one small way that supports project comprehension during dogfooding.

Choose one of these, based on what fits the current app best:

1. Show latest evaluation metrics if evaluation files exist.
2. Show automation config/status.
3. Show latest run report summary.
4. Show drift summary more clearly.
5. Show a small “agent health” panel combining:
   - latest run result
   - latest evaluation timestamp
   - validation issue count if available
   - automation config limits

Prefer option 5 if feasible without a rewrite.

## Requirements

- Keep the UI simple.
- Handle missing files gracefully.
- Do not break existing app behavior.
- Do not make the app dependent on Codex.
- Do not require an LLM.

## Tests

Add or update tests if the app has test coverage.

At minimum, ensure build passes.

## Run Checks

Run:

```bash
npm run build
npm test
npm run atree:validate
```

If available, also run:

```bash
npm run atree:evaluate
npm run diff:summary
```

If a command fails, record it honestly.

## Update Abstraction Memory

Update `.abstraction-tree/` memory if needed.

Write:

`.abstraction-tree/runs/YYYY-MM-DD-HHMM-agent-run.md`

Report format:

```md
# Agent Run Report

## Task Chosen

Improve visual app with one project-comprehension panel for dogfooding.

## Hypothesis

The visual app becomes more useful when it surfaces the state of the repo’s own repo-maintenance dogfooding loop and evaluation metrics.

## Files Changed

## Abstraction Layer Affected

## Result

success / partial / failed

## Checks Run

## What Improved

## What Did Not Improve

## Mistakes / Risks

## Missing Context Discovered

## Tree Updates Needed

## Reusable Lesson

## Recommended Next Loop
```

Also write:

`.abstraction-tree/lessons/YYYY-MM-DD-HHMM-lesson.md`

Stop after this mission.
