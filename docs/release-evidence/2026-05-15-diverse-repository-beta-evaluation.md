# Diverse Repository Beta Evaluation

> Audience: Maintainers and release reviewers
> Status: Completed local beta evaluation with findings
> Date: 2026-05-15

## Summary

Result: partial pass.

The local `0.2.0-beta.1` CLI was built and run against five real-world repositories from different ecosystems. All five repositories initialized, scanned, validated, exported, generated context packs, routed sample prompts, and wrote evaluation reports. Four repositories passed every command. `rust-lang/book` produced a `doctor --strict` warning that appears to be a false positive in the self dogfooding memory detector.

This is internal beta evidence, not public external-user feedback. No GitHub issues were filed from this run because the mission was bounded to local execution; this document is the feedback record and contains specific bug reports and recommendations.

## Environment

| Item | Value |
| --- | --- |
| Date | 2026-05-15 |
| OS | Windows |
| Node.js | `v24.14.0` |
| Package version | `0.2.0-beta.1` local repo build |
| CLI | `node packages/cli/dist/index.js` |
| External workspace | `C:\Users\Sam\AppData\Local\Temp\atree-beta-diverse-20260515` |

The first direct PowerShell `npm run build` attempt was blocked by the host execution policy for `npm.ps1`. The build then passed via `npm.cmd run build`, matching the Windows workaround already captured in release-gate evidence.

## Workflow

Each repository was cloned with `git clone --depth 1`, then processed with:

```bash
node packages/cli/dist/index.js init --core --project <repo>
node packages/cli/dist/index.js scan --project <repo>
node packages/cli/dist/index.js doctor --project <repo> --strict
node packages/cli/dist/index.js validate --project <repo> --strict
node packages/cli/dist/index.js export --project <repo> --format mermaid --output <repo>/.abstraction-tree/tree.mmd
node packages/cli/dist/index.js context --project <repo> --target <target> --format json --why --max-tokens 4000
node packages/cli/dist/index.js route --project <repo> --text <prompt> --json --explain
node packages/cli/dist/index.js evaluate --project <repo>
```

Two context targets and two route prompts were used per repository.

## Repository Matrix

| Repository | Category | Commit | Files | Nodes | Concepts | Architecture coverage | Command result |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `vitejs/vite` | Large JS/TS monorepo | `b3132da` | 2327 | 3286 | 32 | 17.71% | Pass with quality warnings |
| `pallets/click` | Small Python utility library | `0039359` | 123 | 270 | 32 | 0% | Pass with quality warnings |
| `sharkdp/fd` | Rust CLI project | `7f1b147` | 43 | 96 | 32 | 0% | Pass with quality warnings |
| `rust-lang/book` | Documentation-heavy Markdown repo | `05d1142` | 1777 | 1872 | 32 | 0.79% | `doctor --strict` false-positive warning |
| `bradtraversy/mern-tutorial` | Mixed React/Express/Mongo app | `2580969` | 35 | 107 | 32 | 41.18% | Pass with quality warnings |

## Repository Findings

### `vitejs/vite`

Strengths:

- Scanner handled a large JS/TS repo without crashing: 2327 files and 3286 nodes.
- TypeScript AST parsing covered 1458 files.
- Context for `plugin container module resolution` selected `packages/vite/src/node/server/pluginContainer.ts`, `packages/vite/src/node/plugin.ts`, `packages/vite/src/node/server/mixedModuleGraph.ts`, and `docs/guide/api-plugin.md`.
- Context for `dependency optimizer pre-bundling` selected dependency optimizer source files and the dependency pre-bundling docs.
- Both route prompts were correctly classified as `goal-driven`.

Weaknesses:

- `workspacePackages` was `0` even though the repository uses `pnpm-workspace.yaml`.
- Evaluation reported 117 unresolved imports. The sampled unresolved imports were mostly static asset imports such as `./assets/vite.svg` and generated outputs such as `./dist/index.js`.
- Context packs selected useful files but no relevant nodes or concepts under the 4000-token budget, which weakens the abstraction-tree guidance.

Recommendations:

- Add `pnpm-workspace.yaml` discovery to workspace package detection.
- Classify static asset imports separately from unresolved source imports.
- Include selected file owner nodes, or compact node summaries, even when a token budget forces file-heavy context.

### `pallets/click`

Strengths:

- Scanner handled Python, docs, TOML, YAML, and shell files cleanly.
- `doctor`, `validate`, `export`, and `evaluate` passed.
- Route behavior was reasonable: a narrow envvar parsing bug was `direct`, while a new shell completion backend was `goal-driven`.
- Route estimates included useful files such as `src/click/parser.py`, `src/click/shell_completion.py`, and relevant tests.

Weaknesses:

- Architecture coverage was 0% because current architecture inference is mostly JS/TS/web oriented.
- The `option parsing envvar default handling` context selected only `tests/test_shell_completion.py` and the broad docs subsystem under the 4000-token budget. Better candidates such as `src/click/parser.py`, `tests/test_defaults.py`, and `tests/test_options.py` were not included in the final pack.
- Concepts included stopword nodes such as `concept-node.the` and `concept-node.and`.

Recommendations:

- Add Python package architecture heuristics for `src/<package>`, tests, docs, CLI entrypoints, and `pyproject.toml`.
- Boost exact code-path, symbol, and test-name matches over broad docs matches in context selection.
- Expand concept stopwords and add a quality check for single-word filler concepts.

### `sharkdp/fd`

Strengths:

- Scanner handled a Rust CLI project without errors.
- Route decisions were plausible: a narrow hidden-file filtering bug was `direct`, while a new output mode across CLI flags, docs, and tests was `goal-driven`.
- The broader route prompt selected likely files such as `tests/tests.rs`, `README.md`, `src/cli.rs`, and `tests/testenv/mod.rs`.

