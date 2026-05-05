# Architecture

Abstraction Tree has three layers.

## 1. Core engine

The core engine is responsible for a deterministic project-understanding baseline:

- scan files;
- extract imports, exports, symbols, tests, and basic summaries;
- infer a project-specific abstraction ontology;
- build an initial abstraction tree using that ontology;
- infer concepts from path, symbol, and export signals;
- validate drift;
- generate relevance-scored context packs for agents.

The core should remain independent from a specific editor, LLM provider, or UI framework.

The current scanner uses the TypeScript compiler AST for TypeScript, TSX, JavaScript, and JSX files, with regex fallback scanning for other supported text languages. This gives the baseline better import/export/symbol facts without pretending to infer full behavioral meaning.

The deterministic concept pass is repo-specific rather than a fixed keyword list. It scores candidate concepts from file paths, exported names, and symbols, then connects them back to owning nodes and related files.

Context packs use the same facts to rank nodes, concepts, files, and invariants. A target can match through concept summaries, symbols, exports, ownership, or file paths instead of only exact node text.

The protocol is fixed, but the abstraction layers are not. Every tree node follows the same machine-readable schema, while level names come from repository inspection today and should be refined by LLM abstraction providers later. A small web app may produce product, domain, UI runtime, package, and component/file layers; a quant repo may instead produce research objective, data universe, feature engineering, backtesting, portfolio, and reporting layers when an LLM builder is available.

## LLM abstraction interface

The core package exposes a provider-neutral `LlmAbstractionBuilder` interface for future ontology proposals, tree proposals, and change classification. The interface accepts scanner output, existing ontology and tree memory, documentation summaries, prior run reports, and detected changes; it returns proposed ontology/tree changes with confidence, rationale, warnings, and affected abstraction layers.

The current system remains deterministic by default. The CLI does not call an LLM builder during `scan`, `validate`, `context`, `evaluate`, or `serve`, and the included placeholder returns deterministic no-op proposals when no provider adapter is supplied.

Provider adapters should live outside the core deterministic pipeline. They may implement the interface, but their proposals must be validated against schema, invariants, drift checks, and human or policy review before they become `.abstraction-tree/` memory.

## Repository memory contract

The `.abstraction-tree/` directory is the project-local memory boundary. Committed memory includes the abstraction baseline, stable automation config, change records, context packs, run reports, lessons, and deterministic evaluations. These artifacts let future agents inspect what the repo believes about itself and what previous loops actually changed.

Local runtime state is outside that contract. Live counters, loop state, mission state, logs, secrets, and local Codex state must stay ignored. The stable config describes the guardrails; ignored runtime files record only what happened on one machine during one loop.

The scanner also ignores `.abstraction-tree/` as source input. That keeps generated memory from recursively becoming part of the codebase model, while still allowing run reports, lessons, and evaluations to be committed as operational memory.

## Automation and metrics

The autonomous loop is an orchestration layer around Codex, npm scripts, validation, and runtime guards. From this repo, the key commands are:

```bash
npm run abstraction:loop
npm run atree:validate
npm run atree:evaluate
npm run diff:summary
```

The loop reads `.abstraction-tree/automation/loop-config.json`, runs bounded Codex cycles, executes post-loop checks, updates ignored runtime counters, and stops when configured limits are reached. It does not push to remote, does not ignore failed checks, does not commit live runtime files, and does not replace the deterministic scanner with LLM inference.

The loop is bounded by design: maximum loops, minutes, failures, stagnation, repeated test failures, and diff size prevent unattended work from expanding past a measurable envelope.

Run reports remain useful narrative evidence, but they are not enough. `atree:evaluate` produces objective counters for drift, missing files, tree shape, run results, duplicate lesson candidates, context-pack breadth, and automation health. `diff:summary` adds a second boundedness signal by summarizing the current working-tree size and risk.

## 2. CLI

The CLI is the main integration surface. It is published as the core-only package `@abstraction-tree/cli`:

```bash
atree init --core
atree scan
atree validate
atree context --target checkout
atree serve
```

It is designed to run inside any existing repo.

## 3. Optional visual app

The visual app is published separately as `@abstraction-tree/app`. The full package `abstraction-tree` installs both the CLI and the app.

The visual app is the human-readable interface to `.abstraction-tree/`.

It shows:

- abstraction hierarchy;
- file ownership;
- concepts;
- invariants;
- semantic change history;
- context packs;
- drift warnings.

The browser app is local-first. It is served by the CLI and reads local project state through a local API. Projects that only install `@abstraction-tree/cli` can still scan, validate, and produce agent context packs without installing the UI.

## Future layers

- LLM abstraction provider adapters that implement the core interface without changing deterministic defaults;
- Git diff based semantic change records;
- VS Code/Cursor extension;
- GitHub Action for PR drift checks;
- Tauri desktop wrapper;
- Tree-sitter based multi-language symbol extraction beyond the current JS/TS AST path.
