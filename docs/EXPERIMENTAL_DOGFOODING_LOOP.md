# Experimental Dogfooding Loop

> Audience: Maintainers
> Status: Experimental local dogfooding workflow
> Read after: GOAL_DRIVEN_MISSION_WORKFLOW.md and MISSION_RUNNER.md.

This is not the main product workflow.

The main workflow is [Goal-Driven Mission Workflow](GOAL_DRIVEN_MISSION_WORKFLOW.md): route a complex prompt, create a goal workspace, map affected tree nodes, generate bounded missions, execute or review those missions, check scope, review coherence, evaluate the result, and prepare a report or PR body.

This page documents the optional repo-maintenance loop used to test Abstraction Tree on itself. It was historically called the "full self-improvement loop" in scripts and older reports. That name is compatibility terminology, not a product claim.

## What The Loop Does

`npm run self:loop` is a local dogfooding workflow. It can:

- collect repository evidence;
- create an assessment pack;
- draft or consume mission folders;
- plan missions with `scripts/run-missions.mjs`;
- run selected mission prompts through Codex when explicitly invoked;
- collect post-run context;
- write a read-only coherence review or evidence pack;
- write durable run reports and lessons for this repository.

It is structured assistance for repository maintenance. It does not safely auto-evolve the project, guarantee correct changes, replace human review, push, merge, or auto-accept its own output.

## Safer Starting Point

For broad repository strategy, prefer an assessment pack first:

```bash
npm run assessment:pack
```

Use the generated `assessment-prompt.md` in ChatGPT or with a human reviewer, then import and plan the resulting missions:

```bash
npm run assessment:import -- --from <folder> --name <name>
npm run missions:plan:manual -- --missions .abstraction-tree/missions/<name>
npm run missions:run:manual -- --missions .abstraction-tree/missions/<name>
npm run atree:evaluate
npm run diff:summary
```

## Pack-Only Mode

To exercise full-loop evidence collection without invoking Codex:

```bash
npm run self:loop -- --assessment-pack-only
```

This creates a normal full-loop run directory, writes an assessment pack under `assessment-pack/`, prints the pack and prompt paths, and exits before Codex assessment, mission planning, mission execution, post-run context, coherence review, and durable report writing.

## External Mission Mode

To reuse a ChatGPT or human-authored mission folder while keeping the loop's evidence and report stages:

```bash
npm run self:loop -- --skip-codex-assessment --missions .abstraction-tree/missions/review-2026-05-10 --allow-dirty
```

This skips Codex assessment and mission authoring, runs the provided mission folder through the usual planning/execution path, then collects post-run evidence and writes reports.

## External Coherence Review

To create a post-run coherence evidence pack for ChatGPT or human review instead of asking Codex for the final judgment:

```bash
npm run self:loop -- --external-coherence-review --allow-dirty
```

The loop writes `coherence-prompt.md` and `coherence-inputs.json` in the full-loop run directory and marks coherence review as pending external review.

## Safety

- The loop refuses to start on a dirty working tree unless `--allow-dirty` is passed.
- Writable parallel execution uses mission worktrees.
- `--sandbox danger-full-access` requires `--allow-danger-full-access`.
- Run artifacts under `.abstraction-tree/automation/full-loop-runs/`, `.abstraction-tree/mission-runs/`, and `.abstraction-tree/worktrees/` stay ignored.
- Durable project memory should be preserved through `.abstraction-tree/runs/`, `.abstraction-tree/lessons/`, semantic change records, and refreshed abstraction tree files.

## Useful Commands

```bash
npm run self:loop -- --dry-run --allow-dirty
npm run self:loop -- --assessment-pack-only
npm run self:loop -- --max-missions 2 --concurrency 1 --allow-dirty
npm run atree:evaluate
npm run diff:summary
```
