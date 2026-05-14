# Stable vs Experimental

> Audience: New users, maintainers, and agent operators
> Status: Stable reference
> Start here if: you want to know which Abstraction Tree surfaces are safe default workflows.

Abstraction Tree has several useful workflows, but they are not all at the same maturity level. The stable path is deterministic, local, and provider-free. Agent execution and provider-assisted proposals remain review-gated or experimental.

For release decisions, use [V1_RELEASE_GATE.md](V1_RELEASE_GATE.md) as the pass/fail bar. The table below describes command maturity; it does not by itself declare the project v1-ready.

| Surface | Status | Why |
| --- | --- | --- |
| `init`, `scan`, `doctor`, `validate`, `migrate` | Stable MVP | Deterministic local project-memory commands. They do not invoke providers. |
| `context`, `export`, `serve` | Stable MVP | Read or display generated memory. `serve --open` is opt-in and local-first. |
| `route` | Beta | Read-only prompt classifier. Useful for guidance, but heuristics may change. |
| `scope` and `scope check` | Beta | Helps detect overreach against a prompt scope; review the result before relying on it. |
| `evaluate` | Beta | Deterministic quality metrics. Useful signal, not a semantic correctness guarantee. |
| `assessment:pack` | Beta | Creates review evidence for ChatGPT or humans. It does not execute Codex. |
| `goal --review-required` | Beta through first v1 unless external feedback justifies graduation | Creates a goal workspace and mission plan; humans choose whether to execute. |
| `propose` | Experimental | Provider adapters write review artifacts only, not canonical memory. |
| `missions:run` | Experimental | Invokes Codex on mission files. Inspect plans, diffs, checks, and reports. |
| `self:loop` | Experimental dogfooding | Local repo-maintenance workflow for this repository, not a default user path. |
| `goal --run`, `goal --full-auto` | Not stable | Guarded and should refuse unless safe execution is explicitly implemented. |

## Status Definitions

Stable means the command is part of the expected v1 user path and should remain deterministic, local, and safe for normal project use.

Beta means the workflow is useful and tested, but output should be reviewed and the shape may still change before v1.

Experimental means the workflow is for maintainers or advanced users. It may run agents, create large artifacts, or depend on local setup. Inspect outputs before accepting changes.

Not stable means the project intentionally refuses or limits execution until safety gates are strong enough.

## V1 Goal Workflow Boundary

For the first v1, keep `goal --review-required` beta unless public beta feedback shows that the planning-only surface is reliable across external projects. The stable v1 product remains deterministic project memory, validation, context packs, export, and visual inspection. `goal --run`, `goal --full-auto`, and mission execution are not stable v1 surfaces.

## Safety Boundaries

- `scan`, `validate`, `context`, `export`, `evaluate`, and `serve` do not call an LLM provider by default.
- Provider proposals are review artifacts. They are not written directly into canonical `.abstraction-tree/` memory.
- Mission files are plans until they are reviewed, scope-checked, executed, and diff-reviewed.
- The dogfooding loop must not push, merge, bypass checks, or run unbounded.
- Humans remain responsible for accepting important code changes.
