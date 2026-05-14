# Architecture

> Audience: Implementers and maintainers
> Status: Current architecture reference
> Read after: GETTING_STARTED.md for the user path or DATA_MODEL.md for memory details.

Abstraction Tree has three product layers around a core workflow: map a complex prompt onto project memory, decompose it into bounded missions, guide Codex execution, and review the result against scope, coherence, and evaluation signals.

## 1. Core engine

The core engine is responsible for a deterministic project-understanding baseline:

- scan files;
- extract imports, exports, symbols, tests, and basic summaries;
- infer a project-specific abstraction ontology;
- build an initial abstraction tree using that ontology and evidence-backed human subsystems;
- generate human-readable node explanations and reasons for existence from deterministic scanner facts;
- infer concepts from path, symbol, and export signals;
- validate drift;
- generate relevance-scored context packs for agents;
- render generated tree memory as Mermaid or Graphviz DOT diagrams.

The core should remain independent from a specific editor, LLM provider, or UI framework.

The current scanner uses the TypeScript compiler AST for TypeScript and JavaScript-family files, with regex fallback scanning for other supported text languages. This gives the baseline better import/export/symbol facts without pretending to infer full behavioral meaning.

Supported scanner inputs are deterministic and bounded:

| Parse strategy | Extensions |
| --- | --- |
| TypeScript compiler AST | `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs` |
| Regex text scan | `.py`, `.go`, `.rs`, `.cpp`, `.hpp`, `.c`, `.h`, `.cs`, `.java`, `.vue`, `.svelte`, `.json`, `.yaml`, `.yml`, `.md`, `.mdx`, `.toml`, `.sh`, `.ps1`, `.html`, `.css`, `.scss`, `.sql` |

Test detection is path- and language-convention based: files under `test`, `tests`, `spec`, or `__tests__` directories are tests; JavaScript and TypeScript-family files also recognize `.test` and `.spec` basenames; Python recognizes `test_*.py` and `*_test.py`; Go recognizes `*_test.go`.

The scanner skips ignored paths, unsupported extensions, files larger than 512,000 bytes, and files whose byte sample looks binary. It does not use tree-sitter or any language parser beyond the TypeScript compiler AST path.

The deterministic concept pass is repo-specific rather than a fixed keyword list. It scores candidate concepts from file paths, exported names, and symbols, then connects them back to owning nodes and related files.

The deterministic subsystem pass adds first-level human navigation nodes beneath `project.intent`. It looks for evidence such as UI packages, core engines, CLI/API surfaces, goal or mission automation, memory/validation/log helpers, documentation/examples, packaging/adapters, and tests/quality gates. It only creates a subsystem when there is matching evidence; a repo without an app should not get an app node. If no strong subsystem pattern exists, it falls back to top-level repository areas as a conservative first-pass human boundary. Subsystems then decompose into responsibility slices and file leaves so a large branch like Visual App / Explorer does not stop before concrete editable files.

The deterministic architecture pass adds a runtime/dataflow layer beneath `project.architecture`. It uses package manifests, npm workspace metadata, bin commands, package entrypoints, UI file paths, API/route paths, server imports, and the resolved import graph to create evidence-backed nodes such as CLI surface, core engine, scanner/tree/context pipeline, visual app API, visual app UI, runtime dataflow, and package distribution.

The architecture pass is intentionally evidence-limited. It can identify runtime boundaries that are visible in manifests, paths, imports, and local package metadata, but it does not infer hidden business semantics, dynamic routes assembled at runtime, bundler aliases not represented in the import graph, environment-specific deployment topology, or complete user journeys. When the evidence is broad, architecture nodes should be read as deterministic ownership and dependency groupings rather than a complete design document.

Generated tree nodes expose `summary` for compact labels, `explanation` for human-readable comprehension, `reasonForExistence` for why the node deserves to exist, and `separationLogic` to describe the partition rule for a parent node's children. Explanations and existence reasons are template-driven from available evidence: node type, parent/children, owned files, scanner symbols, imports, exports, related concepts, dependency refs, and invariants. Separation logic names the child-boundary rule, such as human subsystem ownership, subsystem responsibility slices, support-index style, concept clustering, architecture surface separation, module ownership, or file-level edit control. They are useful project guides, but they should still be read as deterministic evidence summaries rather than LLM-quality design analysis.

Context packs use the same facts to rank nodes, concepts, files, and invariants. A target can match through node explanations, concept summaries, symbols, exports, ownership, or file paths instead of only exact node text.

The protocol is fixed, but the abstraction layers are not. Every tree node follows the same machine-readable schema, while level names come from repository inspection today and should be refined by LLM abstraction providers later. A small web app may produce app, API, domain, runtime, package, and component/file layers; a quant repo may instead produce research objective, data universe, feature engineering, backtesting, portfolio, and reporting layers when an LLM builder is available.

## LLM abstraction interface

The core package exposes a provider-neutral `LlmAbstractionBuilder` interface for future ontology proposals, tree proposals, and change classification. The interface accepts scanner output, existing ontology and tree memory, documentation summaries, prior run reports, and detected changes; it returns proposed ontology/tree changes with confidence, rationale, warnings, and affected abstraction layers.

The current system remains deterministic by default. The CLI does not call an LLM builder during `scan`, `validate`, `context`, `evaluate`, or `serve`, and the included placeholder returns deterministic no-op proposals when no provider adapter is supplied.

