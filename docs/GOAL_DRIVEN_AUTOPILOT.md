# Goal-Driven Mission Workflow

The goal-driven mission workflow turns a complex user prompt into a reviewable mission folder before Codex executes anything. It is a prompt-to-mission planning and review workflow, not a guarantee that generated code will be correct.

## What This Is

- A local project-memory layer.
- A prompt-to-mission planner for complex code changes.
- A scope and coherence review system for agent work.
- A way to make Codex changes more reviewable and less likely to overreach.
- A structured workflow for assisted project improvement.

## What This Is Not

- A guarantee of correct code.
- A replacement for human review.
- A fully autonomous self-improving software system.
- A safe auto-merge system.
- A perfect semantic understanding engine.

Use the prompt router first when you are not sure the prompt needs goal decomposition:

```bash
npm run atree:route -- --file prompts/complex-goal.md
npm run atree:goal -- --file prompts/complex-goal.md --auto-route
```

`--auto-route` stops before writing a goal workspace when the prompt is direct, strategy-oriented, or manual-review-only. Pass `--force-goal` only when a human has decided goal planning is still the right route.

```text
complex user goal
-> route
-> goal workspace
-> affected tree mapping
-> mission plan
-> mission execution or manual review
-> scope check
-> coherence review
-> evaluation
-> report / PR body
```

The workflow is intentionally separate from the experimental local dogfooding loop:

```text
dogfooding loop input = repo state
goal-driven workflow input = user goal + repo state
```

## Commands

```bash
npm run atree:goal -- --file prompts/complex-goal.md --plan-only
npm run atree:goal -- --file prompts/complex-goal.md --review-required
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --review-required
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --run
npm run atree:goal -- --file prompts/complex-goal.md --run --create-pr
npm run atree:goal -- --file prompts/complex-goal.md --create-pr
```

`--review-required` is the safe default if no mode is passed. It writes the goal workspace and prints the mission runner, scope-check, build/test, evaluation, and diff-summary commands to inspect and execute the generated mission folder.

`--run` and `--full-auto` currently write the plan and refuse execution. That is deliberate: the command should not claim unattended execution until it can call the mission runner with equivalent batching, sandbox, worktree, and coherence-review guardrails. The refusal is recorded in goal-local checks, coherence, score, and final-report artifacts.

## Workspace

Each goal gets a durable workspace:

```text
.abstraction-tree/goals/YYYY-MM-DD-HHMM-<slug>/
  goal.md
  goal.json
  goal-assessment.md
  route.json
  route.md
  affected-tree.json
  mission-plan.json
  scope-contract.json
  scope-contract.md
  missions/
  checks.json
  checks.md
  coherence-review.md
  goal-score.json
  final-report.md
  pr-body.md
```

`goal.md` preserves the original prompt exactly. The assessment, affected-tree map, mission plan, route record, scope contract, coherence review, and goal score are deterministic first-pass artifacts built from `.abstraction-tree/tree.json`, `files.json`, `concepts.json`, `invariants.json`, change records, and evaluation reports.

## Recommended Review Flow

```bash
npm run atree:route -- --file prompts/complex-goal.md
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --review-required
npm run missions:plan -- --missions .abstraction-tree/goals/<goal-id>/missions --ignore-runtime
npm run missions:run -- --missions .abstraction-tree/goals/<goal-id>/missions --ignore-runtime
npm run atree -- scope check --project . --scope .abstraction-tree/goals/<goal-id>/scope-contract.json
npm run atree:evaluate
npm run diff:summary
```

## Safety Boundary

The planner does not push, merge, edit secrets, delete large directories, or mark mission execution complete. Generated missions are proposals until the mission runner plan, local checks, and diff review pass.

Use this flow for prompts that mix product behavior, architecture, CLI/API surface, frontend, tests, docs, migration, or operational concerns. The point is reliability and overreach restriction: the original goal is mapped to explicit files, nodes, invariants, checks, and non-goals before implementation begins.

Human review is still required for important changes. The deterministic MVP can structure and assess scope, but it does not provide perfect semantic understanding or proof that the resulting implementation is correct.

## CI Coverage

Repository CI smoke tests `atree route` and `atree goal --auto-route --review-required` with a temporary prompt file. This verifies deterministic routing, goal workspace creation, mission planning, and scope-contract generation without invoking Codex or running generated missions.
