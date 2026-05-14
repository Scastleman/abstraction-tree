# Mission 1 — Fix Automation Runtime/Config Hygiene

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable project-memory and prompt-to-mission system for coding agents.

This mission fixes automation source-control hygiene.

## Rules

- Do one bounded improvement.
- Do not add unrelated features.
- Do not push to remote.
- Do not delete major directories.
- Do not hide failures.
- Keep changes readable and maintainable.
- Stop after this mission.

## Task

Split committed automation configuration from local runtime state.

Replace:

`.abstraction-tree/automation/loop-state.json`

with:

- committed config: `.abstraction-tree/automation/loop-config.json`
- committed example runtime: `.abstraction-tree/automation/loop-runtime.example.json`
- ignored local runtime: `.abstraction-tree/automation/loop-runtime.json`

Update `.gitignore` so this file is ignored:

```txt
.abstraction-tree/automation/loop-runtime.json
```

## Required Config File

Create committed `.abstraction-tree/automation/loop-config.json`:

```json
{
  "max_loops_today": 25,
  "max_minutes_today": 300,
  "max_stagnation": 3,
  "max_failed_loops": 3,
  "max_diff_lines": 1200,
  "commit_each_successful_loop": false,
  "revert_failed_experiments": true,
  "stop_if_tests_fail_twice": true,
  "stop_if_diff_too_large": true
}
```

## Required Runtime Example

Create committed `.abstraction-tree/automation/loop-runtime.example.json`:

```json
{
  "loops_today": 0,
  "failed_loops_today": 0,
  "stagnation_count": 0,
  "last_result": "",
  "last_run_date": "",
  "stop_requested": false
}
```

## Update Scripts

Update the loop runner so it:

1. Reads stable policy from `loop-config.json`.
2. Reads local counters from `loop-runtime.json`.
3. Initializes `loop-runtime.json` from `loop-runtime.example.json` when missing.
4. Never requires live runtime counters to be committed.
5. Does not recreate `loop-state.json`.

## Update Docs

Update any docs or prompts that mention `loop-state.json`.

They should now refer to:

- `loop-config.json` for committed policy
- `loop-runtime.json` for local ignored runtime counters
- `loop-runtime.example.json` as the committed template

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

Use this format:

```md
# Agent Run Report

## Task Chosen

Fix automation runtime/config source-control hygiene.

## Hypothesis

The bounded dogfooding loop becomes safer when stable config is committed but live runtime counters are local and ignored.

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
