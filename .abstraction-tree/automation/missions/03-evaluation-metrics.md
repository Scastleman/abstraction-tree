# Mission 3 — Add Deterministic Evaluation Metrics

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable project-memory and prompt-to-mission system for coding agents.

This mission adds objective evaluation metrics so the bounded dogfooding loop does not rely only on self-reporting.

## Rules

- Do one bounded improvement.
- Keep it deterministic.
- Do not require an LLM.
- Do not push to remote.
- Do not hide failures.
- Stop after this mission.

## Task

Add an evaluation framework.

Suggested file:

`packages/core/src/evaluator.ts`

Add a CLI command:

```bash
atree evaluate
```

Add an npm script:

```bash
npm run atree:evaluate
```

The command should generate a report under:

`.abstraction-tree/evaluations/YYYY-MM-DD-HHMM-evaluation.json`

## Required Metrics

Include at least:

```json
{
  "timestamp": "",
  "tree": {
    "nodeCount": 0,
    "orphanNodeCount": 0,
    "nodesWithoutSummaries": 0,
    "filesWithoutOwners": 0
  },
  "context": {
    "lastPackCount": 0,
    "averageFilesPerPack": 0,
    "averageConceptsPerPack": 0,
    "possibleOverBroadPacks": 0
  },
  "drift": {
    "staleFileCount": 0,
    "missingFileCount": 0
  },
  "runs": {
    "runReportCount": 0,
    "successCount": 0,
    "partialCount": 0,
    "failedCount": 0,
    "noOpCount": 0
  },
  "lessons": {
    "lessonCount": 0,
    "duplicateLessonCandidates": 0
  },
  "automation": {
    "runtimeStateIgnored": true,
    "configValid": true
  }
}
```

Adapt names if needed, but preserve the spirit.

## Requirements

- Evaluation must not mutate source files except writing the evaluation output.
- It should work even if some optional folders are missing.
- It should produce stable, readable JSON.
- It should be useful for future agents.

## Tests

Add deterministic tests using small fixtures.

Test that:

- evaluator counts tree nodes
- evaluator detects missing ownership
- evaluator counts run reports by result
- evaluator reports automation config status
- evaluation output is serializable

## Run Checks

Run:

```bash
npm run build
npm test
npm run atree:validate
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

Add deterministic evaluation metrics.

## Hypothesis

The repo-maintenance loop becomes more useful when each run can compare objective metrics instead of relying only on self-reflection.

## Files Changed

## Abstraction Layer Affected

## Result

success / partial / failed

## Checks Run

## Metrics Produced

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
