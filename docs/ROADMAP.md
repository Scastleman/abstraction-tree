# Roadmap

## MVP

- CLI workspace initialization.
- File scanner.
- AST-backed TypeScript/JavaScript import, export, and symbol extraction.
- Deterministic initial tree builder.
- Human-readable node explanations generated from deterministic scanner facts.
- Separation logic that describes how parent nodes partition their child nodes.
- Repo-specific concept inference from paths, symbols, and exports.
- Visual app served locally.
- Relevance-scored context pack generation.
- Basic validation and stale-memory drift detection.
- Test coverage for scan and validation behavior.
- Root repository dogfooding through committed `.abstraction-tree/` memory and CI validation.
- Agent instructions.
- Provider-neutral LLM abstraction interface with deterministic no-op behavior when no adapter is configured.
- Explicit `atree propose` review artifacts for provider adapters, with validation before review and no direct canonical memory mutation.
- Stable automation config, bounded loop scripts, run reports, lessons, and deterministic evaluation reports as committed self-dogfooding memory.
- Schema migration planning and `atree migrate` for committed `.abstraction-tree/` memory.
- Goal-driven autopilot planning through `atree goal`, which stores the original prompt, maps it to abstraction memory, writes a mission folder, and keeps execution review-gated.
- Prompt routing through `atree route`, which classifies prompts as direct, goal-driven, assessment-pack, or manual-review before any Codex execution.

## Current operational boundary

The deterministic MVP is the current default. It scans files, builds memory, validates drift, generates context packs, evaluates objective metrics, and summarizes diffs without requiring an API key.

Tree nodes now distinguish compact `summary` text from richer `explanation` text and optional `separationLogic` text. Deterministic explanations make the tree more useful as a human project guide and as an agent overreach-control surface. Separation logic describes how a parent partitions its children, making child boundaries more legible before an agent chooses scope. Future LLM adapters can propose higher-quality descriptions through review workflows.

LLM-inferred abstraction is not default behavior. This checkout includes the adapter-ready interface and the explicit `atree propose` review workflow for provider implementations, but `scan`, `validate`, `context`, `evaluate`, and `serve` do not call an LLM provider.

Committed `.abstraction-tree/` memory should include abstraction data, stable automation config, run reports, lessons, and evaluations. Local runtime counters, mission state, secrets, logs, and local Codex state should stay uncommitted.

The autonomous loop should remain bounded by loop count, elapsed time, failed loops, stagnation, repeated test failures, and diff size. Objective metrics should continue to accompany self-reported run results so future agents can see whether the tree, drift state, context packs, and automation health improved.

Prompt routing is distinct from both repository self-improvement and goal-driven autopilot. The router is a read-only classifier: simple prompts route to direct execution, complex implementation prompts route to goal-driven autopilot, broad strategy prompts route to assessment packs, and risky prompts route to manual review.

Goal-driven autopilot is distinct from repository self-improvement. The self-improvement loop starts from repo state and asks what should improve next. The goal-driven loop starts from a user goal plus repo state, then generates a deterministic assessment, affected-tree mapping, mission plan, coherence placeholder, and final report under `.abstraction-tree/goals/`. Its current execution boundary is review-required planning; `--full-auto` refuses until mission execution can be safely delegated without weakening runner guardrails.

Generated-memory quality fixtures live in example projects under `.abstraction-tree/evaluation-fixture.json`. They list expected tree nodes, architecture nodes, concepts, invariants, and context-pack inclusions for compact projects whose generated memory should stay semantically useful. When scanner, import-graph, tree-builder, concept, or context behavior intentionally changes, update the relevant fixture expectations to describe the new durable behavior rather than copying full generated JSON snapshots. Then run `npm run build`, `node scripts/generated-memory-fixtures.test.mjs`, and `npm test` to confirm the fixture quality metrics still pass.

`atree evaluate` includes generated-memory quality signals alongside structural counters: noisy concepts, missing fixture expectations when a fixture is present, unresolved imports, architecture coverage, and missing expected context inclusions. Treat those signals as regression indicators for stable fixtures, not proof of objective semantic correctness across arbitrary repositories.

Evaluation also tracks explanation completeness with counts for missing explanations, thin explanations, and average explanation length. These are heuristics for tree readability, not proof of semantic quality.

## Version 0.2

- Add the first non-trivial schema migration only when the memory contract actually changes.
- Tree-sitter symbol extraction for additional languages.
- Import graph resolution by language.
- Better concept clustering.
- Mermaid/Graphviz export.
- Markdown/YAML output option.
- Git diff based semantic change records.
- Assisted application workflow for human-approved adapter proposal artifacts after existing `atree propose` validation.

## Version 0.3

- Production LLM provider adapters outside the core deterministic pipeline.
- PR review mode.
- Safe `atree goal --full-auto` execution once it can call the mission runner with equivalent review, batching, and coherence guarantees.
- Direct-task mission generation for `atree route` when the router classifies a prompt as simple.
- Drift detection against Git diffs.
- VS Code/Cursor panel.
- Tauri desktop packaging.

## Version 1.0

- Stable schema.
- Plugin system.
- Multi-repo workspaces.
- Team workflows.
- Agent adapter standard.
