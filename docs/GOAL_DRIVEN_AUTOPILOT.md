# Goal-Driven Autopilot

Goal-driven autopilot turns a complex user prompt into a reviewable mission folder before Codex executes anything.

Use the prompt router first when you are not sure the prompt needs goal decomposition:

```bash
npm run atree:route -- --file prompts/complex-goal.md
npm run atree:goal -- --file prompts/complex-goal.md --auto-route
```

`--auto-route` stops before writing a goal workspace when the prompt is direct, strategy-oriented, or manual-review-only. Pass `--force-goal` only when a human has decided goal planning is still the right route.

```text
complex user goal
-> abstraction memory
-> scope and risk assessment
-> affected tree mapping
-> mission decomposition
-> mission runner review/execution
-> coherence review and final report
```

The workflow is intentionally separate from the full self-improvement loop:

```text
self-improvement loop input = repo state
goal-driven loop input = user goal + repo state
```

## Commands

```bash
npm run atree:goal -- --file prompts/complex-goal.md --plan-only
npm run atree:goal -- --file prompts/complex-goal.md --review-required
npm run atree:goal -- --file prompts/complex-goal.md --create-pr
```

`--review-required` is the safe default if no mode is passed. It writes the goal workspace and prints the mission runner commands to inspect and execute the generated mission folder.

`--full-auto` currently writes the plan and refuses execution. That is deliberate: the command should not claim autonomous execution until it can call the mission runner with equivalent batching, sandbox, worktree, and coherence-review guardrails.

## Workspace

Each goal gets a durable workspace:

```text
.abstraction-tree/goals/YYYY-MM-DD-HHMM-<slug>/
  goal.md
  goal.json
  goal-assessment.md
  affected-tree.json
  mission-plan.json
  missions/
  coherence-review.md
  final-report.md
  pr-body.md
```

`goal.md` preserves the original prompt exactly. The assessment, affected-tree map, and mission plan are deterministic first-pass artifacts built from `.abstraction-tree/tree.json`, `files.json`, `concepts.json`, `invariants.json`, change records, and evaluation reports.

## Safety Boundary

The planner does not push, merge, edit secrets, delete large directories, or mark mission execution complete. Generated missions are proposals until the mission runner plan, local checks, and diff review pass.

Use this flow for prompts that mix product behavior, architecture, CLI/API surface, frontend, tests, docs, migration, or operational concerns. The point is reliability and overreach restriction: the original goal is mapped to explicit files, nodes, invariants, checks, and non-goals before implementation begins.
