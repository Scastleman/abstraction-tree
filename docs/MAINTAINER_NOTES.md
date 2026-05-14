# Maintainer Notes

> Audience: Maintainers
> Status: Internal planning notes
> Read after: MISSION_RUNNER.md.

This page holds internal maintenance plans that are useful for contributors but too detailed for user-facing workflow docs.

## Mission Runner Modularization Plan

Keep `scripts/run-missions.mjs` and the historically named `scripts/run-full-self-improvement-loop.mjs` as compatibility entrypoints. Extract one module at a time, import it back into the original script, and preserve exported helper names until tests and local callers have moved intentionally.

Proposed mission runner layout:

```text
scripts/mission-schema.mjs
scripts/mission-runner/
  args.mjs
  discovery.mjs
  frontmatter.mjs
  planning.mjs
  execution.mjs
  runtime.mjs
  codex-jsonl.mjs
  worktrees.mjs
```

Safe extraction order:

1. Keep mission schema and parsing helpers centralized in `scripts/mission-schema.mjs`; continue re-exporting `parseMissionMarkdown` and `parseSimpleFrontmatter` from `scripts/run-missions.mjs` while callers migrate.
2. Move mission runtime helpers next: `readMissionRuntime`, `emptyMissionRuntime`, `filterMissionsByRuntime`, `updateMissionRuntime`, and runtime identity/key helpers.
3. Move pure planning helpers: `createMissionPlan`, batching conflict checks, dependency ordering, global-file checks, invariant checks, and execution blocker calculation.
4. Move Codex JSONL parsing: `finalAgentMessage`, agent text extraction, content extraction, and fallback final message handling.
5. Move discovery and memory reads: `discoverMissions`, `readMissionFile`, `readAbstractionMemory`, Markdown walking, affected-file inference, affected-node inference, affected-concept inference, and first-heading inference.
6. Move side-effectful execution last: `executePlan`, `executeMission`, prompt hydration, `assemblePrompt`, mission status writing, Codex spawning, stream closing, artifact path helpers, and worktree preparation.

## Dogfooding Loop Modularization Plan

Proposed layout:

```text
scripts/full-loop/
  args.mjs
  assessment.mjs
  validation.mjs
  coherence.mjs
  reporting.mjs
```

Safe extraction order:

1. Move argument parsing helpers.
2. Move assessment prompt and assessment context collection.
3. Move assessment output validation and generated mission contract checks.
4. Move coherence prompt construction.
5. Move durable run report, stop/repeat decision rendering, and report text helpers.

## Compatibility Notes During Extraction

- Keep original scripts as facade modules during migration.
- Do not change CLI flags, defaults, output paths, artifact formats, JSON field names, mission ordering, sandbox gates, or worktree behavior during extraction.
- Move tests with the behavior they protect.
- After each extraction step, run `npm test`, `npm run build`, and a mission runner dry run.
