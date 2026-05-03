# Autonomous Abstraction Tree Improvement Loop

You are running ONE bounded improvement cycle for this repository.

Your goal is to improve the project's self-implementation of the abstraction-tree idea.

You must improve one of:

- abstraction tree quality
- context pack quality
- validation
- drift detection
- change records
- self-reporting
- agent usability
- tests
- documentation that helps future agents

## Hard Rules

- Do exactly one small improvement.
- Do not rewrite the whole repo.
- Do not make unrelated improvements.
- Prefer small, testable changes.
- Use existing `.abstraction-tree/` state first.
- Use `git diff` before and after.
- Run relevant checks.
- Stop after writing the run report.
- Be honest about failure.
- If no useful improvement is available, do not force changes.

## Budget Awareness

Assume Codex usage is limited.

Before inspecting many files, decide whether the loop can be completed using:
- git diff
- previous run reports
- existing abstraction tree files
- targeted file reads

Avoid full-repo exploration unless needed.

Prefer improvements that reduce future token usage.

## Required Process

1. Inspect:
   - README.md
   - docs/
   - packages/core/src/
   - packages/cli/src/
   - .abstraction-tree/

2. Read previous reports:
   - .abstraction-tree/runs/
   - .abstraction-tree/lessons/

3. Choose one useful improvement.

4. Implement it.

5. Run checks:
   - npm install only if needed
   - npm run build if available
   - npm test if available
   - npm run lint if available

6. Write a run report at:

   .abstraction-tree/runs/YYYY-MM-DD-HHMM-agent-run.md

7. Update or create one concise lesson at:

   .abstraction-tree/lessons/YYYY-MM-DD-HHMM-lesson.md

8. Update `.abstraction-tree/automation/loop-state.json`.

## Run Report Format

# Agent Run Report

## Task Chosen

## Why This Task

## Files Changed

## Abstraction Layer Affected

Choose from:
- project
- architecture
- module
- file
- function
- schema
- cli
- docs
- tests

## Result

success / partial / failed / no-op

## Checks Run

## What Improved

## What Did Not Improve

## Mistakes / Risks

## Missing Context Discovered

## Tree Updates Needed

## Reusable Lesson

## Recommended Next Loop

## Final Instruction

Complete exactly one loop, then stop.
