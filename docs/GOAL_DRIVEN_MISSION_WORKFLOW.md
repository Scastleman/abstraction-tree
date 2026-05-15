# Goal-Driven Mission Workflow

> Audience: Users implementing complex prompts with agent assistance
> Status: Beta review workflow through first v1 unless external feedback justifies graduating planning-only behavior
> Read after: GETTING_STARTED.md and STABLE_VS_EXPERIMENTAL.md.

This is the main advanced workflow for complex coding requests. It turns a broad prompt into a route decision, goal workspace, affected-tree map, mission plan, scope contract, coherence review, and report before Codex executes anything.

Abstraction Tree is not trying to replace human review or create fully self-improving software. Its practical role is to help with difficult coding prompts: map the request onto project memory, decompose it into scoped missions, guide Codex through those missions, and help review whether the resulting changes stayed coherent with the original goal and abstraction tree.

## What This Is

- A local project-memory layer.
- A prompt-to-mission planner for complex coding requests.
- A scope and coherence review system for agent work.
- A way to make Codex changes more reviewable and less likely to overreach.
- A structured workflow for assisted complex prompt implementation.

## What This Is Not

- A guarantee of correct code.
- A replacement for human review.
- A fully autonomous self-improving software system.
- A safe auto-merge system.
- A perfect semantic understanding engine.

## Workflow

```text
complex user prompt
-> route
-> goal workspace
-> affected-tree mapping
-> mission plan
-> mission execution or manual review
-> scope check
-> coherence review
-> evaluation
-> report / PR body
```

Use the prompt router first when you are not sure the prompt needs goal decomposition:

```bash
npm run atree:route -- --file prompts/complex-goal.md
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --review-required
```

`--auto-route` stops before writing a goal workspace when the prompt is direct, strategy-oriented, or manual-review-only. Pass `--force-goal` only when a human has decided goal planning is still the right route.

## Commands

```bash
npm run atree:goal -- --file prompts/complex-goal.md --plan-only
npm run atree:goal -- --file prompts/complex-goal.md --review-required
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --review-required
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --run
npm run atree:goal -- --file prompts/complex-goal.md --run --create-pr
npm run atree:goal -- --file prompts/complex-goal.md --create-pr
```

`--review-required` is the safe default if no mode is passed. It writes the goal workspace and prints mission runner, scope-check, build/test, evaluation, and diff-summary commands to inspect and execute the generated mission folder. This planning surface remains beta for the first v1 unless public beta evidence proves it is stable across external projects.

`--run` and `--full-auto` currently write the plan and refuse execution. That is deliberate: the command should not claim unattended execution until it can call the mission runner with equivalent batching, sandbox, worktree, and coherence-review guardrails. The refusal is recorded in goal-local checks, coherence, score, and final-report artifacts.

## Reviewable Implementation Path

```bash
npm run atree:route -- --file prompts/complex-goal.md
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --review-required
npm run missions:plan -- --missions .abstraction-tree/goals/<goal-id>/missions --ignore-runtime
npm run missions:run -- --missions .abstraction-tree/goals/<goal-id>/missions --ignore-runtime
npm run atree -- scope check --project . --scope .abstraction-tree/goals/<goal-id>/scope-contract.json
npm run atree:evaluate
npm run diff:summary
```

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

## Dynamic Mission Planning

Goal planning derives mission shapes from the target repository's abstraction tree and scanned files. It starts with selected tree nodes and file summaries, then looks for repository-local docs, tests, build files, package scripts, and language conventions such as `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `docs/conf.py`, `mkdocs.yml`, and `book.toml`.

Users can supplement or override inference in `.abstraction-tree/config.json`:

```json
{
  "missionPlanning": {
    "docsPatterns": ["handbook/**/*.md"],
    "testPatterns": ["quality/**/*.spec.ts"],
    "buildPatterns": ["build/*.yml"],
    "buildCommands": ["custom build"],
    "testCommands": ["custom test"],
    "docsCommands": ["custom docs"],
    "validationCommands": ["custom validate"]
  }
}
```

Pattern fields are matched against scanned repository paths and are added to the inferred mission affected files. Command fields replace the inferred checks for that category, so keep any automatic command you still want in the explicit list.

## Safety Boundary

The planner does not push, merge, edit secrets, delete large directories, or mark mission execution complete. Generated missions are proposals until the mission runner plan, local checks, and diff review pass.

Use this flow for prompts that mix product behavior, architecture, CLI/API surface, frontend, tests, docs, migration, or operational concerns. The point is reliability and overreach restriction: the original goal is mapped to explicit files, nodes, invariants, checks, and non-goals before implementation begins.

Human review is still required for important changes. The deterministic MVP can structure and assess scope, but it does not provide perfect semantic understanding or proof that the resulting implementation is correct.

## Setup Flow

Before using goal-driven planning in a new project, create local memory and inspect it in the visual app:

```bash
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree serve --open
```

The visual app shows the target project's generated abstraction tree. It should not show Abstraction Tree's own dogfooding memory unless the target project is this repository.

## CI Coverage

Repository CI smoke tests `atree route` and `atree goal --auto-route --review-required` with a temporary prompt file. This verifies deterministic routing, goal workspace creation, mission planning, and scope-contract generation without invoking Codex or running generated missions.
