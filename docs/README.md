# Abstraction Tree Docs

Use this page to choose the right document for your current task.

## New Users

| Doc | Start here if |
| --- | --- |
| [Getting Started](GETTING_STARTED.md) | You want the stable provider-free path from install or clone to first scan. |
| [Visual Demo](VISUAL_DEMO.md) | You want to see what the local app shows and how to capture screenshots. |
| [Stable vs Experimental](STABLE_VS_EXPERIMENTAL.md) | You want to know which commands are stable, beta, or experimental. |

## Core Concepts

| Doc | Owns |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Core package, CLI, visual app, adapters, and data flow. |
| [Data Model](DATA_MODEL.md) | `.abstraction-tree/` memory files, schema maturity, and dogfooding boundary. |
| [CI Integration](CI_INTEGRATION.md) | Deterministic CI checks and smoke workflows. |
| [Scope Contracts](SCOPE_CONTRACTS.md) | Prompt scope creation and diff checking. |

## Agent-Assisted Workflows

| Doc | Owns |
| --- | --- |
| [Agent Protocol](AGENT_PROTOCOL.md) | Rules for agents using abstraction memory. |
| [Goal-Driven Mission Workflow](GOAL_DRIVEN_MISSION_WORKFLOW.md) | Route -> goal workspace -> missions -> scope -> coherence -> evaluation. |
| [Mission Runner](MISSION_RUNNER.md) | Mission schema, planning, execution, safety, and artifacts. |
| [Assessment Packs](ASSESSMENT_PACKS.md) | Evidence packs for ChatGPT or human strategic review. |
| [Experimental Dogfooding Loop](EXPERIMENTAL_DOGFOODING_LOOP.md) | Optional repository-maintenance loop for this repo. |

## Maintainers

| Doc | Owns |
| --- | --- |
| [Packaging](PACKAGING.md) | Planned npm packages, local tarball preflight, and release checklist. |
| [Roadmap](ROADMAP.md) | Implemented capabilities, current limitations, next priorities, and later ideas. |
| [Maintainer Notes](MAINTAINER_NOTES.md) | Internal refactor plans and compatibility notes. |

## Compatibility Pages

- [GOAL_DRIVEN_AUTOPILOT.md](GOAL_DRIVEN_AUTOPILOT.md) points old autopilot terminology to the mission workflow.
- [FULL_SELF_IMPROVEMENT_LOOP.md](FULL_SELF_IMPROVEMENT_LOOP.md) points old self-improvement terminology to the dogfooding-loop page.
- [DOCS_INDEX.md](DOCS_INDEX.md) is kept as a short legacy index.
