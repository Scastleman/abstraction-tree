# Roadmap

> Audience: Maintainers and contributors
> Status: Planning document
> Read after: STABLE_VS_EXPERIMENTAL.md.

## Implemented

- CLI workspace initialization with blank project-local memory.
- Deterministic scanner with TypeScript/JavaScript AST facts and regex fallback for other supported text files.
- Deterministic abstraction tree with evidence-backed human subsystem nodes, responsibility slices, file leaves, node explanations, reasons for existence, and separation logic.
- Repo-specific concept inference from paths, symbols, and exports.
- Context pack generation, validation, stale-memory drift checks, and deterministic evaluation reports.
- Mermaid and Graphviz DOT export for generated tree memory.
- Optional local visual app with `atree serve --open`.
- Beginner Getting Started, Visual Demo, and Stable vs Experimental docs for v1 onboarding.
- Prompt routing with direct, goal-driven, assessment-pack, and manual-review decisions.
- Goal-driven mission planning that preserves the original prompt, maps affected tree nodes/files/concepts, writes mission folders, creates scope contracts, and prepares reports.
- Mission runner planning/execution with batching, sandbox gates, runtime tracking, and review artifacts.
- Scope contracts and scope checks against the current Git diff.
- Assessment packs for ChatGPT/human strategic review.
- CI smoke coverage for route, goal planning, scope, doctor, evaluation, assessment packs, and pack-only dogfooding evidence.
- Dogfooding-memory boundary checks so external projects do not inherit this repo's `.abstraction-tree/`.
- Provider-neutral LLM proposal interface and explicit `atree propose` review artifacts.
- Schema migration planning with `atree migrate`.
- Experimental repo-maintenance dogfooding loop for this repository.
- Root repository dogfooding through committed `.abstraction-tree/` memory and CI validation.
- Agent instructions for bounded Codex execution.
- Test coverage for scan, validation, routing, goal planning, scope, export, serve, packaging, and mission-runner behavior.

## Current Limitations

- The default scan path is deterministic; it does not infer full semantic architecture with an LLM.
- `atree goal --run` and `--full-auto` currently refuse execution after planning until runner integration can preserve the same guardrails as manual mission execution.
- Prompt routing and affected-tree mapping use heuristics and project memory, not perfect semantic understanding.
- Coherence review and goal scoring are deterministic first-pass artifacts.
- The visual app does not yet expose goal workspaces, mission plans, scope results, or coherence reviews as first-class views.
- Historical filenames such as `FULL_SELF_IMPROVEMENT_LOOP.md` and `scripts/run-full-self-improvement-loop.mjs` remain as compatibility entrypoints, but they are not the product framing.

## Next Priorities

1. Verify and keep docs/command references aligned with the actual CLI.
2. Integrate route -> goal -> mission runner -> scope check -> coherence review -> evaluation -> report into one smoother reviewable workflow.
3. Add deterministic post-mission goal coherence review that compares actual changed files, checks, scope results, and mission outcomes against the original prompt.
4. Improve router and goal planner behavior using feedback from executed missions.
5. Improve affected-tree mapping with better dependency, concept, invariant, and previous-change evidence.
6. Improve mission decomposition so complex prompts split into smaller, safer, dependency-aware missions.
7. Improve scope-contract accuracy and overreach reporting.
8. Add visual app support for goal workspaces, affected-tree maps, mission plans, scope checks, coherence reviews, and PR/report artifacts.
9. Improve PR body and final-report generation for reviewable Codex workflows.

## Later Ideas

- Direct-task mission generation for simple routed prompts.
- Safe `atree goal --run` / `--full-auto` only after mission runner integration preserves batching, sandbox, scope-check, evaluation, and coherence guarantees.
- Production LLM provider adapters outside the core deterministic pipeline.
- Assisted application workflow for human-approved adapter proposal artifacts.
- Tree-sitter symbol extraction for additional languages.
- Import graph resolution by language.
- Better concept clustering.
- Git diff based semantic change records.
- Markdown/YAML output options.
- PR review mode.
- VS Code/Cursor panel.
- Tauri desktop packaging.

Experimental repo-maintenance dogfooding loops, continuous optimization, and any auto-running or auto-merge behavior remain lower priority than the reviewable complex prompt workflow.
