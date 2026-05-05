# Baseline Assessment

## Current State

`abstraction-tree` is a Node/TypeScript monorepo with workspaces for `@abstraction-tree/core`, `@abstraction-tree/cli`, `@abstraction-tree/app`, and the full `abstraction-tree` package. The implemented MVP is deterministic: it scans text files, uses the TypeScript compiler AST for JS/TS-family files, falls back to regex extraction for other supported text files, builds a folder/file/concept abstraction tree, validates persisted memory, and can generate relevance-scored context packs.

The committed root memory under `.abstraction-tree/` currently contains 42 file summaries, 76 tree nodes, 24 inferred concepts, 2 invariants, many scan change records, 17 run reports, 17 lessons, no context packs, and no evaluation reports beyond `.gitkeep`.

The visual app is a simple Vite/React project explorer that fetches `/api/state` from the CLI server and displays nodes, owned files, concepts, invariants, and change history. It builds successfully.

## What Works

- `npm install` completed successfully.
- `npm run build` completed successfully for core, CLI, and app.
- Direct execution of compiled core test files passed: 25 tests passed across context, scanner, tree builder, and validator tests.
- The scanner records content hashes normalized for line endings and extracts JS/TS imports, exports, and symbols through the TypeScript AST.
- The validator now covers many useful persisted-memory hazards: duplicate node IDs, duplicate file paths, duplicate ontology IDs/names, ontology rank shape, ontology confidence, node confidence, parent/child mismatches, parent cycles, concept references, invariant references, and semantic change-record shape/reference checks.
- CI is present and runs install, build, test, and strict `atree:validate` on push and PR.
- The repo is dogfooding `.abstraction-tree/` memory with run reports, lessons, scan records, and Codex/agent instructions.

## What Fails

- `npm test` failed with `spawn EPERM` before assertions ran. The aggregate command reported all four compiled test files as failed:
  - `packages/core/dist/context.test.js`
  - `packages/core/dist/scanner.test.js`
  - `packages/core/dist/treeBuilder.test.js`
  - `packages/core/dist/validator.test.js`
  Exact error class: `Error: spawn EPERM` from `node:internal/child_process`.
- `npm run atree:validate` failed in strict mode because validation emitted one warning:
  - `[warning] File changed since the last scan; summaries, symbols, or node ownership may be stale. (package-lock.json)`
- The mission runner log at `.abstraction-tree/automation/mission-logs/2026-05-04-1056-00-baseline-inspection.md.log` shows a failed Codex invocation:
  - `Failed to read prompt from stdin: input is not valid UTF-8 (invalid byte at offset 12).`
- `npm install` changed `package-lock.json` during this inspection by updating the root engine from `>=20` to `>=20.19.0`, so the required check had a write side effect.

## Important Risks

- The worktree is already dirty and mixes source changes, regenerated abstraction memory, automation files, and untracked mission artifacts. That makes it hard to attribute future changes safely.
- Strict validation does not currently pass, so CI-equivalent self-validation is not green locally.
- The current autonomous loop has many prior reports with `partial` results and known fallback checks. There is no objective evaluator yet to compare loop quality over time.
- Context-pack generation exists, but `.abstraction-tree/context-packs/` is empty. The system is not yet exercising its own context-pack workflow in committed memory.
- The app and docs describe future capabilities such as drift warnings, context packs, and richer project-comprehension views, but the visual app only displays a basic static project map from current state.
- LLM-assisted abstraction is still only a documented future layer; no provider-neutral interface or proposal validation pipeline exists yet.

## Source-Control Hygiene Issues

`git status` reported modified tracked files before the report was written:

- `.abstraction-tree/automation/loop-state.json`
- `.abstraction-tree/concepts.json`
- `.abstraction-tree/files.json`
- `.abstraction-tree/invariants.json`
- `.abstraction-tree/tree.json`
- `.gitignore`
- `package.json`
- `packages/core/src/validator.test.ts`
- `packages/core/src/validator.ts`

After the required `npm install`, `package-lock.json` also became modified.

Untracked files include:

- `.abstraction-tree/automation/mission-runtime.example.json`
- `.abstraction-tree/automation/missions/`
- `.abstraction-tree/changes/scan.1777906037559.json`
- `.abstraction-tree/changes/scan.1777906510545.json`
- `.abstraction-tree/lessons/2026-05-04-1047-lesson.md`
- `.abstraction-tree/runs/2026-05-04-1047-agent-run.md`
- `scripts/run-codex-missions.ps1`

`loop-state.json` is committed runtime state and currently includes local counters plus `stop_requested: true`. The mission files already describe replacing it with committed config plus ignored runtime, but that migration has not happened yet.

Large local automation logs exist and are ignored by `*.log`, including `active-loop.log` and `scheduled-loop.log`. They are useful locally but should stay out of source control.

