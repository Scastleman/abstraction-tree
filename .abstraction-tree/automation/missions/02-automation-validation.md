# Mission 2 — Add Automation State Validation

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable, self-dogfooding abstraction-memory system for coding agents.

This mission adds validation for automation config/runtime hygiene.

## Rules

- Do one bounded improvement.
- Do not add unrelated features.
- Do not push to remote.
- Do not hide failures.
- Prefer small deterministic tests.
- Stop after this mission.

## Task

Add validation so `npm run atree:validate` detects automation hygiene problems.

Prefer a new module:

`packages/core/src/automationValidation.ts`

Then wire it into the CLI validator.

## Validation Should Detect

Validation should warn, or fail in strict mode, when:

- `.abstraction-tree/automation/loop-state.json` exists
- `.abstraction-tree/automation/loop-config.json` is missing
- `.abstraction-tree/automation/loop-runtime.example.json` is missing
- `.abstraction-tree/automation/loop-runtime.json` is tracked or not ignored
- committed automation config contains volatile runtime fields, such as:
  - `loops_today`
  - `failed_loops_today`
  - `stagnation_count`
  - `last_result`
  - `last_run_date`
  - `stop_requested`
- config values are invalid, such as:
  - negative loop limits
  - zero max minutes
  - non-boolean flags where booleans are expected

## Tests

Add tests for:

- valid config passes
- old `loop-state.json` is detected
- volatile runtime fields in committed config are detected
- invalid config values are detected
- missing config/example files are detected

Use existing test conventions.

## Run Checks

Run:

```bash
npm run build
npm test
npm run atree:validate
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

Add automation state validation.

## Hypothesis

The autonomous loop becomes safer when validation catches committed runtime state and malformed automation config.

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
