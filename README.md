# Abstraction Tree

[![CI](https://github.com/Scastleman/abstraction-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/Scastleman/abstraction-tree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![npm: abstraction-tree](https://img.shields.io/npm/v/abstraction-tree.svg?label=abstraction-tree)](https://www.npmjs.com/package/abstraction-tree)
[![npm: @abstraction-tree/cli](https://img.shields.io/npm/v/%40abstraction-tree%2Fcli.svg?label=%40abstraction-tree%2Fcli)](https://www.npmjs.com/package/@abstraction-tree/cli)

Abstraction Tree is a local-first codebase understanding system. It scans an existing software project, builds a deterministic abstraction-memory baseline, and gives both humans and coding agents a shared map of the codebase.

The long-term goal is adaptive, LLM-assisted abstraction memory. The current repo is intentionally the first layer: structured project facts, deterministic tree generation, validation, and agent context packs without requiring an API key.

The source of truth is always the project-local `.abstraction-tree/` folder. The visual app is optional: it reads the same tree data and displays it as an interactive project map.

## Core promise

Add Abstraction Tree to any repo, build the initial memory tree, and make the project easier to inspect, prompt, and safely change.

```bash
cd your-existing-project
npx atree init --with-app
npx atree scan
npx atree serve
```

The local visual app shows:

- project structure as an abstraction tree;
- concepts and cross-cutting dependencies;
- file ownership by tree node;
- inferred invariants;
- recent semantic changes;
- drift between current code and stored tree memory;
- context packs that coding agents can consume.

## Two install modes

Abstraction Tree is intentionally split into two adoption paths.

### 1. Core-only mode

Use this when you only want the abstraction tree, agent context packs, validation, and CI/script support. No visual app is required.

```bash
npm install -D @abstraction-tree/cli
npx atree init --core
npx atree scan
npx atree validate
npx atree context --target checkout
```

Core-only mode creates and maintains:

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

Today, the baseline tree is deterministic. It uses folder structure, package layout, file names, AST-backed TypeScript/JavaScript imports and symbols, regex fallback scanning for other languages, tests, and configured ontology data. The next semantic layer is an LLM abstraction pass that proposes repo-specific ontology and tree nodes from those facts.

```txt
Intent
`-- Product / Domain Concepts
    `-- Architecture
        `-- Modules
            `-- Files
                `-- Symbols
```

The visual app is not a separate documentation site. It is the human-readable interface to the same `.abstraction-tree/` data consumed by agents.

In practice, the stored tree is shaped by `.abstraction-tree/ontology.json`, so the displayed labels might be "Application / UI Runtime Layer" for one repo and "Backtesting Engine" or "Rendering Pipeline" for another.

## MVP status

This repository is a working starter implementation. It includes:

- a Node/TypeScript CLI;
- an AST-backed scanner for TypeScript/JavaScript files, with regex fallback for other supported text files;
- a deterministic ontology and initial tree builder with repo-specific concept extraction;
- a local `.abstraction-tree/` schema;
- validation and stale-memory drift checks;
- relevance-scored context-pack generation for coding agents;
- an optional Vite/React visual app;
- Codex/agent instructions;
- an example project.

The LLM abstraction pass is not implemented yet. The current implementation builds a deterministic first tree without requiring an API key; provider adapters are the next major intelligence layer.

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
npm run atree -- validate --project examples/small-web-app
npm run atree -- context --project examples/small-web-app --target checkout
npm run atree -- serve --project examples/small-web-app
```

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

### Committed memory and local runtime state

The committed `.abstraction-tree/` data is durable project memory. It includes:

- abstraction memory: `config.json`, `ontology.json`, `tree.json`, `files.json`, `concepts.json`, `invariants.json`, context packs, and change records;
- stable automation config: `.abstraction-tree/automation/loop-config.json` and example runtime templates;
- run reports in `.abstraction-tree/runs/`;
- reusable lessons in `.abstraction-tree/lessons/`;
- deterministic evaluation reports in `.abstraction-tree/evaluations/`.

The repo should not commit local runtime state. Keep these local or ignored:

- live loop counters such as `.abstraction-tree/automation/loop-runtime.json`;
- local mission runner state such as `.abstraction-tree/automation/mission-runtime.json` and mission logs;
- secrets, `.env` files, and API keys;
- local Codex state outside the project memory contract.

Runtime example files stay committed so local state has a documented shape, but the live runtime JSON files and automation logs are ignored by `.gitignore`.

Useful cross-platform dogfooding commands:

```bash
npm run atree:validate
npm run atree:evaluate
npm run diff:summary
```

Windows-only local loop commands:

```bash
npm run abstraction:loop:windows
npm run abstraction:loop:visible:windows
npm run codex:missions:windows
```

### Autonomous loop contract

`npm run abstraction:loop:windows` runs a bounded local Codex improvement loop. It is Windows PowerShell automation around local Codex state, not a public CI entrypoint. It reads the stable loop config and prompt, starts a Codex cycle, runs post-loop checks, updates ignored runtime counters, and can optionally auto-commit only when configured and when required checks pass.

The loop does not push to a remote, does not bypass failed checks, does not make unbounded changes, does not commit ignored runtime state, and does not turn LLM-inferred abstraction into default scanner behavior.

The loop is bounded because autonomous coding work needs explicit stop conditions. The config limits daily loops, elapsed minutes, failed loops, stagnation, repeated test failures, and maximum diff size so a bad prompt or failing change cannot run indefinitely.

Run reports are useful but subjective. Objective metrics from `npm run atree:evaluate` are needed as a second signal: they count tree shape, drift, missing ownership, run outcomes, duplicate lesson candidates, context-pack breadth, and automation config health.

Generated scan change records can accumulate during autonomous loops. `npm run atree -- changes review --project .` prints a non-destructive report that keeps the newest generated scan record as the retained baseline and lists older generated scan records that are eligible for consolidation.

Current limitation: the deterministic MVP is implemented. LLM-inferred abstraction is not default behavior yet. This checkout includes an adapter-ready LLM abstraction interface, but no provider adapter is wired into `scan`, `validate`, `context`, `evaluate`, or `serve`.

## CLI commands

### `atree init`

Creates the `.abstraction-tree/` workspace inside the target project.

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

### `atree serve`

Starts the local visual app. This requires the full install package or a built `@abstraction-tree/app` workspace. The server binds to `127.0.0.1` by default so `/api/state` stays local to your machine.

```bash
atree serve --project /path/to/project --port 4317
```

Use `--host 0.0.0.0` only when you intentionally want LAN access; the CLI prints a risk warning for wildcard or non-loopback hosts.

### `atree validate`

Checks whether tracked files and tree nodes still align, then compares stored file summaries against a fresh scan to detect stale abstraction memory.

```bash
atree validate --project /path/to/project
```

### `atree context`

Builds a compact context pack for coding agents.

```bash
atree context --project /path/to/project --target checkout
```

### `atree changes review`

Prints a read-only JSON report for `.abstraction-tree/changes/`, including generated scan records that are older than the newest scan and are therefore candidates for consolidation.

```bash
atree changes review --project /path/to/project
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
