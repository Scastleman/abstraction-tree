# Mission 4 — Add Diff Summary and Agent Overreach Guard

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable project-memory and prompt-to-mission system for coding agents.

This mission adds or improves diff summary and overreach detection.

## Rules

- Do one bounded improvement.
- Do not add unrelated features.
- Do not push to remote.
- Do not hide failures.
- Keep output concise and useful for agents.
- Stop after this mission.

## Task

Add or improve the existing `diff:summary` workflow.

The diff summary should estimate:

- changed file count
- added lines
- deleted lines
- changed source files
- changed test files
- changed docs files
- changed `.abstraction-tree/` memory files
- changed automation files
- changed package files
- changed CI files
- potentially dangerous file changes:
  - `.env`
  - secrets
  - lockfiles
  - GitHub workflow files
  - package manager config
- possible overreach:
  - too many files changed
  - too many lines changed
  - unrelated areas changed in one loop
  - source + app + docs + automation all changed together

Suggested file:

`packages/core/src/diffSummary.ts`

or a script under:

`scripts/diff-summary.*`

Use the existing repo style.

## CLI / Script

Expose via:

```bash
npm run diff:summary
```

Output should be readable in terminal.

If practical, also support JSON output for the loop runner.

## Runner Integration

Update the loop runner so it can stop when the diff is too large based on:

`max_diff_lines` from `loop-config.json`

Do not make it too complicated.

## Tests

Add tests for:

- safe small diff
- broad overreach diff
- dangerous file detection
- generated memory file detection

Use fixtures or mock git output if needed.

## Run Checks

Run:

```bash
npm run build
npm test
npm run atree:validate
npm run diff:summary
```

If `npm run atree:evaluate` exists, run it too:

```bash
npm run atree:evaluate
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

Add diff summary and agent overreach guard.

## Hypothesis

Bounded dogfooding loops become safer when each loop can measure its own diff size and detect broad or risky edits.

## Files Changed

## Abstraction Layer Affected

## Result

success / partial / failed

## Checks Run

## Diff Summary

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
