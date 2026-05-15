# Abstraction Tree Docs

Use this page to choose the right document for your current task.

## New Users

| Doc | Start here if |
| --- | --- |
| [Getting Started](GETTING_STARTED.md) | You want the stable provider-free path from install or clone to first scan. |
| [Visual Demo](VISUAL_DEMO.md) | You want to see what the local app shows and how to capture screenshots. |
| [Stable vs Experimental](STABLE_VS_EXPERIMENTAL.md) | You want to know which commands are stable, beta, or experimental. |
| [V1 Release Gate](V1_RELEASE_GATE.md) | You want the pass/fail bar for calling the project v1-ready. |

## Core Concepts

| Doc | Owns |
| --- | --- |
| [Architecture](ARCHITECTURE.md) | Core package, CLI, visual app, adapters, and data flow. |
| [Data Model](DATA_MODEL.md) | `.abstraction-tree/` memory files, schema maturity, and dogfooding boundary. |
| [Project Configuration](CONFIGURATION.md) | Custom subsystem patterns, domain vocabulary, and scan config overrides. |
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
| [Packaging](PACKAGING.md) | Public beta packages, local tarball preflight, and release checklist. |
| [Release Runbook](RELEASE_RUNBOOK.md) | Manual public beta publish checklist and post-publish verification steps. |
| [Roadmap](ROADMAP.md) | Implemented capabilities, current limitations, next priorities, and later ideas. |
| [Maintainer Notes](MAINTAINER_NOTES.md) | Internal refactor plans and compatibility notes. |
| [V1 Release Candidate Review](V1_RELEASE_CANDIDATE_REVIEW.md) | Current gate-by-gate release candidate assessment. |
| [Beta Verification Evidence Template](release-evidence/beta-verification-template.md) | External npm verification evidence template for public beta testing. |
| [0.2.0-beta.1 Verification Evidence](release-evidence/2026-05-14-0.2.0-beta.1-verification.md) | Completed public npm beta install verification. |
| [Diverse Repository Beta Evaluation](release-evidence/2026-05-15-diverse-repository-beta-evaluation.md) | Internal five-repository beta scan, context, route, and quality findings. |

## Compatibility Pages

- [GOAL_DRIVEN_AUTOPILOT.md](GOAL_DRIVEN_AUTOPILOT.md) points old autopilot terminology to the mission workflow.
- [FULL_SELF_IMPROVEMENT_LOOP.md](FULL_SELF_IMPROVEMENT_LOOP.md) points old self-improvement terminology to the dogfooding-loop page.
- [DOCS_INDEX.md](DOCS_INDEX.md) is kept as a short legacy index.
