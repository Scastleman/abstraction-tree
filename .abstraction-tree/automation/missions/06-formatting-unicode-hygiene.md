# Mission 6 — Add Formatting and Hidden Unicode Hygiene

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable, self-dogfooding abstraction-memory system for coding agents.

This mission improves repo hygiene for humans and future agents.

## Rules

- Do one bounded improvement.
- Do not add unrelated features.
- Do not push to remote.
- Do not hide failures.
- Keep formatting changes reasonable.
- Stop after this mission.

## Task A — Formatting

Add or improve formatting scripts.

Prefer Prettier if appropriate for this repo.

Add scripts:

```json
{
  "format": "...",
  "format:check": "..."
}
```

Formatting should cover:

- TypeScript
- TSX
- JSON
- Markdown
- YAML
- PowerShell where practical

If PowerShell formatting is not practical with current tooling, document that limitation.

Ensure files are readable and not compressed into one-line blobs.

## Task B — Hidden Unicode Check

Add a script:

```bash
npm run check:unicode
```

It should detect suspicious bidirectional Unicode control characters in source, markdown, JSON, YAML, and scripts.

Characters to detect should include common bidi controls such as:

- U+202A
- U+202B
- U+202C
- U+202D
- U+202E
- U+2066
- U+2067
- U+2068
- U+2069

Suggested script:

`scripts/check-unicode.*`

## Task C — CI

Update CI to run:

```bash
npm run format:check
npm run check:unicode
```

Do this only if the scripts are reliable.

## Tests

Add tests for the Unicode checker if practical.

At minimum, manually run it and record the result.

## Run Checks

Run:

```bash
npm run format:check
npm run check:unicode
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

Add formatting and hidden Unicode hygiene.

## Hypothesis

Future agents and humans make safer changes when source files are consistently formatted and suspicious Unicode is detected automatically.

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