Provider adapters should live outside the core deterministic pipeline. They may implement the interface, but their proposals must be validated against schema, invariants, drift checks, and human or policy review before they become `.abstraction-tree/` memory.

The first explicit opt-in adapter path is the `atree propose` command. It requires a provider name and either an adapter module path or a checkout-local `adapters/<provider>/index.mjs` module:

```bash
atree propose --provider local-json --adapter adapters/local-json/index.mjs --input adapters/local-json/proposal.example.json
```

`atree propose` scans the current project for provider context, calls only the explicitly selected adapter, validates proposed ontology and tree changes with the existing runtime and tree validators, and writes a review artifact under `.abstraction-tree/proposals/`. It does not update `.abstraction-tree/ontology.json`, `.abstraction-tree/tree.json`, or other canonical memory. Validation errors block the proposal record for application, and destructive remove proposals require separate human approval.

The `local-json` adapter is a reference adapter for captured provider output. It lets a team paste or export LLM-generated JSON into a file, run the same adapter contract and validators, and review the result without adding an API key or network dependency to deterministic MVP commands. Real provider adapters should follow the same contract: return proposals, never directly write memory, and let the review workflow decide whether a human applies the changes.

## Repository memory contract

The `.abstraction-tree/` directory is the project-local memory boundary. Committed memory includes the abstraction baseline, stable automation config, change records, context packs, run reports, lessons, and deterministic evaluations. These artifacts let future agents inspect what the repo believes about itself and what previous loops actually changed.

Local runtime state is outside that contract. Live counters, loop state, mission state, logs, secrets, and local Codex state must stay ignored. The stable config describes the guardrails; ignored runtime files record only what happened on one machine during one loop.

The scanner also ignores `.abstraction-tree/` as source input. That keeps generated memory from recursively becoming part of the codebase model, while still allowing run reports, lessons, and evaluations to be committed as operational memory.

## Prompt-to-mission workflow

Prompt routing, goal workspaces, scope contracts, mission folders, coherence reviews, and evaluation reports form the complex prompt implementation path. The CLI and scripts coordinate those artifacts so Codex receives bounded missions and humans receive reviewable evidence.

The visual app supports the human comprehension side of that workflow by showing the generated abstraction tree, node explanations, file ownership, concepts, invariants, and recent changes for the target project.

## Automation and metrics

The experimental local dogfooding loop is an orchestration layer around Codex, npm scripts, validation, and runtime guards. It supports structured assisted maintenance for this repository; it is not the main product workflow, does not guarantee correct changes, and does not replace human review. From this repo, the key commands are:

Cross-platform checks and metrics:

```bash
npm run build
npm test
npm run atree:validate
npm run atree:evaluate
npm run diff:summary
```

Windows-scoped local automation:

```bash
npm run abstraction:loop:windows
npm run abstraction:loop:visible:windows
npm run codex:missions:windows
```

The loop reads `.abstraction-tree/automation/loop-config.json`, runs bounded Codex cycles, executes post-loop checks, updates ignored runtime counters, and stops when configured limits are reached. It does not push to remote, does not ignore failed checks, does not commit live runtime files, and does not replace the deterministic scanner with LLM inference.

The loop is bounded by design: maximum loops, minutes, failures, stagnation, repeated test failures, and diff size prevent unattended work from expanding past a measurable envelope.

Public CI runs deterministic Node checks on Ubuntu. It does not invoke the Windows-scoped loop scripts and does not require ignored runtime JSON or log files.

Run reports remain useful narrative evidence, but they are not enough. `atree:evaluate` produces objective counters for drift, missing files, tree shape, run results, duplicate lesson candidates, context-pack breadth, and automation health. `diff:summary` adds a second boundedness signal by summarizing the current working-tree size and risk.

## 2. CLI

The CLI is the main integration surface. It is published as the core-only package `@abstraction-tree/cli`:

```bash
atree init --core
atree scan
atree validate
atree context --target checkout
atree export --format mermaid
atree serve --open
```

It is designed to run inside any existing repo.

## 3. Optional visual app

The visual app is published separately as `@abstraction-tree/app`. The full package `abstraction-tree` installs both the CLI and the app.

The visual app is the human-readable interface to `.abstraction-tree/`.

It shows:

- abstraction hierarchy;
- selected-node summaries and richer explanations;
- separation logic for child nodes;
- file ownership;
- concepts;
- invariants;
- semantic change history;
- context packs;
- drift warnings.

The browser app is local-first. It is served by the CLI and reads local project state through a local API. `atree serve` binds to `127.0.0.1` by default; LAN exposure requires an explicit non-loopback `--host` value and emits a warning because `/api/state` contains local project memory. `atree serve --open` is an explicit convenience flag that launches the default browser after startup; plain `atree serve` only prints the URL. Projects that only install `@abstraction-tree/cli` can still scan, validate, and produce agent context packs without installing the UI.

## Future layers

- LLM abstraction provider adapters that implement the core interface without changing deterministic defaults;
- Git diff based semantic change records;
- VS Code/Cursor extension;
- GitHub Action for PR drift checks;
- Tauri desktop wrapper;
- Tree-sitter based multi-language symbol extraction beyond the current JS/TS AST path.
