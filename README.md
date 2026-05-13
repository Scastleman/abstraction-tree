# Abstraction Tree

[![CI](https://github.com/Scastleman/abstraction-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/Scastleman/abstraction-tree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm packages](https://img.shields.io/badge/npm-planned%20not%20published%20yet-lightgrey.svg)](docs/PACKAGING.md)

Abstraction Tree is a local-first codebase understanding system. It scans an existing software project, builds a deterministic abstraction-memory baseline, and gives both humans and coding agents a shared map of the codebase.

The default layer is structured project facts, deterministic tree generation, validation, and agent context packs without requiring an API key. Higher automation is explicit and review-oriented rather than part of the default scan path.

The source of truth is always the project-local `.abstraction-tree/` folder. The visual app is optional: it reads the same tree data and displays it as an interactive project map.

Tree nodes keep a short `summary`, a richer `explanation`, an explicit `reasonForExistence`, and, when the node has children, `separationLogic`. The summary is compact fallback text; the explanation describes the node's role, ownership, dependencies, constraints, parent/child context, and safe-change guidance. `reasonForExistence` explains why the node deserves to exist in the project at all, such as why a visual app is useful instead of only storing JSON memory. Separation logic describes the partition rule used for the child nodes below it, such as concept clusters, architecture surfaces, module ownership zones, or file-level edit boundaries. The first implementation is deterministic and evidence-based rather than LLM-inferred, so future adapters can improve explanation quality without changing the default local scan path.

## Core promise

Add Abstraction Tree to any repo, build the initial memory tree, and make the project easier to inspect, prompt, and safely change.

These are the intended npm commands after the first public package release:

```bash
cd your-existing-project
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree doctor
npx atree serve
```

The npm package names are planned but not published yet. In this repository today, use the local workspace commands:

```bash
npm install
npm run build
npm run atree -- scan --project .
npm run atree -- doctor --project .
npm run atree -- export --project . --format mermaid
npm run atree -- serve --project .
```

The local visual app shows:

- project structure as an abstraction tree;
- richer node explanations for human and agent project comprehension;
- concepts and cross-cutting dependencies;
- file ownership by tree node;
- inferred invariants;
- recent semantic changes;
- drift between current code and stored tree memory;
- context packs that coding agents can consume.

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

## Assisted workflow maturity ladder

Start at Level 1 for the safest adoption path. Each higher level assumes the earlier levels are understood and validated:

```text
Level 1: scan / validate / context
Level 2: visual app
Level 3: ChatGPT/human assessment packs
Level 4: mission runner
Level 5: prompt routing
Level 6: goal-driven mission planning
Level 7: proposal adapters through atree propose
Level 8: experimental local dogfooding loop
```

LLM inference is not part of the default scan pipeline. The repo includes an explicit `atree propose` review workflow for provider adapters, but proposals are validated and saved for review rather than directly mutating canonical memory.

The preferred strategic workflow is staged:

1. Run `npm run assessment:pack`.
2. Review `assessment-prompt.md` in ChatGPT or with a human reviewer.
3. Generate a bounded mission folder from that assessment.
4. Import and validate it with `npm run assessment:import -- --from ./chatgpt-missions --name review-2026-05-10`.
5. Run `npm run missions:plan:manual` to inspect scope, dependencies, and execution blockers.
6. Run `npm run missions:run:manual` to execute scoped missions through Codex.
7. Run `npm run atree:evaluate` and review the objective results.

Codex is the bounded executor. ChatGPT and humans are the preferred strategic assessment layer. Abstraction Tree is the memory, evidence, validation, and scope boundary between strategy and execution. Treat assessment output as a proposal: validate mission files and review the resulting diff before accepting changes.

Assessment packs include `pack-safety.json` with redaction, omission, truncation, and byte-size metadata. The pack generator applies default redaction for common secret-like values and supports `--redact`, `--redact-file`, `--max-bytes-per-artifact`, `--max-total-bytes`, `--no-diff`, `--no-runs`, `--no-lessons`, and `--no-mission-runtime`. Inspect `pack-safety.json` and the artifacts before pasting a pack into ChatGPT or sharing it externally.

## Prompt Routing

Before sending a prompt to Codex, route it:

```bash
npm run atree:route -- --file prompts/complex-goal.md
npm run atree:route -- --text "Fix the typo in README." --json
```

The router is deterministic and read-only. It uses `.abstraction-tree/` memory when available and classifies prompts into four outcomes:

```text
simple prompt -> direct
complex prompt -> goal-driven mission workflow
strategy prompt -> assessment pack
risky prompt -> manual review
```

Use this when you are unsure whether a prompt is safe to execute directly or should be decomposed first. The router does not run Codex, edit files, push, or merge.

## Goal-Driven Mission Workflow

For complex prompts, Abstraction Tree can compile the user goal into a goal workspace, assessment, affected-tree map, and mission-runner-compatible Markdown files:

```bash
npm run atree:goal -- --file prompts/complex-goal.md --auto-route
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --review-required
npm run atree:goal -- --file prompts/complex-goal.md --plan-only
npm run atree:goal -- --file prompts/complex-goal.md --review-required
npm run atree:goal -- --file prompts/complex-goal.md --auto-route --run
npm run atree:goal -- --file prompts/complex-goal.md --create-pr
```

The command stores the original prompt unchanged under:

```text
.abstraction-tree/goals/YYYY-MM-DD-HHMM-<slug>/
```

It then writes `goal-assessment.md`, `affected-tree.json`, `mission-plan.json`, `missions/`, `scope-contract.json`, `scope-contract.md`, `coherence-review.md`, `goal-score.json`, and `final-report.md`. If `--auto-route` is used, it also writes `route.json` and `route.md`. `--review-required` prints the mission runner, scope-check, evaluation, and diff-summary commands to inspect and execute the generated folder.

`--run` and `--full-auto` currently plan the goal and refuse execution with a clear message until safe runner integration is implemented. The refusal is recorded in `checks.json`, `checks.md`, `coherence-review.md`, `goal-score.json`, and `final-report.md`; it is not reported as success.

`--auto-route` calls `atree route` first. If the prompt is direct, strategy-oriented, or manual-review-only, goal planning stops unless `--force-goal` is passed.

```text
dogfooding loop input = repo state
goal-driven workflow input = user goal + repo state
```

Use the goal-driven mission workflow when a user request mixes product behavior, architecture, CLI/API surface, tests, docs, and safety concerns. It is designed to reduce overreach by mapping the prompt onto committed abstraction memory before Codex receives bounded missions.

Related workflow docs:

- [CI integration](docs/CI_INTEGRATION.md)
- [Mission runner](docs/MISSION_RUNNER.md)
- [Goal-driven mission workflow](docs/GOAL_DRIVEN_AUTOPILOT.md)
- [Scope contracts](docs/SCOPE_CONTRACTS.md)
- [Agent protocol and LLM-assisted proposals](docs/AGENT_PROTOCOL.md)
- [LLM abstraction interface](docs/ARCHITECTURE.md#llm-abstraction-interface)
- [Experimental local dogfooding loop](docs/FULL_SELF_IMPROVEMENT_LOOP.md)

## Planned npm install modes

Abstraction Tree is intentionally split into two adoption paths.

The package names in this section are the intended public npm release names. Until the first release is published, `npm install -D @abstraction-tree/cli` and `npm install -D abstraction-tree` will return `E404 package not found`; use the local workspace scripts above.

### 1. Core-only mode

Use this when you only want the abstraction tree, agent context packs, validation, and CI/script support. No visual app is required.

```bash
npm install -D @abstraction-tree/cli
npx atree init --core
npx atree scan
npx atree doctor
npx atree validate
npx atree context --target checkout
```

`init` creates only the neutral local workspace:

```txt
.abstraction-tree/
  config.json
  context-packs/
  changes/
```

Then `scan` creates and maintains generated project memory:

```txt
.abstraction-tree/
  config.json
  ontology.json
  tree.json
  files.json
  concepts.json
  invariants.json
  context-packs/
  changes/
```

### 2. Full mode: core + visual app

Use this when you want the abstraction system plus the local browser-based project explorer.

```bash
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree serve
```

The full package depends on both:

```txt
@abstraction-tree/cli
@abstraction-tree/app
```

You can switch an existing workspace between modes without deleting `.abstraction-tree/`:

```bash
npx atree mode core
npx atree mode full
```

## Why this exists

Most codebases are understood through a mix of folders, stale documentation, tribal memory, and Git history. Coding agents face the same problem, but worse: they often lack a durable, compressed, project-level memory of what should exist and what must not be changed.

Abstraction Tree creates a shared semantic map for humans and agents. The node schema is fixed, but the abstraction layers should become adaptive: a frontend, compiler, game engine, Kubernetes operator, and quant research repo should not be forced into the same hierarchy.

Today, the baseline tree is deterministic. It uses folder structure, package layout, file names, AST-backed TypeScript/JavaScript imports and symbols, regex fallback scanning for other languages, tests, and configured ontology data. The first layer is an inferred human subsystem layer, so a repo with UI evidence may show an app/explorer node while a library, engine, docs-only tool, or service repo gets different evidence-backed subsystem nodes. Optional proposal adapters can use those facts through `atree propose`, but that path produces review artifacts rather than direct memory edits.

```txt
Intent
|-- Human subsystem nodes inferred from repo evidence
|   |-- App / Explorer, if UI evidence exists
|   |   `-- Responsibility slices
|   |       `-- File leaves
|   `-- Core Engine, CLI, Logs, Docs, Tests, or other detected responsibilities
`-- Project Indexes
    |-- Domain Concepts
    |-- Architecture
    `-- Modules / Files
```

The visual app is not a separate documentation site. It is the human-readable interface to the same `.abstraction-tree/` data consumed by agents.

In practice, the stored tree is shaped by `.abstraction-tree/ontology.json` and by deterministic subsystem inference, so the displayed labels might be "Visual App / Explorer" for this repo, "Backtesting Engine" for a quant repo, "Rendering Pipeline" for a game, or no app node at all when there is no app evidence.

## MVP status

This repository is a working starter implementation. It includes:

- a Node/TypeScript CLI;
- an AST-backed scanner for TypeScript/JavaScript files, with regex fallback for other supported text files;
- a deterministic ontology and initial tree builder with evidence-backed human subsystems and repo-specific concept extraction;
- a local `.abstraction-tree/` schema;
- validation and stale-memory drift checks;
- relevance-scored context-pack generation for coding agents;
- Mermaid and Graphviz DOT export for generated tree memory;
- an optional Vite/React visual app;
- ChatGPT/human assessment packs for strategic review;
- an explicit `atree propose` review workflow for provider adapters;
- a mission runner for bounded Codex work queues;
- a deterministic prompt router for direct, goal-driven, assessment-pack, and manual-review decisions;
- a goal-driven mission planner for complex user prompts;
- an experimental local dogfooding loop for assisted repository maintenance;
- Codex/agent instructions;
- an example project.

LLM inference is not part of the default scan pipeline. The repo includes an explicit `atree propose` review workflow for provider adapters, but proposals are validated and saved for review rather than directly mutating canonical memory.

## Repository layout

```txt
abstraction-tree/
  packages/
    core/              # schema, scan, tree build, context pack, validation
    cli/               # core-only CLI package: @abstraction-tree/cli
    app/               # optional browser UI package: @abstraction-tree/app
    full/              # full install package: abstraction-tree
  adapters/
    codex/             # instructions for Codex-style agents
  examples/
    small-web-app/     # sample project to test the scanner and app
  docs/
    ARCHITECTURE.md
    DATA_MODEL.md
    AGENT_PROTOCOL.md
    MISSION_RUNNER.md
    GOAL_DRIVEN_AUTOPILOT.md
    FULL_SELF_IMPROVEMENT_LOOP.md
    ROADMAP.md
    PACKAGING.md
```

## Install for development

```bash
npm install
npm run build
```

Run the CLI from this repo:

```bash
npm run atree -- init --with-app --project examples/small-web-app
npm run atree -- scan --project examples/small-web-app
npm run atree -- doctor --project examples/small-web-app
npm run atree -- validate --project examples/small-web-app
npm run atree -- context --project examples/small-web-app --target checkout
npm run atree -- export --project examples/small-web-app --format mermaid --output docs/tree.mmd
npm run atree -- serve --project examples/small-web-app
```

## Codex adoption checklist

When Codex or another coding agent is asked to add Abstraction Tree to a project, first decide whether the task is changing this repository or adopting this tool inside a separate target project. Do not infer the target from the cloned `abstraction-tree` checkout. Use the user's workspace, explicit path, or current project context as the target.

For a separate target project:

- Run the CLI from this repository if needed, but always pass the target path with `--project /absolute/path/to/target`.
- Start with `atree init --core` or `atree init --with-app` in the target project. This creates blank project-local memory.
- Run `atree scan --project /absolute/path/to/target` so the target's own files generate `tree.json`, `files.json`, concepts, invariants, and changes.
- Never copy this repository's root `.abstraction-tree/` folder into the target. It is committed dogfooding memory for `abstraction-tree` only.
- Never serve this repository unless the task is explicitly dogfooding or developing Abstraction Tree itself.
- Run `atree doctor --project /absolute/path/to/target` and confirm the project name, file count, node count, and `Self dogfooding memory: not detected`.
- If scanning hits generated artifacts, dependency bundles, release folders, caches, or permission errors, add target-specific ignores to the target `.abstraction-tree/config.json` and scan again. Do not work around the problem by copying memory from this repo.
- When starting the visual app, read the `atree serve` startup summary. The printed project name and root must match the target before opening or reloading the browser.
- Quote paths with spaces carefully. On Windows PowerShell, prefer quoted arguments such as `--project 'C:\Users\Sam\Documents\corr matrix test'`.
- If a target already has suspicious memory, inspect it first. Delete generated `.abstraction-tree` memory only when it is clearly stale or contaminated and the user has asked for cleanup.

## Canonical example fixture

`examples/small-web-app` is the canonical integration fixture for scanner, tree, context-pack, and validation changes. It stays intentionally small: `src/api/checkout.ts` coordinates cart, payment, and order services; `tests/checkout.test.js` verifies that collaboration and the service error paths; and `scripts/small-web-app-fixture.test.mjs` scans the example and asserts expected file summaries, concepts, context output, and validator results.

Root `npm test` includes both the example behavior tests and the scanner fixture script, so CI exercises the fixture after the packages are built.

## Dogfooding

This repository uses Abstraction Tree on itself. The root `.abstraction-tree/` folder is committed as project memory for the monorepo, and CI runs strict self-validation after build and tests.

```bash
npm run build
npm run atree:scan
npm run atree:validate
```

When core behavior, docs, packaging, or app structure changes, update the root abstraction memory in the same change.

CI also smoke tests the newer deterministic workflow surfaces: `atree:evaluate`, `atree doctor --strict`, `atree route`, `atree goal --auto-route --review-required`, scope contract creation, assessment-pack generation, and `self:loop --assessment-pack-only`. These checks do not invoke Codex, run mission execution, push, merge, or require secrets. `npm run coverage` already runs the full test suite through `scripts/run-tests.mjs`, so CI uses that single test pass instead of running `npm test` again.

The root `.abstraction-tree/` folder is dogfooding memory for this repository only. Published packages and `atree init` must never copy it into another project. A consumer project starts with a blank project-local workspace, then `atree scan` generates memory from that project's own files.

If a project is accidentally contaminated with this repo's dogfooding memory, delete the stale generated memory and scan again. On macOS/Linux:

```bash
rm -rf .abstraction-tree/files.json \
       .abstraction-tree/tree.json \
       .abstraction-tree/concepts.json \
       .abstraction-tree/invariants.json \
       .abstraction-tree/import-graph.json \
       .abstraction-tree/runs \
       .abstraction-tree/lessons \
       .abstraction-tree/evaluations \
       .abstraction-tree/goals
npx atree init --core
npx atree scan
```

On Windows PowerShell, delete `.abstraction-tree` if it contains only stale generated Abstraction Tree memory, then run:

```powershell
npx atree init --core
npx atree scan
```

### Committed memory and local runtime state

The committed `.abstraction-tree/` data is durable project memory. It includes:

- abstraction memory: `config.json`, `ontology.json`, `tree.json`, `files.json`, `concepts.json`, `invariants.json`, context packs, and change records;
- stable automation config: `.abstraction-tree/automation/loop-config.json` and example runtime templates;
- run reports in `.abstraction-tree/runs/`;
- reusable lessons in `.abstraction-tree/lessons/`;
- deterministic evaluation reports in `.abstraction-tree/evaluations/`.

The repo should not commit local runtime state. Keep these local or ignored:

- live loop counters such as `.abstraction-tree/automation/loop-runtime.json`;
- local mission runner state such as `.abstraction-tree/automation/mission-runtime.json`, `.abstraction-tree/automation/mission-logs/`, and `.abstraction-tree/mission-runs/`;
- full-loop live state such as `.abstraction-tree/automation/full-loop-live.pid` and `.abstraction-tree/automation/full-loop-runs/`;
- ChatGPT/human assessment packs under `.abstraction-tree/assessment-packs/`;
- local mission worktrees under `.abstraction-tree/worktrees/`;
- secrets, `.env` files, and API keys;
- local Codex state outside the project memory contract.

Runtime example files, including `.abstraction-tree/automation/mission-runtime.example.json`, stay committed so local state has a documented shape, but the live runtime JSON files and automation logs are ignored by `.gitignore`.

Mission folders follow two conventions:

- Manual mission folders: `.abstraction-tree/missions/`
- Automation-generated mission folders: `.abstraction-tree/automation/missions/`

`npm run missions:plan` and `npm run missions:run` use the automation-generated folder. `npm run missions:plan:manual` and `npm run missions:run:manual` use the manual folder.

Useful cross-platform dogfooding commands:

```bash
npm run assessment:pack
npm run assessment:pack -- --no-diff --no-runs --no-lessons --no-mission-runtime
npm run self:loop -- --assessment-pack-only
npm run assessment:import -- --from ./chatgpt-missions --name review-2026-05-10 --dry-run
npm run assessment:import -- --from ./chatgpt-missions --name review-2026-05-10
npm run missions:plan:manual
npm run missions:run:manual
npm run self:loop -- --skip-codex-assessment --missions .abstraction-tree/missions/review-2026-05-10 --allow-dirty
npm run atree:validate
npm run atree:evaluate
npm run diff:summary
```

`npm run assessment:pack` creates a local evidence pack for ChatGPT or human strategy review. It writes `pack-safety.json` and applies basic redaction and artifact size caps; use the `--no-*` flags when diff, run, lesson, or mission-runtime evidence is too sensitive or too large to export. `npm run self:loop -- --assessment-pack-only` creates the same style of evidence pack inside a full-loop run directory, prints the pack path, and exits before any Codex assessment, mission planning, mission execution, coherence review, or durable loop report. The reviewer authors the broad assessment and bounded mission files; `npm run assessment:import` validates and stages that folder under `.abstraction-tree/missions/<name>/`; `npm run missions:plan:manual` validates and batches the staged missions before `npm run missions:run:manual` sends those scoped prompts to Codex. Run `npm run atree:evaluate` afterward so narrative run reports are checked against objective project-memory signals.

Windows-only local loop commands:

```bash
npm run abstraction:loop:windows
npm run abstraction:loop:visible:windows
npm run codex:missions:windows
```

### Experimental local dogfooding loop contract

`npm run abstraction:loop:windows` runs a bounded local Codex improvement loop. It is Windows PowerShell automation around local Codex state, not a public CI entrypoint. It reads the stable loop config and prompt, starts a Codex cycle, runs post-loop checks, updates ignored runtime counters, and can optionally auto-commit only when configured and when required checks pass.

`npm run self:loop` runs an experimental local dogfooding loop that authors missions, invokes the mission runner, and performs a read-only coherence review. It is structured assistance for repository maintenance, not proof of autonomous correctness and not the recommended strategic default. Prefer `assessment:pack` plus ChatGPT/human mission design for broad repository assessment. The mission runner and full loop both reject `--sandbox danger-full-access` unless `--allow-danger-full-access` is also passed, including dry runs, so elevated sandbox access is always explicit.

Use `npm run self:loop -- --assessment-pack-only` when you want full-loop-local assessment evidence but no Codex invocation. It creates a full-loop run directory and assessment pack, prints the pack path, and stops before assessment spawning, mission planning, mission execution, post-run context, coherence review, and durable report writing.

To reuse an imported ChatGPT/human-authored mission folder while keeping the full-loop evidence, coherence review, change review, and durable report stages, pass `--skip-codex-assessment --missions <folder>`. That mode requires an explicit mission folder, skips the Codex assessment prompt and assessment spawn, and labels the run artifacts as externally authored.

Generated full-loop missions must declare a value category: `product-value`, `safety`, `quality`, `developer-experience`, or `automation-maintenance`. The loop rejects more than one `automation-maintenance` mission by default so process upkeep cannot crowd out product value, safety, quality, or developer experience; `--allow-multiple-automation-maintenance` is the explicit attended override.

The loop does not push to a remote, does not bypass failed checks, does not make unbounded changes, does not commit ignored runtime state, and does not turn LLM-inferred abstraction into default scanner behavior.

The loop is bounded because agent-assisted coding work needs explicit stop conditions. The config limits daily loops, elapsed minutes, failed loops, stagnation, repeated test failures, and maximum diff size so a bad prompt or failing change cannot run indefinitely.

Run reports are useful but subjective. Objective metrics from `npm run atree:evaluate` are needed as a second signal: they count tree shape, drift, missing ownership, run outcomes, duplicate lesson candidates, context-pack breadth, and automation config health.

Generated scan change records can accumulate during local dogfooding loops. `npm run atree -- changes review --project .` prints a non-destructive report that keeps the newest generated scan record as the retained baseline and lists older generated scan records that are eligible for consolidation.

Current limitation: the deterministic MVP is implemented. LLM-inferred abstraction is not default behavior. `atree propose` can validate and save adapter proposals for review, but accepted proposal changes are still applied deliberately rather than by the default scanner. No provider adapter is wired into `scan`, `validate`, `context`, `evaluate`, or `serve`.

## CLI commands

### `atree init`

Creates a blank `.abstraction-tree/` workspace inside the target project. It writes project-local `config.json` plus empty `changes/` and `context-packs/` folders. It does not copy this repository's dogfooding memory, run reports, lessons, evaluations, goals, automation config, tree, files, concepts, or invariants.

```bash
atree init --core --project /path/to/project
atree init --with-app --project /path/to/project
```

### `atree mode`

Switches the workspace mode.

```bash
atree mode core --project /path/to/project
atree mode full --project /path/to/project
```

### `atree scan`

Scans project files and creates/updates:

```txt
.abstraction-tree/files.json
.abstraction-tree/ontology.json
.abstraction-tree/tree.json
.abstraction-tree/concepts.json
.abstraction-tree/invariants.json
.abstraction-tree/changes/
```

Supported files are intentionally bounded. The scanner skips ignored paths, unsupported extensions, files larger than 512,000 bytes, and likely binary files.

| Parse strategy | Extensions |
| --- | --- |
| TypeScript compiler AST | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` |
| Regex text scan | `.py`, `.go`, `.rs`, `.cpp`, `.hpp`, `.c`, `.h`, `.cs`, `.java`, `.vue`, `.svelte`, `.json`, `.yaml`, `.yml`, `.md`, `.mdx`, `.toml`, `.sh`, `.ps1`, `.html`, `.css`, `.scss`, `.sql` |

Test files are recognized through common paths and language conventions: `test`, `tests`, `spec`, and `__tests__` directories; `.test` and `.spec` basenames for JavaScript and TypeScript-family files; `test_*.py` and `*_test.py` for Python; and `*_test.go` for Go.

```bash
atree scan --project /path/to/project
```

### `atree doctor`

Aggregates setup and readiness checks for humans and CI. Use it when you want to know whether the current repo is initialized, scanned, schema-valid, drift-free, automation-boundary-safe, and ready for the next command.

```bash
atree doctor --project /path/to/project
atree doctor --project /path/to/project --json
atree doctor --project /path/to/project --strict
```

`doctor` summarizes Node version support, config and memory-file presence, runtime schema issues, validation issue counts, automation runtime-boundary warnings, visual-app availability in full mode, and a suggested next command. `--json` returns a stable `{ status, checks, nextSteps }` payload for CI. `--strict` exits nonzero when the report has warnings or errors.

### `atree serve`

Starts the local visual app. This requires the full install package or a built `@abstraction-tree/app` workspace. The server binds to `127.0.0.1` by default so `/api/state` stays local to your machine.

```bash
atree serve --project /path/to/project --port 4317
```

At startup, `serve` prints the resolved project root, project name, memory counts, and warnings for unscanned memory or accidental serving of this repository's dogfooding memory. Check those lines when replacing an existing preview; the browser should show the same project name as the startup summary.

Use `--host 0.0.0.0` only when you intentionally want LAN access; the CLI prints a risk warning for wildcard or non-loopback hosts.

### `atree validate`

Checks whether tracked files and tree nodes still align, then compares stored file summaries against a fresh scan to detect stale abstraction memory. Use `validate` as the focused correctness gate after `doctor` has confirmed the workspace is initialized and memory files exist.

```bash
atree validate --project /path/to/project
```

### `atree context`

Builds a compact context pack for coding agents.

```bash
atree context --project /path/to/project --target checkout
```

### `atree export`

Renders generated tree memory as a Mermaid or Graphviz DOT diagram. This command reads `.abstraction-tree/tree.json` and does not rescan or mutate canonical memory.

```bash
atree export --project /path/to/project --format mermaid
atree export --project /path/to/project --format dot --direction LR --output docs/tree.dot
atree export --project /path/to/project --format mermaid --with-summaries --output docs/tree.mmd
```

### `atree changes review`

Prints a read-only JSON report for `.abstraction-tree/changes/`, including generated scan records that are older than the newest scan and are therefore candidates for consolidation.

```bash
atree changes review --project /path/to/project
```

Use `--summary` for a compact count-only report before deciding whether the full candidate list is needed:

```bash
atree changes review --project /path/to/project --summary
```

Use `--limit <n>` to inspect only the first generated scan candidates while keeping total counts in the report:

```bash
atree changes review --project /path/to/project --limit 5
```

### `atree propose`

Runs an explicit provider adapter proposal workflow. It validates proposed ontology and tree changes, writes a review artifact under `.abstraction-tree/proposals/`, and does not directly mutate canonical memory.

```bash
atree propose --provider local-json --adapter adapters/local-json/index.mjs --input adapters/local-json/proposal.example.json
```

## The `.abstraction-tree/` folder

When added to a project, Abstraction Tree creates:

```txt
.abstraction-tree/
  config.json
  ontology.json
  tree.json
  files.json
  concepts.json
  invariants.json
  context-packs/
  changes/
```

This folder should usually be committed to Git. It is the durable semantic memory of the project.

## Design principle

The developer should not have to change prompting style.

They can still ask normally:

> Add coupon support.

The agent adapter should internally expand that into:

```txt
Relevant nodes:
- Product / Pricing
- Backend / Checkout
- Data / Coupon Rules
- Frontend / Checkout UI

Constraints:
- Preserve payment authorization invariant.
- Do not rewrite unrelated authentication code.
- Update the abstraction tree after the change.
```

## License

MIT
