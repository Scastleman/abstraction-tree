# Abstraction Tree

Abstraction Tree is a local-first codebase understanding system. It scans an existing software project, builds a hierarchical abstraction tree from high-level intent down to files and symbols, and gives both humans and coding agents a shared semantic map of the codebase.

The source of truth is always the project-local `.abstraction-tree/` folder. The visual app is optional: it reads the same tree data and displays it as an interactive project map.

## Core promise

Add Abstraction Tree to any repo, build the initial tree, and make the project easier to understand, prompt, and safely change.

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
- drift between code and tree memory;
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

Abstraction Tree creates a shared semantic map for humans and agents.

```txt
Intent
└── Product / Domain Concepts
    └── Architecture
        └── Modules
            └── Files
                └── Symbols
```

The visual app is not a separate documentation site. It is the human-readable interface to the same `.abstraction-tree/` data consumed by agents.

## MVP status

This repository is a working starter implementation. It includes:

- a Node/TypeScript CLI;
- a scanner for files, imports, symbols, and basic tests;
- a deterministic initial tree builder;
- a local `.abstraction-tree/` schema;
- validation and drift checks;
- context-pack generation for coding agents;
- an optional Vite/React visual app;
- Codex/agent instructions;
- an example project.

The LLM abstraction pass is intentionally adapter-based. The current implementation builds a deterministic first tree without requiring an API key. LLM providers can be added through the adapter interface.

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
.abstraction-tree/tree.json
.abstraction-tree/concepts.json
.abstraction-tree/invariants.json
.abstraction-tree/changes/
```

```bash
atree scan --project /path/to/project
```

### `atree serve`

Starts the local visual app. This requires the full install package or a built `@abstraction-tree/app` workspace.

```bash
atree serve --project /path/to/project --port 4317
```

### `atree validate`

Checks whether tracked files and tree nodes still align.

```bash
atree validate --project /path/to/project
```

### `atree context`

Builds a compact context pack for coding agents.

```bash
atree context --project /path/to/project --target checkout
```

## The `.abstraction-tree/` folder

When added to a project, Abstraction Tree creates:

```txt
.abstraction-tree/
  config.json
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
