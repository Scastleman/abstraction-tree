# Mission 5 — Harden the Codex Loop Prompt and Runner

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable, self-dogfooding abstraction-memory system for coding agents.

This mission hardens the autonomous loop behavior.

## Rules

- Do one bounded improvement.
- Do not add unrelated features.
- Do not push to remote.
- Do not hide failures.
- Keep the runner readable.
- Stop after this mission.

## Task A — Improve the Codex Loop Prompt

Update:

`.abstraction-tree/automation/codex-loop-prompt.md`

Add an experiment requirement.

The prompt should require each loop to state one concrete hypothesis.

Add language similar to:

```md
## Experiment Requirement

Each loop must test one concrete hypothesis.

Examples:

- "Context packs improve if ranking includes exported symbols."
- "Validation improves if automation runtime state is gitignored."
- "Agent safety improves if large diffs stop the loop."
- "Tree quality improves if files without owners are reported."

For every loop:

1. State the hypothesis.
2. Implement the smallest change to test it.
3. Run checks.
4. Run evaluation if available.
5. Decide whether the result is success, partial, failed, or no-op.
6. Write a lesson.
7. Recommend exactly one next loop.
```

Add a measurement requirement:

```md
## Measurement Requirement

Do not rely only on self-reflection.

Whenever possible, include objective evidence:

- tests passed or failed
- validation issue counts
- evaluation metrics
- diff size
- context-pack size or relevance changes
- stale-memory counts
```

Add source-control hygiene language:

```md
## Source-Control Hygiene

Never commit live runtime counters.

Do not update ignored runtime files as part of a code change unless required for local execution.

Prefer stable config and example files over live state.
```

## Task B — Improve the Loop Runner

Update the PowerShell loop runner so it:

1. Reads `loop-config.json`.
2. Reads or initializes `loop-runtime.json`.
3. Stops on:
   - max loops
   - max minutes
   - max stagnation
   - max failed loops
   - stop requested
   - diff too large
   - repeated test failure
4. Runs one Codex cycle at a time.
5. After each loop:
   - runs validation
   - runs tests if reasonable
   - runs evaluation if implemented
   - updates local runtime state only
6. Does not commit automatically unless `commit_each_successful_loop` is true.
7. If auto-commit is enabled, commits only after build/test/validation succeed.

Make the PowerShell readable and maintainable.

Avoid compressed one-line scripts.

## Tests

Add tests where practical.

If testing PowerShell directly is too heavy, document the limitation and add smaller tests around config/runtime parsing if possible.

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

Harden Codex loop prompt and runner.

## Hypothesis

Autonomous loops become more useful when each run is hypothesis-driven, bounded, measurable, and guarded by runtime state outside source control.

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
