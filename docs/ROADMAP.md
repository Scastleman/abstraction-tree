# Roadmap

## MVP

- CLI workspace initialization.
- File scanner.
- AST-backed TypeScript/JavaScript import, export, and symbol extraction.
- Deterministic initial tree builder.
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

## Current operational boundary

The deterministic MVP is the current default. It scans files, builds memory, validates drift, generates context packs, evaluates objective metrics, and summarizes diffs without requiring an API key.

LLM-inferred abstraction is not default behavior. This checkout includes the adapter-ready interface and the explicit `atree propose` review workflow for provider implementations, but `scan`, `validate`, `context`, `evaluate`, and `serve` do not call an LLM provider.

Committed `.abstraction-tree/` memory should include abstraction data, stable automation config, run reports, lessons, and evaluations. Local runtime counters, mission state, secrets, logs, and local Codex state should stay uncommitted.

The autonomous loop should remain bounded by loop count, elapsed time, failed loops, stagnation, repeated test failures, and diff size. Objective metrics should continue to accompany self-reported run results so future agents can see whether the tree, drift state, context packs, and automation health improved.

Generated-memory quality fixtures live in example projects under `.abstraction-tree/evaluation-fixture.json`. They list expected tree nodes, architecture nodes, concepts, invariants, and context-pack inclusions for compact projects whose generated memory should stay semantically useful. When scanner, import-graph, tree-builder, concept, or context behavior intentionally changes, update the relevant fixture expectations to describe the new durable behavior rather than copying full generated JSON snapshots. Then run `npm run build`, `node scripts/generated-memory-fixtures.test.mjs`, and `npm test` to confirm the fixture quality metrics still pass.

`atree evaluate` includes generated-memory quality signals alongside structural counters: noisy concepts, missing fixture expectations when a fixture is present, unresolved imports, architecture coverage, and missing expected context inclusions. Treat those signals as regression indicators for stable fixtures, not proof of objective semantic correctness across arbitrary repositories.

## Version 0.2

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
- Drift detection against Git diffs.
- VS Code/Cursor panel.
- Tauri desktop packaging.

## Version 1.0

- Stable schema.
- Plugin system.
- Multi-repo workspaces.
- Team workflows.
- Agent adapter standard.