## Automation Loop Issues

- `scripts/run-abstraction-loop.ps1` still reads `.abstraction-tree/automation/loop-state.json` directly and requires that committed runtime file to exist.
- `.abstraction-tree/automation/codex-loop-prompt.md` still tells agents to update `loop-state.json`.
- `.abstraction-tree/automation/mission-runtime.json` is ignored local state, but the checked runtime currently shows `current: "00-baseline-inspection.md"`, so an interrupted mission runner can leave stale local state.
- `scripts/run-codex-missions.ps1` exists as an untracked script. Its first recorded mission invocation failed due a prompt encoding/UTF-8 problem.
- The loop runner does not yet have committed policy config, ignored local runtime counters, objective evaluation, diff-size stopping, repeated-test-failure stopping, or robust post-loop metrics.
- Prior run reports are all `partial`, mostly because earlier environments hit `spawn EPERM` for canonical build/test commands.

## Validation Issues

- Strict validation currently fails because `package-lock.json` is stale relative to `.abstraction-tree/files.json`.
- `validateContextPacks` exists in `packages/core/src/validator.ts`, but the CLI validation command does not load `.abstraction-tree/context-packs/` or call it.
- Automation config/runtime hygiene validation is not implemented. The validator does not detect committed `loop-state.json`, missing `loop-config.json`, missing `loop-runtime.example.json`, or tracked runtime state.
- Validation does not yet produce summarized issue counts or machine-readable reports for evaluation.
- The scanner ignores `.abstraction-tree/`, so abstraction-memory files are mostly validated through special allowances and semantic records rather than first-class source summaries.

## Evaluation / Metrics Gaps

- There is no `atree evaluate` CLI command.
- There is no `npm run atree:evaluate` script.
- There is no evaluator module under `packages/core/src/`.
- `.abstraction-tree/evaluations/` only contained `.gitkeep` before this report.
- The loop relies on human-written run reports and lessons, not deterministic metrics such as stale-file counts, run-result counts, context-pack breadth, or automation hygiene status.

## Visual App Gaps

- The app does not show validation status, stale-file count, latest run result, latest lesson, automation state, evaluation metrics, or context-pack health.
- There is no app test coverage.
- The app reads current tree state but does not expose the self-dogfooding loop state that would help future agents or maintainers understand whether the repo is healthy.
- The UI is useful as a basic explorer, but it is not yet the richer "project-comprehension cockpit" described by the roadmap and mission prompts.

## LLM Abstraction Gaps

- The current core only implements deterministic tree building.
- `AtreeConfig.treeBuilder` allows `"llm"` as a value, but there is no LLM abstraction builder interface, provider adapter contract, no-op provider, or validated proposal pipeline.
- Docs honestly state that the LLM abstraction pass is not implemented yet.
- There is no place for provider-neutral concepts such as proposal rationale, warnings, confidence, affected abstraction layer, or proposed ontology/tree changes.

## Recommended Mission Order

1. Mission 1: fix automation runtime/config source-control hygiene.
2. Mission 2: add automation state validation so strict validation catches old runtime-state patterns.
3. Mission 3: add deterministic evaluation metrics and `atree evaluate`.
4. Mission 4: add diff summary and overreach guard.
5. Mission 5: harden the Codex loop prompt and runner using the new config/runtime/evaluation pieces.
6. Mission 6: add formatting and hidden Unicode hygiene.
7. Mission 7: add the provider-neutral LLM abstraction interface without changing deterministic defaults.
8. Mission 8: improve the visual app with an agent health or self-dogfooding status panel.
9. Mission 9: update docs and abstraction memory after hardening work.
10. Mission 10: final release-readiness review.

Do not start feature expansion before source-control hygiene and strict validation are green.

## Checks Run

- `git status` - exit 0. Branch `main` is up to date with `origin/main`, but there are modified tracked files and untracked mission/automation artifacts.
- `npm install` - exit 0. Output: `up to date in 533ms`; 8 packages looking for funding. Side effect: `package-lock.json` changed its root engine field to `>=20.19.0`.
- `npm run build` - exit 0. Core, CLI, and app builds completed; Vite built the app bundle successfully.
- `npm test` - exit 1. Aggregate Node test runner failed with `Error: spawn EPERM` for each compiled test file; 0 passed and 4 file-level failures were reported by the runner.
- `npm run atree:validate` - exit 1. Strict validation failed because `package-lock.json` is stale in abstraction memory.
- Additional fallback check: direct execution of compiled test files passed with 25 total tests passing.

## Final Verdict

The repo has a working deterministic MVP and a useful validation foundation, but it is not clean or release-ready. The immediate blockers are source-control hygiene, committed runtime state, strict validation failure, missing objective evaluation metrics, and fragile automation runner behavior. The next mission should be runtime/config hygiene, followed by validation for that hygiene.
