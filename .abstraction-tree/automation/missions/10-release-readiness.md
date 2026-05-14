# Mission 10 — Final Cleanup and Release Readiness Review

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable project-memory and prompt-to-mission system for coding agents.

This mission is a final cleanup and release-readiness review.

## Rules

- Do not add major new features.
- Do not push to remote.
- Do not hide failures.
- Only fix small issues found during review.
- Stop after this mission.

## Inspect

Review:

- `git status`
- `git diff`
- `README.md`
- `docs/`
- `.abstraction-tree/automation/`
- `.gitignore`
- `package.json`
- CI workflow
- loop runner
- validation
- evaluator
- diff summary
- formatting/unicode scripts
- LLM interface
- visual app changes

## Check For

- committed live runtime counters
- ignored files accidentally referenced as required
- broken npm scripts
- stale docs
- generated files that should not be committed
- huge accidental diffs
- hidden Unicode issues
- one-line compressed files
- failing tests
- misleading claims about LLM intelligence

## Run Final Checks

Run every relevant check:

```bash
npm install
npm run build
npm test
npm run atree:validate
```

If available:

```bash
npm run atree:evaluate
npm run diff:summary
npm run format:check
npm run check:unicode
```

## Fix Only Small Issues

Only fix small, obvious issues.

Examples:

- broken script name
- stale docs reference
- missing `.gitignore` entry
- formatting issue
- wrong file path in docs
- malformed JSON
- missing export

Do not start a new architecture change.

## Write Final Readiness Report

Create:

`.abstraction-tree/evaluations/YYYY-MM-DD-HHMM-release-readiness.md`

Use this format:

```md
# Release Readiness Review

## Summary

## Checks Run

## Passing

## Failing

## Remaining Risks

## Source-Control Hygiene

## Automation Loop Readiness

## Evaluation Metrics Readiness

## Documentation Readiness

## Recommended Before Publish

## Final Verdict
```

Also write:

`.abstraction-tree/runs/YYYY-MM-DD-HHMM-agent-run.md`

and:

`.abstraction-tree/lessons/YYYY-MM-DD-HHMM-lesson.md`

Stop after this mission.
