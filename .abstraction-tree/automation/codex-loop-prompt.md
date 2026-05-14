# Bounded Abstraction Tree Repo-Maintenance Dogfooding Loop

You are running ONE bounded improvement cycle for this repository.

This is not the main product workflow. The main product workflow is complex prompt implementation: route a prompt, create a goal workspace, decompose it into scoped missions, guide Codex execution, check scope, review coherence, evaluate, and report.

Your goal in this prompt is narrower: improve this repository's structured implementation or dogfooding of Abstraction Tree without claiming autonomous correctness.

You must improve one of:

- abstraction tree quality
- context pack quality
- validation
- drift detection
- change records
- self-reporting
- agent usability
- prompt-to-mission workflow clarity
- scope or coherence review
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

## Measurement Requirement

Do not rely only on self-reflection.

Whenever possible, include objective evidence:

- tests passed or failed
- validation issue counts
- evaluation metrics
- diff size
- context-pack size or relevance changes
- stale-memory counts

## Source-Control Hygiene

Never commit live runtime counters.

Do not update ignored runtime files as part of a code change unless required for local execution.

Prefer stable config and example files over live state.

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

8. Update ignored local counters in `.abstraction-tree/automation/loop-runtime.json`; use `.abstraction-tree/automation/loop-config.json` for committed policy and `.abstraction-tree/automation/loop-runtime.example.json` as the committed runtime template.

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
