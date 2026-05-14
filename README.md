# Abstraction Tree

[![CI](https://github.com/Scastleman/abstraction-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/Scastleman/abstraction-tree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm packages](https://img.shields.io/badge/npm-planned%20not%20published%20yet-lightgrey.svg)](docs/PACKAGING.md)

Abstraction Tree is a local project-memory and prompt-to-mission planning layer for coding agents. It helps implement complex coding requests by mapping a prompt onto project memory, decomposing broad work into scoped missions, guiding Codex execution, and reviewing whether the resulting changes stayed coherent with the original goal and abstraction tree.

The default path is deterministic and local-first: scan files, build an abstraction tree, route prompts, create context packs, validate memory, export diagrams, and evaluate results without requiring an API key. LLM/provider work is explicit and review-gated rather than part of the default scan path.

Tree nodes keep a short `summary`, a richer `explanation`, an explicit `reasonForExistence`, and, when the node has children, `separationLogic`. The summary is compact fallback text; the explanation describes the node's role, ownership, dependencies, constraints, parent/child context, and safe-change guidance. `reasonForExistence` explains why the node deserves to exist in the project at all. `separationLogic` describes the partition rule used for child nodes, such as concept clusters, architecture surfaces, module ownership zones, or file-level edit boundaries.

## What This Is

- A local `.abstraction-tree/` project-memory layer.
- A prompt router for direct, goal-driven, assessment-pack, and manual-review decisions.
- A prompt-to-mission workflow for complex coding requests.
- A scope and coherence review surface for Codex work.
- A visual project map for humans and agents to inspect the generated tree.

## What This Is Not

- A guarantee of correct code.
- A replacement for human review.
- A fully autonomous self-improving software system.
- A safe auto-merge system.
- A perfect semantic understanding engine.

## Quick Start

The npm package names are planned but not published yet. After the first npm release:

```bash
cd your-existing-project
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree doctor
npx atree serve --open
```

`atree init` creates a blank project-local `.abstraction-tree/` workspace. It does not copy this repository's dogfooding memory. `atree scan` generates tree, file, concept, invariant, and change memory from the target project's own files.

In this repository today:

```bash
npm install
npm run build
npm run atree -- init --with-app --project examples/small-web-app
npm run atree -- scan --project examples/small-web-app
npm run atree -- doctor --project examples/small-web-app
npm run atree -- validate --project examples/small-web-app
npm run atree -- context --project examples/small-web-app --target checkout
npm run atree -- export --project examples/small-web-app --format mermaid
npm run atree -- serve --project examples/small-web-app --open
```

`atree serve --open` launches the local visual app in your default browser. Without `--open`, `atree serve` prints the URL for manual opening.

For the full beginner path, see [Getting Started](docs/GETTING_STARTED.md), [Stable vs Experimental](docs/STABLE_VS_EXPERIMENTAL.md), and the [Visual Demo](docs/VISUAL_DEMO.md).

## Main Workflow

For simple prompts, route and execute directly. For complex prompts, use the reviewable mission workflow:

```bash
npm run atree:route -- --file prompts/complex-goal.md
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --review-required
npm run missions:plan -- --missions .abstraction-tree/goals/<goal-id>/missions --ignore-runtime
npm run missions:run -- --missions .abstraction-tree/goals/<goal-id>/missions --ignore-runtime
npm run atree:scope:check
npm run atree:evaluate
npm run diff:summary
```

```text
prompt
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

Codex is the bounded executor. Abstraction Tree supplies memory, scope, mission planning, and review surfaces. Humans remain responsible for accepting important changes.

## Stable vs Advanced

| Surface | Status |
| --- | --- |
| `init`, `scan`, `doctor`, `validate`, `migrate` | Stable deterministic core |
| `context`, `export`, `serve` | Stable memory/display surfaces |
| `route`, `scope`, `evaluate`, `assessment:pack`, `goal --review-required` | Beta review workflows |
| `propose`, `missions:run`, `self:loop` | Experimental or maintainer workflows |

See [Stable vs Experimental](docs/STABLE_VS_EXPERIMENTAL.md) for the full boundary.

## Visual App

The visual app reads the target project's generated `.abstraction-tree/` memory and shows:

- the abstraction hierarchy;
- node summaries, explanations, reasons for existence, and separation logic;
- file ownership by tree node;
- concepts and invariants;
- recent changes and drift status.

It should only show this repository's dogfooding memory when this repository is the target project.

At startup, `serve` prints the resolved project root, project name, memory counts, and warnings for unscanned memory or accidental serving of this repository's dogfooding memory. Check those lines when replacing an existing preview; the browser should show the same project name as the startup summary.

Use `--host 0.0.0.0` only when you intentionally want LAN access; the CLI prints a risk warning for wildcard or non-loopback hosts.

## Development

```bash
npm install
npm run build
npm test
npm run atree:validate
npm run atree:evaluate
```

When core behavior, docs, packaging, CLI commands, or app structure changes, refresh this repo's own abstraction memory:

```bash
npm run atree:scan
npm run atree:validate
npm run atree:evaluate
```

## Docs

| Doc | Owns |
| --- | --- |
| [Docs index](docs/README.md) | Where each concept lives. |
| [Getting started](docs/GETTING_STARTED.md) | Stable clone/install to first scan path. |
| [Stable vs experimental](docs/STABLE_VS_EXPERIMENTAL.md) | Command maturity and safety boundaries. |
| [Visual demo](docs/VISUAL_DEMO.md) | How to inspect the generated tree in the app. |
| [Goal-driven mission workflow](docs/GOAL_DRIVEN_MISSION_WORKFLOW.md) | Main complex prompt workflow. |
| [Mission runner](docs/MISSION_RUNNER.md) | Mission file format, planning, execution, and artifacts. |
| [Scope contracts](docs/SCOPE_CONTRACTS.md) | Scope creation and diff checks. |
| [Assessment packs](docs/ASSESSMENT_PACKS.md) | ChatGPT/human strategic review packs. |
| [Agent protocol](docs/AGENT_PROTOCOL.md) | Rules for agents using `.abstraction-tree/`. |
| [Data model](docs/DATA_MODEL.md) | Memory files, schema, and dogfooding boundary. |
| [Architecture](docs/ARCHITECTURE.md) | Core, CLI, app, and provider-adapter architecture. |
| [Packaging](docs/PACKAGING.md) | Planned npm packages and install modes. |
| [CI integration](docs/CI_INTEGRATION.md) | Deterministic CI usage. |
| [Experimental dogfooding loop](docs/EXPERIMENTAL_DOGFOODING_LOOP.md) | Optional repo-maintenance loop for this repository. |
| [Roadmap](docs/ROADMAP.md) | Implemented capabilities, limitations, next priorities, and later ideas. |

## Repository Layout

```text
abstraction-tree/
  packages/
    core/              # schema, scan, tree build, context pack, validation
    cli/               # CLI package
    app/               # optional browser UI
    full/              # full install package
  adapters/
    codex/             # instructions for Codex-style agents
  examples/
    small-web-app/     # scanner/app fixture
  docs/                # product, workflow, packaging, and maintainer docs
```

## License

MIT