Weaknesses:

- Architecture coverage was 0%; Rust crate structure was not inferred as an architecture boundary.
- The `ignore rules hidden files traversal` context selected `.github/dependabot.yml`, plus broad module nodes, instead of stronger candidates like `src/walk.rs`, `src/cli.rs`, `README.md`, and integration tests.
- Concepts again included stopwords such as `the` and `and`.

Recommendations:

- Add Rust heuristics for `Cargo.toml`, `src/main.rs`, `src/lib.rs`, `src/bin`, `tests`, and CLI/traversal modules.
- Improve context ranking for Rust by weighting file names, README option text, and test names over workflow metadata.
- Treat CI/dependency metadata as lower priority unless the prompt mentions CI, releases, dependencies, or automation.

### `rust-lang/book`

Strengths:

- Scanner handled a documentation-heavy repository at scale: 1777 files and 1872 nodes.
- Validation passed with no issues.
- Ownership context selected the current and 2018 ownership chapters, plus related listing tooling.
- A broad async restructuring prompt was correctly classified as `goal-driven`.

Weaknesses:

- `doctor --strict` failed with a self dogfooding memory warning even though the workspace was freshly initialized and scanned from `rust-lang/book`.
- The warning was already present before `evaluate` ran, so the likely trigger was generic inferred node ids such as `subsystem.goal.mission.automation` and `subsystem.cli.local.api`, not copied Abstraction Tree memory.
- Architecture coverage was only 0.79%, which is expected for the current code-oriented heuristics but leaves docs architecture nearly invisible.
- The typo route prompt was correctly `direct`, but the estimated files included spellcheck and unrelated chapters ahead of the most obvious ownership chapter target.

Recommendations:

- Tighten self dogfooding detection so generic inferred subsystem ids are not sufficient contamination markers. Require hard evidence such as Abstraction Tree package names, core source paths, committed run/lesson artifacts copied before local commands, or a matching repository identity.
- Do not treat locally generated `evaluations/` as dogfooding contamination after a user runs `atree evaluate` in an external project.
- Add docs/book heuristics for `src/SUMMARY.md`, chapter trees, editions, appendices, listings, translation docs, and build tooling.
- Boost exact chapter title and path matches for documentation prompts.

### `bradtraversy/mern-tutorial`

Strengths:

- Scanner handled mixed backend and frontend JS/React files without errors.
- Architecture coverage was the best of the sample set at 41.18%, with API, UI, runtime dataflow, and package distribution nodes inferred.
- Route estimates for the protected goals route selected useful files across frontend and backend, including `frontend/src/features/goals/goalSlice.js`, `frontend/src/pages/Dashboard.jsx`, `backend/routes/goalRoutes.js`, `backend/middleware/authMiddleware.js`, and `backend/server.js`.
- The password reset prompt was correctly classified as `goal-driven` and selected user controller, login/register pages, goal controller, and routes.

Weaknesses:

- The `authentication middleware protected routes` context selected five relevant nodes but zero `relevantFiles`, even though the selected nodes owned backend route and middleware files.
- The `goals dashboard frontend backend flow` context selected only `frontend/package.json` as a relevant file, despite good route estimates for the same project.

Recommendations:

- Ensure context packs include representative source files from selected file-leaf or module nodes, especially when `relevantFiles` would otherwise be empty.
- Use import graph and architecture dataflow edges to pull route, middleware, controller, model, and frontend state files into full-stack context packs.

## Cross-Repository Issues

### Bug: self dogfooding detector false positive

`rust-lang/book` failed `doctor --strict` with:

```text
[warning] .abstraction-tree $: This workspace appears to contain Abstraction Tree's own dogfooding memory instead of project-local memory.
```

The repository had just been initialized and scanned locally. The detector should not treat generic subsystem names produced by the deterministic builder as proof of copied Abstraction Tree memory.

### Bug: stopword concepts leak into memory

`pallets/click` and `sharkdp/fd` produced concepts such as `the` and `and`. These concepts can enter context scoring and displace domain-relevant terms.

### Gap: pnpm workspaces are not detected

`vitejs/vite` uses `pnpm-workspace.yaml`, but the import graph reported `workspacePackages: 0`. This reduces package boundary and workspace import quality for a major monorepo pattern.

### Gap: non-JS architecture inference is thin

Python and Rust projects scanned successfully, but architecture coverage was 0% for `click` and `fd`. Documentation-heavy repositories also received almost no architecture coverage. This is acceptable for a deterministic beta, but should be documented as a v1 limitation or improved before claiming broad ecosystem architecture coverage.

### Gap: context selection can lose concrete edit files

Under a 4000-token budget, several context packs either selected no files or selected weak files while route estimates found stronger candidates. Context packing should degrade by compacting summaries before dropping all concrete source-file evidence from selected nodes.

## Benchmark Follow-up

Mission 06 turned these findings into local deterministic fixtures under
`examples/context-quality-benchmarks/`. The suite uses reduced projects for the
Vite, Click, fd, rust-lang/book, and MERN tutorial categories, then checks each
fixture through scan, import graph, deterministic tree building, context-pack
selection, prompt routing, and generated-memory quality expectations. The
fixtures avoid network access and encode expected file/node inclusions so future
context regressions fail with the missing prompt, file, or node named directly.

## Overall Assessment

The stable local command path is robust across all five repositories: scan and validate succeeded everywhere, and route decisions were generally appropriate. The main beta risk is not command reliability; it is quality of inference and context packing outside the project's strongest JS/TS web-app cases.

Before v1, the highest-value fixes are the self dogfooding false positive, pnpm workspace discovery, stopword concept pruning, static asset import classification, and context-pack fallback behavior when token budgets are tight.
