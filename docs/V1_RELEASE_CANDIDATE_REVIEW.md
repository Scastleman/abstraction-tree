# V1 Release Candidate Review

> Audience: Maintainers
> Status: Current candidate assessment
> Read after: V1_RELEASE_GATE.md

This review checks the current repository against the v1 release gate. It is intentionally conservative: failing a gate does not mean the project is broken, only that it should not yet be called v1-ready.

## Summary

Current verdict: not v1-ready yet.

The current public beta version is `0.2.0-beta.1`. The stable local path is strong in the monorepo, local tarball smoke tests pass, clean external npm installs have verified the published beta, and the documented post-change release gate passed on 2026-05-15. Internal diverse-repository beta testing also found inference-quality gaps; the observed `doctor --strict` self-dogfooding false positive has been addressed by requiring hard copied-memory evidence before warning. The project is still not v1-ready because it needs public beta feedback, review of the broad current mission-improvement diff, and a deliberate stable dist-tag/version decision before v1.

## Gate Results

| Gate | Status | Evidence |
| --- | --- | --- |
| Stable user path | Pass for public beta | Repo-local commands, `pack:smoke`, and public npm install verification exercise init, scan, doctor, validate, context, export, and serve. |
| Install/package proof | Pass for public beta | `pack:smoke` installs local tarballs into an external temp project, verifies dogfooding-memory exclusion, and public registry verification passed for `abstraction-tree@beta` and `@abstraction-tree/cli@beta`. |
| Schema/migration policy | Pass for pre-v1 | `DATA_MODEL.md` documents `0.1.0`, future-version rejection, dry-run behavior, and backup expectations for future write migrations. |
| Visual proof | Pass | `docs/VISUAL_DEMO.md` and README embed real screenshots captured from `examples/small-web-app`. Stable visual scope remains tree, node, file, concept, invariant, change, and health inspection; workflow artifact views are read-only beta surfaces. Refresh screenshots when UI layout, `/api/state`, node detail content, workflow panels, or visual-demo docs change. |
| Docs/changelog alignment | Pass with ongoing maintenance | README is concise, docs are split by ownership, command docs have a local checker, and changelog has a `0.2.0-beta.1` candidate section plus `Unreleased`. |
| CI/release preflight | Current evidence passed | CI runs deterministic checks, `0.2.0-beta.1` was published after release dry-run and pack-smoke preparation, and the documented post-change release gate passed on 2026-05-15. Treat this as candidate evidence only; maintainer review is still required before any v1 decision. |
| Memory hygiene | Pass when current scan pruning is applied | `changes prune-generated --apply` keeps semantic history and latest generated scan while removing superseded generated scan noise. |
| Beta/experimental boundaries | Pass | Stable vs Experimental keeps route/goal/scope/evaluate and read-only workflow views as beta where appropriate, and mission execution/dogfooding as experimental. `goal --review-required` remains beta through first v1 unless external feedback justifies graduating only planning. |

## Public Beta Evidence

Public registry evidence has been collected for `0.2.0-beta.1`. The registry currently exposes both `beta` and `latest` dist-tags for this version because it is the only published version; docs continue to recommend `@beta` until stable v1.

| Evidence Item | Status | Link |
| --- | --- | --- |
| Full package `abstraction-tree@beta` external install | Pass | [2026-05-14 evidence](release-evidence/2026-05-14-0.2.0-beta.1-verification.md) |
| Core-only `@abstraction-tree/cli@beta` external install | Pass | [2026-05-14 evidence](release-evidence/2026-05-14-0.2.0-beta.1-verification.md) |
| Dogfooding-memory isolation from npm install | Pass | [2026-05-14 evidence](release-evidence/2026-05-14-0.2.0-beta.1-verification.md) |
| Diverse real-world repository scan, context, and route evaluation | Partial pass | [2026-05-15 evidence](release-evidence/2026-05-15-diverse-repository-beta-evaluation.md) |

## Current Commit Release-Gate Evidence

Result: passed on 2026-05-15 for the current mission-improvement diff.

Evidence link: [2026-05-15 current gate evidence](release-evidence/2026-05-15-current-gate.md).

The captured command was:

```bash
node scripts/capture-release-gate-evidence.mjs --version 0.2.0-beta.1
```

The evidence records git SHA, environment, command outputs, stderr, exit codes, and final git status. The full documented gate passed, including audit, typecheck, build, coverage, package size, pack smoke, release dry-run, scan, validate, evaluate, doctor, and diff summary. Treat the generated file as release-gate evidence only; it does not declare v1 readiness or replace maintainer signoff.

## Blockers Before V1

- Collect external beta feedback and fix install, scan, validate, export, serve, or dogfooding-memory issues that block the stable path.
- Review the broad current mission-improvement diff and resolve or explicitly defer any release-gate warning before making a v1 decision.
- Resolve or explicitly defer remaining diverse-repository beta findings that affect stable commands; the self dogfooding false positive in `doctor --strict` is now covered by hard-evidence detector tests.
- Keep real visual screenshots current in `docs/assets/visual-demo/` whenever the app UI changes, including beta workflow panels when they are documented.
- Decide and document stable v1 package/tag handling so `latest` intentionally points at a stable release when v1 is ready.
- Keep `goal --review-required` beta at v1 unless public beta feedback provides evidence that the planning surface is stable enough to graduate.

## Beta Feedback Triage

Use the GitHub issue templates for beta feedback. Mark an issue as a `v1-blocker` when it affects install, init, scan, doctor, validate, context, export, serve, visual inspection, dogfooding-memory isolation, or release documentation. Use `beta-blocker` for issues that prevent beta users from completing public prerelease verification. Goal execution, mission execution, provider proposals, and dogfooding automation should not block v1 unless docs accidentally present them as stable.

## Non-Blockers For V1

- `goal --run`, `goal --full-auto`, mission execution, provider proposals, and the dogfooding loop can remain experimental.
- Read-only visual workflow panels can remain beta and non-blocking for v1 as long as docs do not imply they execute missions or make goal workflows stable.
- Deterministic tree generation can remain evidence-based rather than LLM-inferred.

## Baseline Clean Checkout Evidence

Result: pass on 2026-05-15. All release-gate commands completed with exit code 0 from a fresh external clone.

This evidence was captured at Git HEAD `c332bfa7ca1482019a43a0a6d04184de65029084`, before the current mission-improvement diff that adds CI hardening, dynamic goal planning, import alias resolution, protected serve artifacts, and visual workflow panels. Treat it as baseline evidence, not proof that the current uncommitted diff has passed the full clean-checkout release gate.

Environment:

- Clean clone: `C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree`
- Git HEAD: `c332bfa7ca1482019a43a0a6d04184de65029084` (`main...origin/main`)
- Operating system: Microsoft Windows 11 Home 10.0.26200 build 26200, 64-bit
- Shell host: PowerShell; final evidence commands were executed through `cmd.exe /d /s /c` so `npm` resolved to `npm.cmd` on Windows
- Node: `v24.14.0`
- npm: `11.9.0`
- Git: `git version 2.53.0.windows.2`
- Dependency install: `npm ci` from `package-lock.json`; 40 packages installed, 0 vulnerabilities reported

Discrepancies and notes:

- Direct PowerShell invocation of `npm` resolves to `npm.ps1` on this host and is blocked by the current execution policy. The final clean-checkout evidence uses the documented npm commands through `cmd.exe`, which invokes the same project-local dependencies through `npm.cmd`.
- The first scratch clone used for capture validation produced mixed-encoding temporary logs. The evidence below was rerun from a second fresh clone with UTF-8 capture.
- `npm ci` reported that 8 packages are looking for funding and found 0 vulnerabilities.
- `npm run diff:summary` reported only the two generated memory artifacts created by `atree:scan` and `atree:evaluate`; it reported no dangerous changes and no possible overreach.
- No missing peer dependencies, line-ending issues, validation warnings, or evaluation issues were reported by the final gate run. The build output preserves Vite's terminal color escape sequences as emitted.

Final clean-clone git status after the gate:

```text
## main...origin/main
?? .abstraction-tree/changes/scan.1778856476464.json
?? .abstraction-tree/evaluations/2026-05-15-1047-evaluation.json
```

Verbatim command outputs:

### npm ci

```text
COMMAND: npm ci
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:37.5122104-04:00


added 40 packages, and audited 45 packages in 3s

8 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

EXIT CODE: 0
END: 2026-05-15T10:46:40.8484354-04:00
```

### npm run format:check

```text
COMMAND: npm run format:check
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:40.9824337-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 format:check
> node scripts/format.mjs --check

Formatting check passed.

EXIT CODE: 0
END: 2026-05-15T10:46:41.3065325-04:00
```

### npm run check:unicode

```text
COMMAND: npm run check:unicode
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:41.4380384-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 check:unicode
> node scripts/check-unicode.mjs

No suspicious Unicode control characters found.

EXIT CODE: 0
END: 2026-05-15T10:46:41.7704832-04:00
```

### npm run docs:commands

```text
COMMAND: npm run docs:commands
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:41.9006097-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 docs:commands
> node scripts/check-doc-commands.mjs

Documentation command check passed.

EXIT CODE: 0
END: 2026-05-15T10:46:42.1190854-04:00
```

### npm run lint

```text
COMMAND: npm run lint
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:42.2510851-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 lint
> node scripts/lint.mjs

Lint passed (170 files checked).

EXIT CODE: 0
END: 2026-05-15T10:46:42.7843223-04:00
```

### npm run typecheck

```text
COMMAND: npm run typecheck
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:50.7638871-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 typecheck
> npm run build -w @abstraction-tree/core && npm run typecheck -w @abstraction-tree/core && npm run typecheck -w @abstraction-tree/cli && npm run typecheck -w @abstraction-tree/app


> @abstraction-tree/core@0.2.0-beta.1 build
> tsc -p tsconfig.json


> @abstraction-tree/core@0.2.0-beta.1 typecheck
> tsc -p tsconfig.json --noEmit


> @abstraction-tree/cli@0.2.0-beta.1 typecheck
> tsc -p tsconfig.json --noEmit


> @abstraction-tree/app@0.2.0-beta.1 typecheck
> tsc -p tsconfig.json --noEmit


EXIT CODE: 0
END: 2026-05-15T10:46:54.8504169-04:00
```

### npm run build

```text
COMMAND: npm run build
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:54.9934168-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 build
> npm run build -w @abstraction-tree/core && npm run build -w @abstraction-tree/cli && npm run build -w @abstraction-tree/app


> @abstraction-tree/core@0.2.0-beta.1 build
> tsc -p tsconfig.json


> @abstraction-tree/cli@0.2.0-beta.1 build
> tsc -p tsconfig.json


> @abstraction-tree/app@0.2.0-beta.1 build
> tsc -p tsconfig.json && vite build

[36mvite v8.0.10 [32mbuilding client environment for production...[36m[39m
[2K
transforming...✓ 1575 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.40 kB │ gzip:  0.26 kB
dist/assets/index-BRSflhSN.css    5.84 kB │ gzip:  1.76 kB
dist/assets/index-XPwsWMvl.js   160.35 kB │ gzip: 51.76 kB

[32m✓ built in 214ms[39m

EXIT CODE: 0
END: 2026-05-15T10:46:58.6754676-04:00
```

### npm run coverage

```text
COMMAND: npm run coverage
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:46:58.8134673-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 coverage
> node scripts/run-coverage.mjs

✔ validateAutomation accepts valid committed config and ignored runtime state (649.5404ms)
✔ validateAutomation ignores projects without automation state (1.1597ms)
✔ validateAutomation accepts BOM-prefixed automation JSON (401.354ms)
✔ validateAutomation reports legacy loop-state.json (397.1195ms)
✔ validateAutomation reports volatile runtime fields in committed config (402.2777ms)
✔ validateAutomation reports invalid automation config values (395.572ms)
✔ validateAutomation reports invalid automation runtime example values (382.8407ms)
✔ validateAutomation reports invalid mission runtime example values (385.4639ms)
✔ validateAutomation reports missing config and runtime example files (370.311ms)
✔ validateAutomation reports local runtime artifact paths when they are not ignored (373.5434ms)
✔ validateAutomation uses root gitignore fallback for runtime artifact paths (377.8852ms)
✔ validateAutomation warns when local runtime artifact paths are tracked (6.8976ms)
✔ reviewChangeRecords marks older generated scans as consolidation candidates (10.6425ms)
✔ buildChangeRecordReviewSummary returns compact deterministic counts (4.2579ms)
✔ limitChangeRecordReviewReport bounds generated scan details while preserving counts (4.4082ms)
✔ reviewChangeRecords reports malformed change files without mutating them (2.6941ms)
✔ reviewChangeRecords preserves generated scans referenced by semantic records (4.2634ms)
✔ pruneGeneratedScanRecords dry-runs by default and keeps files (2.8327ms)
✔ pruneGeneratedScanRecords deletes only superseded generated scan records (4.2189ms)
✔ pruneGeneratedScanRecords refuses to delete when change records have errors (3.3522ms)
✔ buildContextPack pulls concept-related files and nodes into vague target queries (1.6464ms)
✔ buildContextPack scores symbols and exports, not just file paths (0.1466ms)
✔ buildContextPack scores and emits node explanations (0.3526ms)
✔ buildContextPack uses the project explanation as project summary when available (0.1004ms)
✔ buildContextPack falls back to owned files when source files are empty (0.1449ms)
✔ buildContextPack falls back to dependsOn when dependencies are empty (0.121ms)
✔ buildContextPack keeps generated packs below over-broad evaluation thresholds (2.382ms)
✔ buildContextPack records scoring diagnostics and nearby exclusions when requested (1.1523ms)
✔ buildContextPack applies max token budget to selected context items (0.7832ms)
✔ formatContextPackMarkdown emits markdown context packs (0.3442ms)
✔ buildDiffSummary accepts a safe small diff (0.8542ms)
✔ buildDiffSummary flags broad overreach (0.1908ms)
✔ buildDiffSummary detects dangerous file changes (0.2241ms)
✔ buildDiffSummary detects generated memory files (0.1313ms)
✔ evaluateProject counts tree nodes (386.0527ms)
✔ evaluateProject reports explanation completeness metrics (381.5094ms)
✔ evaluateProject detects missing ownership (383.7882ms)
✔ evaluateProject counts run reports by result (375.8871ms)
✔ evaluateProject reports generated scan buildup with one retained scan (386.4424ms)
✔ evaluateProject keeps semantic records separate from generated scan eligibility (406.5456ms)
✔ evaluateProject does not warn when generated scan count is below threshold (382.268ms)
✔ evaluateProject reports automation config status (374.0163ms)
✔ evaluateProject flags context packs at over-broad boundaries (375.5117ms)
✔ evaluateProject accepts BOM-prefixed metadata JSON (378.0118ms)
✔ evaluateProject reports generated-memory quality regressions (382.9386ms)
✔ evaluateProject warns when expected context pack exceeds fixture ceilings (378.2763ms)
✔ evaluateProject validates context-pack fixture ceilings (375.5992ms)
✔ evaluation output is serializable (390.7907ms)
✔ goal planner creates deterministic goal workspace artifacts (2.8017ms)
✔ goal planner writes create-pr planning body without execution claims (0.5308ms)
✔ buildImportGraphFromFiles resolves relative extensionless, JS-suffixed, and index imports (0.7607ms)
✔ buildImportGraphFromFiles resolves ESM and CommonJS module variant imports (0.2041ms)
✔ buildImportGraph resolves workspace package imports and separates external and unresolved imports (6.2525ms)
✔ buildImportGraph resolves relative generated package artifact imports to scanned source files (5.0499ms)
✔ buildImportGraphFromFiles keeps genuinely missing relative source imports unresolved (0.1631ms)
✔ buildImportGraphFromFiles detects file import cycles (0.1689ms)
✔ core exports LLM abstraction types and deterministic no-op builder (0.1971ms)
✔ validates materialized LLM ontology and tree proposals (1.2378ms)
✔ blocks malformed LLM proposal output before it can be reviewed for application (0.3243ms)
✔ blocks unsafe destructive and canonical-memory tree proposals (0.1755ms)
✔ creates review-gated proposal records (0.2442ms)
✔ current-version memory plans no migration changes (0.5948ms)
✔ future memory versions block migration with an actionable issue (2.881ms)
✔ dry run does not write memory files (2.3269ms)
✔ workspace migration validates current-version fixture output (1.9351ms)
✔ requested source version must match the workspace config (2.2527ms)
✔ unsupported older schema versions require an explicit migration path (2.0535ms)
✔ current-version no-op migration does not create backups (1.6639ms)
✔ router sends simple documentation typo prompts to direct (1.9347ms)
✔ router keeps small code bug fixes direct when memory points to a narrow area (0.7726ms)
✔ router sends complex multi-area implementation prompts to goal-driven (0.4413ms)
✔ router sends broad strategy prompts to assessment packs (0.194ms)
✔ router sends destructive safety-bypass prompts to manual review (0.3496ms)
✔ router does not treat negated safety constraints as the requested action (0.224ms)
✔ router does not treat ambiguous high-impact rewrites as direct (0.1867ms)
✔ router handles missing abstraction memory with reduced confidence (0.0854ms)
✔ summarizeRunMarkdown reads current task heading (0.053ms)
✔ summarizeRunMarkdown keeps legacy task chosen heading compatibility (0.0367ms)
✔ summarizeRunMarkdown recognizes no-op result spellings (0.0375ms)
✔ summarizeRunMarkdown stops sections at the next heading (0.0263ms)
✔ runtime schema accepts valid v0.1 memory shapes (0.6966ms)
✔ api state schema rejects missing app-required top-level fields (0.1556ms)
✔ loadAtreeMemory treats missing memory files as empty valid collections (1.8768ms)
✔ loadAtreeMemory reports malformed JSON with file, field, severity, and recovery hint (2.9626ms)
✔ loadAtreeMemory reports malformed memory shape at the failing field path (2.7336ms)
✔ loadChangeRecords reports malformed JSON while tolerant reads keep valid records (4.1948ms)
✔ loadAtreeMemory reports non-object change JSON with recovery guidance (3.3482ms)
✔ loadAtreeMemory reports malformed change record shapes with file paths and hints (3.5589ms)
✔ future config schema versions stop loading with migration guidance (2.3937ms)
✔ summarizeFile uses AST facts for TypeScript and TSX (3.0361ms)
✔ summarizeFile keeps module extension metadata aligned (2.2656ms)
✔ summarizeFile keeps regex scanning for non-JS languages (1.1901ms)
✔ summarizeFile uses README intro prose as project purpose evidence (0.2682ms)
✔ summarizeFile labels expanded regex extension coverage (0.1701ms)
✔ scanProject includes MJS script tests with AST facts (2.7174ms)
✔ scanProject includes expanded language extension fixtures (10.4164ms)
✔ scanProject skips large and binary files for supported extensions (3.2362ms)
✔ scanProject walks sourceRoot and preserves project-relative paths (6.2921ms)
✔ scanProject honors glob ignores and keeps default directory ignores (5.0611ms)
✔ scanProject honors negated ignore patterns (4.2736ms)
✔ scanProject reads root gitignore patterns when configured (3.8569ms)
✔ buildScopeContract maps ambiguous tree UI prompts to app tree files (1.3668ms)
✔ checkScope blocks files outside the contract while allowing generated memory refreshes (0.7023ms)
✔ checkScope reports clean when changed files stay inside the contract (0.3285ms)
✔ buildDeterministicTree infers concepts from repo-specific paths and symbols (4.0373ms)
✔ buildDeterministicTree uses README purpose for the root project node (0.4344ms)
✔ buildDeterministicTree generates human-readable explanations for high-level and ownership nodes (0.4679ms)
✔ buildDeterministicTree puts inferred human subsystems at the first layer (5.5314ms)
✔ buildDeterministicTree does not invent an app subsystem without app evidence (0.3513ms)
✔ buildDeterministicTree keeps repo concept fixtures stable and filters documentation filler (1.554ms)
✔ buildDeterministicTree populates architecture nodes for the Abstraction Tree package shape (2.0172ms)
✔ buildDeterministicTree infers API, UI, and dataflow architecture for a small web app fixture (0.8023ms)
✔ formatTreeAsMermaid emits deterministic node declarations and tree edges (0.2848ms)
✔ formatTreeAsDot emits Graphviz with parent fallback edges and escaped labels (0.2159ms)
✔ detectFileDrift reports stale file summaries and new files (1.0908ms)
✔ detectFileDrift ignores platform line ending size differences when content hash matches (0.3277ms)
✔ detectFileDrift uses legacy signatures when only one side has a content hash (0.2601ms)
✔ detectFileDrift reports files removed from disk (0.2107ms)
✔ detectFileDrift falls back to ownedFiles when sourceFiles is empty (0.1064ms)
✔ validateTree reports parent and children link mismatches (0.1094ms)
✔ validateTree reports parent cycles even when links are bidirectional (0.1011ms)
✔ validateTree reports duplicate node ids before map lookups collapse them (0.0789ms)
✔ validateTree reports duplicate file paths before path lookups collapse them (0.3372ms)
✔ validateTree falls back to ownedFiles when sourceFiles is empty (0.0796ms)
✔ validateTree reports duplicate ontology level ids before ontology lookups collapse them (0.0779ms)
✔ validateTree reports duplicate ontology level names (0.0564ms)
✔ validateTree reports invalid ontology rank shapes (0.1587ms)
✔ validateTree reports invalid ontology confidence values (0.1829ms)
✔ validateTree reports invalid node confidence values (0.1294ms)
✔ validateTree warns gently for missing or thin high-level explanations (0.1673ms)
✔ validateConcepts reports duplicate concept ids before context de-duplication (0.268ms)
✔ validateConcepts reports concept references to missing nodes and files (0.3388ms)
✔ validateInvariants reports duplicate invariant ids before invariant lookups collapse them (0.2515ms)
✔ validateInvariants reports invariant references to missing nodes and files (0.3627ms)
✔ validateInvariants reports tree nodes that reference missing invariant ids (0.1193ms)
✔ validateChanges reports duplicate ids and missing node, file, and invariant references (0.5819ms)
✔ validateChanges reports malformed change record shapes before checking references (0.1713ms)
✔ readJson accepts JSON files with a leading BOM (2.4517ms)
✔ ensureWorkspace creates a blank project-local workspace (2.9956ms)
✔ scan memory for a temporary project is generated from that project (8.0501ms)
✔ summarizeRunMarkdown reads current task heading (0.0824ms)
✔ summarizeRunMarkdown keeps legacy task chosen heading compatibility (0.0386ms)
✔ summarizeRunMarkdown recognizes no-op result spellings (0.0409ms)
✔ /api/state loader returns fixture memory using the shared core state contract (7.2044ms)
✔ /api/state supplies stable defaults when optional health files are missing (2.7244ms)
✔ /api/state agent health surfaces the latest scope contract status (4.4381ms)
✔ /api/state contract rejects missing app-required top-level fields (6.4653ms)
✔ changes review --limit bounds CLI output while preserving counts (4.3524ms)
✔ changes review rejects invalid --limit input (1.4478ms)
✔ changes prune-generated dry-runs unless --apply is provided (2.8143ms)
✔ changes prune-generated --apply deletes superseded generated scan records (3.692ms)
✔ doctor reports an empty project as uninitialized (1.1474ms)
✔ doctor guides an initialized project without a scan to run scan (5.6674ms)
✔ doctor reports valid memory as ok (12.4963ms)
✔ doctor warns when external projects contain Abstraction Tree dogfooding memory (13.7887ms)
✔ doctor does not warn when an external project merely documents Abstraction Tree commands (13.0153ms)
✔ doctor resolves visual app checks from the project root (12.0115ms)
✔ doctor surfaces runtime schema issues from memory loading (7.86ms)
✔ doctor strict mode treats warnings as failures (5.5142ms)
✔ export command prints Mermaid output from tree memory (228.9439ms)
✔ export command writes DOT output to a project-relative file (234.5363ms)
✔ top-level CLI help labels stable, beta, and experimental command groups (224.8537ms)
✔ goal command plan-only writes a complete workspace and preserves the original goal (18.9578ms)
✔ goal command review-required prints mission runner commands (19.1976ms)
✔ goal command auto-route writes route and scope artifacts for goal-driven prompts (17.4695ms)
✔ goal command auto-route stops direct prompts before creating a goal workspace (5.846ms)
✔ goal command auto-route stops assessment-pack prompts (5.5873ms)
✔ goal command auto-route stops manual-review prompts with manual-review exit (5.2128ms)
✔ goal command force-goal records route override (15.9465ms)
✔ goal command full-auto plans but refuses unsafe execution (16.1644ms)
✔ goal command run refuses clearly and writes checks, score, and PR body when requested (17.4333ms)
✔ goal command create-pr writes draft PR body without pushing (21.3648ms)
✔ goal command missing file fails clearly (1.9963ms)
✔ migrate dry-run formats a clear no-op plan (3.0329ms)
✔ migrate reports unsupported target versions as command failures (2.1493ms)
✔ migrate reports future workspace memory without rewriting config (2.8134ms)
✔ browserOpenCommand chooses the platform browser command (0.1262ms)
✔ openBrowser resolves success without waiting for the browser process (0.2379ms)
✔ openBrowser failure is reported as non-fatal result data (0.0857ms)
✔ propose saves adapter output under proposals without changing canonical memory (13.6904ms)
✔ route command prints readable routing from a prompt file (6.1047ms)
✔ route command supports JSON output from prompt text (4.8207ms)
✔ route command rejects ambiguous input sources (1.7378ms)
✔ goal auto-route stops direct prompts unless forced (5.6398ms)
✔ goal auto-route continues goal-driven prompts (16.0955ms)
✔ scope command writes a prompt scope contract (6.1807ms)
✔ scope check blocks out-of-contract files with injected Git input (7.7444ms)
✔ serve command exposes --open in CLI help (228.5879ms)
✔ README documents atree serve --open (0.312ms)
✔ selectServeHost defaults to loopback without a warning (0.2454ms)
✔ selectServeHost keeps explicit loopback hosts without a warning (0.0564ms)
✔ selectServeHost warns for wildcard and non-loopback hosts (0.0867ms)
✔ formatServeUrl brackets IPv6 hosts (0.0532ms)
✔ browserServeUrl prefers loopback for local and wildcard hosts (0.0479ms)
✔ serve project summary makes the resolved project and memory counts explicit (6.2495ms)
✔ serve project summary warns for unscanned workspaces (2.9523ms)
✔ serve project summary warns when serving the Abstraction Tree development repo (3.1295ms)
✔ init guidance for full mode points to scan and serve --open (0.1385ms)
✔ scan guidance for full mode points to serve --open (0.0923ms)
✔ scan guidance for core mode explains how to enable the app (0.045ms)
✔ tree export command prints Mermaid diagrams by default (3.3709ms)
✔ tree export command writes Graphviz diagrams to a project-relative output file (3.5745ms)
✔ tree export command rejects unsupported formats (3.1619ms)
✔ fetchAbstractionState reports failed /api/state responses (12.6169ms)
✔ LoadError renders a useful /api/state error and retry control (3.0674ms)
✔ AppExplorer renders the selected node summary once (8.7987ms)
✔ TreeList builds and renders nested parent child relationships (0.6696ms)
✔ TreeList keeps ancestor branches visible when a descendant matches search (0.1625ms)
✔ flattenVisibleTreeItems hides descendants until their branch is expanded (0.0815ms)
✔ moveTreeSelection handles arrow and boundary keys (0.1255ms)
✔ mission panels render independently (0.9149ms)
✔ NodeDetails starts with the selected node representation summary (0.4188ms)
✔ app nodeFiles falls back to ownedFiles when sourceFiles is empty (0.1066ms)
✔ app nodeFiles prefers non-empty sourceFiles (0.0398ms)
✔ app nodeDependencies falls back to dependsOn when dependencies is empty (0.0314ms)
✔ app node accessors keep compatibility aliases visible (0.0665ms)
✔ release checks accept synchronized package versions with a changelog entry (7.7176ms)
✔ release checks reject missing changelog entries and version drift (6.974ms)
✔ checkDocCommands accepts documented package scripts and CLI commands (4.0771ms)
✔ checkDocCommands reports stale scripts, commands, and doc links (2.926ms)
✔ findSuspiciousUnicode reports bidi controls with location and code point (0.2164ms)
✔ sanitizeLine replaces controls with visible placeholders (0.0427ms)
✔ createAssessmentPack creates a timestamped pack folder (11.7097ms)
✔ createAssessmentPack writes all required files (12.0795ms)
✔ assessment prompt states ChatGPT/human strategy and bounded Codex execution (10.3209ms)
✔ assessment prompt and required files include pack safety metadata (14.0663ms)
✔ parseArgs accepts assessment pack safety controls (0.2394ms)
✔ assessment pack redacts default and custom sensitive values (11.1778ms)
✔ assessment pack truncates large artifacts with visible markers (10.017ms)
✔ assessment pack can omit high-risk artifact classes (11.6083ms)
✔ missing optional source artifacts degrade gracefully (10.0214ms)
✔ runCli reports the generated prompt path (10.6247ms)
✔ runCli reports safety notices for omitted artifacts (10.0305ms)
✔ root npm scripts keep PowerShell commands explicitly Windows-scoped (0.5396ms)
✔ diff-summary Node wrapper reads fixture input without PowerShell (1.6838ms)
✔ PowerShell automation invokes npm through npm.cmd on Windows (0.7533ms)
✔ data model docs describe node explanations (0.5217ms)
✔ generated memory fixture quality stays stable for small web app (17.2195ms)
✔ generated memory fixture quality stays stable for inventory API (7.6307ms)
✔ args require a source folder and import name (0.2678ms)
✔ valid assessment missions are imported under the named manual mission folder (10.595ms)
✔ README is allowed but is not treated as a mission (1.5313ms)
✔ dry run validates without creating the destination folder (2.0973ms)
✔ non-Markdown files fail before copy (2.5926ms)
✔ missing or invalid frontmatter fails with actionable messages (3.1383ms)
✔ affected files, affected nodes, and dependsOn must be arrays (1.7442ms)
✔ mission body must include required schema headings (2.2692ms)
✔ duplicate mission ids fail validation (3.7766ms)
✔ existing destinations require explicit overwrite (9.8351ms)
✔ runtime artifact destinations are rejected (1.6345ms)
✔ source and destination folders must not overlap (2.2357ms)
✔ isLintableProjectFile includes source code and skips generated outputs (0.1277ms)
✔ isAutonomyClaimProjectFile scopes claim checks to public docs and prompts (0.1364ms)
✔ lintRelativeImportSpecifier enforces NodeNext runtime extensions (0.142ms)
✔ lintAutonomyClaims reports unqualified public autonomy claims (0.5469ms)
✔ lintAutonomyClaims allows explicit non-goal and historical contexts (0.1194ms)
✔ shouldLintNodeNextImportExtensions scopes NodeNext imports to workspace code (0.1029ms)
✔ lintSourceText reports focused tests and debugger statements (1.0627ms)
✔ lintSourceText allows fixture-local extensionless imports outside NodeNext workspaces (0.1436ms)
✔ lintSourceText reports relative imports that cannot run as emitted ESM (0.3678ms)
✔ frontmatter parser supports mission scalar, boolean, and array fields (0.0797ms)
✔ markdown parser reports whether frontmatter was delimited (0.1945ms)
✔ mission markdown validation requires schema values and body headings (0.1944ms)
✔ mission folder validation rejects duplicate ids (3.2015ms)
✔ required body heading list is the canonical contract (0.0716ms)
✔ README routes new users to productization docs and stable demo commands (0.3125ms)
✔ stable vs experimental doc labels core, beta, and experimental surfaces (0.296ms)
✔ getting started stays on the provider-free beginner path (0.3901ms)
✔ packaging docs and release dry run agree on package smoke preflight (0.6945ms)
✔ release dry run uses explicit npm tags for prerelease versions (0.2136ms)
✔ supportsTextProcessing recognizes shared script text extensions (0.0778ms)
✔ fallback project file listing skips transient and generated directories (6.2423ms)
✔ fallback ignores normalize Windows-style runtime paths (0.0617ms)
✔ coverageDirectory resolves the ignored V8 coverage folder (0.1433ms)
✔ buildCoverageEnv preserves existing env while setting NODE_V8_COVERAGE (0.0929ms)
✔ isCoverageArtifact recognizes V8 coverage files (0.1438ms)
✔ full-loop args parse safe defaults (0.2275ms)
✔ full-loop args parse safe defaults and explicit controls (0.1406ms)
✔ full-loop args parse assessment-pack-only flag (0.0649ms)
✔ full-loop args parse external coherence review flag (0.3673ms)
✔ full-loop rejects assessment-pack-only with mission-source flags (0.1522ms)
✔ full-loop rejects external coherence review before post-run context exists (0.1545ms)
✔ full-loop rejects skip-codex-assessment without missions folder (0.0897ms)
✔ full-loop rejects missions folder without skip-codex-assessment (0.1034ms)
✔ full-loop rejects danger-full-access without explicit allow flag (0.071ms)
✔ full-loop accepts danger-full-access with explicit allow flag (0.0501ms)
✔ assessment prompt states full project goal and mission output contract (0.2478ms)
✔ coherence prompt asks whether to stop or repeat (0.1451ms)
✔ durable run report records runtime artifact policy (0.1837ms)
✔ durable run report labels external strategy source (0.0948ms)
✔ durable run report marks external coherence review pending (0.0401ms)
✔ valid assessment output passes validation (3.5721ms)
✔ assessment output validation fails when a mission is missing frontmatter (3.4617ms)
✔ assessment output validation fails when a mission is missing required frontmatter fields (2.9729ms)
✔ assessment output validation fails when a mission is missing category (3.501ms)
✔ assessment output validation fails when a mission has invalid category (2.8858ms)
✔ assessment output validation rejects multiple automation-maintenance missions by default (3.9301ms)
✔ assessment output validation allows multiple automation-maintenance missions with override (3.5908ms)
✔ assessment output validation fails when parallelGroupSafe is not boolean (3.2789ms)
✔ assessment output validation fails when required body sections are missing (2.713ms)
✔ assessment output validation fails without assessment.md (2.5421ms)
✔ assessment output validation fails without missions README (2.1836ms)
✔ assessment output validation fails when too many missions are written (3.1696ms)
✔ assessment output validation fails for mission Markdown outside missions directory (3.6311ms)
✔ dry run writes assessment prompt without invoking Codex (6.5415ms)
✔ assessment-pack-only creates pack and exits before Codex or missions (12.3777ms)
✔ external mission dry run discovers provided folder without assessment prompt (5.8335ms)
✔ external mission run skips assessment spawn and passes folder to mission runner (13.3099ms)
✔ external coherence review writes evidence pack without Codex coherence spawn (11.6871ms)
✔ dry run still rejects danger-full-access without explicit allow flag (0.6224ms)
✔ frontmatter parser supports scalars, empty arrays, and block arrays (0.1079ms)
✔ mission discovery recursively excludes README files (4.5186ms)
✔ mission title is inferred from the first markdown heading (1.8723ms)
✔ affected files are inferred from body text when files exist (3.6135ms)
✔ batch planning prevents overlap on affected files (0.4908ms)
✔ batch planning prevents overlap on affected node neighborhoods (0.1828ms)
✔ high-risk missions are isolated from other missions (0.0809ms)
✔ global shared files are not parallel-safe for writable missions (0.0899ms)
✔ dry-run prints commands without spawning Codex (3.7693ms)
✔ plan surfaces workspace-write concurrency blocker without failing planning (3.5568ms)
✔ workspace-write execution blocks concurrency without worktrees before spawning Codex (4.5206ms)
✔ plan surfaces danger-full-access blocker without failing planning (3.6176ms)
✔ plan omits execution blocker for explicitly allowed danger-full-access (4.0483ms)
✔ default queue uses automation missions and skips completed runtime entries (4.3963ms)
✔ legacy basename runtime entries do not collide across duplicate basenames (5.7993ms)
✔ mission-folder-relative runtime entries skip only the intended duplicate basename (5.1962ms)
✔ runtime-only completion exits with an explicit no pending message (4.1453ms)
✔ execution uses an injected Codex process and writes final output (9.8388ms)
✔ workspace-write execution with worktrees creates a real git worktree (248.7721ms)
✔ parallel-safe read-only execution writes one batch summary for the batch (9.466ms)
✔ runtime updates record repo-relative paths for duplicate basenames (12.5444ms)
✔ filesMatching recursively returns sorted matching files (2.9419ms)
✔ collectTestFiles discovers nested package and script tests (8.0382ms)
✔ small web app fixture scans checkout files and builds useful context (15.3658ms)
✔ checkout coordinates cart, payment, and order services (30.4962ms)
✔ checkout propagates cart and payment validation errors (12.3638ms)
✔ cart and payment services reject invalid inputs (12.9236ms)
ℹ tests 337
ℹ suites 0
ℹ pass 337
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 11716.8292
Coverage data written to coverage/v8.

EXIT CODE: 0
END: 2026-05-15T10:47:10.8664102-04:00
```

### npm test

```text
COMMAND: npm test
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:47:11.0034075-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 test
> node scripts/run-tests.mjs

✔ validateAutomation accepts valid committed config and ignored runtime state (590.0266ms)
✔ validateAutomation ignores projects without automation state (1.1815ms)
✔ validateAutomation accepts BOM-prefixed automation JSON (371.051ms)
✔ validateAutomation reports legacy loop-state.json (371.4467ms)
✔ validateAutomation reports volatile runtime fields in committed config (371.0647ms)
✔ validateAutomation reports invalid automation config values (371.0639ms)
✔ validateAutomation reports invalid automation runtime example values (368.3125ms)
✔ validateAutomation reports invalid mission runtime example values (375.8528ms)
✔ validateAutomation reports missing config and runtime example files (368.6859ms)
✔ validateAutomation reports local runtime artifact paths when they are not ignored (372.631ms)
✔ validateAutomation uses root gitignore fallback for runtime artifact paths (376.2698ms)
✔ validateAutomation warns when local runtime artifact paths are tracked (6.5803ms)
✔ reviewChangeRecords marks older generated scans as consolidation candidates (10.079ms)
✔ buildChangeRecordReviewSummary returns compact deterministic counts (4.3557ms)
✔ limitChangeRecordReviewReport bounds generated scan details while preserving counts (4.6211ms)
✔ reviewChangeRecords reports malformed change files without mutating them (2.7616ms)
✔ reviewChangeRecords preserves generated scans referenced by semantic records (4.3311ms)
✔ pruneGeneratedScanRecords dry-runs by default and keeps files (2.7316ms)
✔ pruneGeneratedScanRecords deletes only superseded generated scan records (4.1466ms)
✔ pruneGeneratedScanRecords refuses to delete when change records have errors (3.1047ms)
✔ buildContextPack pulls concept-related files and nodes into vague target queries (1.7242ms)
✔ buildContextPack scores symbols and exports, not just file paths (0.2992ms)
✔ buildContextPack scores and emits node explanations (0.3583ms)
✔ buildContextPack uses the project explanation as project summary when available (0.0959ms)
✔ buildContextPack falls back to owned files when source files are empty (0.1715ms)
✔ buildContextPack falls back to dependsOn when dependencies are empty (0.1437ms)
✔ buildContextPack keeps generated packs below over-broad evaluation thresholds (2.5649ms)
✔ buildContextPack records scoring diagnostics and nearby exclusions when requested (1.0181ms)
✔ buildContextPack applies max token budget to selected context items (0.5167ms)
✔ formatContextPackMarkdown emits markdown context packs (0.2236ms)
✔ buildDiffSummary accepts a safe small diff (0.5754ms)
✔ buildDiffSummary flags broad overreach (0.2196ms)
✔ buildDiffSummary detects dangerous file changes (0.2403ms)
✔ buildDiffSummary detects generated memory files (0.1378ms)
✔ evaluateProject counts tree nodes (380.5693ms)
✔ evaluateProject reports explanation completeness metrics (375.898ms)
✔ evaluateProject detects missing ownership (379.9533ms)
✔ evaluateProject counts run reports by result (377.0148ms)
✔ evaluateProject reports generated scan buildup with one retained scan (387.4684ms)
✔ evaluateProject keeps semantic records separate from generated scan eligibility (403.3428ms)
✔ evaluateProject does not warn when generated scan count is below threshold (384.0236ms)
✔ evaluateProject reports automation config status (375.4949ms)
✔ evaluateProject flags context packs at over-broad boundaries (397.3397ms)
✔ evaluateProject accepts BOM-prefixed metadata JSON (377.7152ms)
✔ evaluateProject reports generated-memory quality regressions (381.4927ms)
✔ evaluateProject warns when expected context pack exceeds fixture ceilings (378.4807ms)
✔ evaluateProject validates context-pack fixture ceilings (380.8736ms)
✔ evaluation output is serializable (373.813ms)
✔ goal planner creates deterministic goal workspace artifacts (2.4119ms)
✔ goal planner writes create-pr planning body without execution claims (0.9183ms)
✔ buildImportGraphFromFiles resolves relative extensionless, JS-suffixed, and index imports (0.7507ms)
✔ buildImportGraphFromFiles resolves ESM and CommonJS module variant imports (0.2208ms)
✔ buildImportGraph resolves workspace package imports and separates external and unresolved imports (5.6939ms)
✔ buildImportGraph resolves relative generated package artifact imports to scanned source files (4.9202ms)
✔ buildImportGraphFromFiles keeps genuinely missing relative source imports unresolved (0.1383ms)
✔ buildImportGraphFromFiles detects file import cycles (0.198ms)
✔ core exports LLM abstraction types and deterministic no-op builder (0.1704ms)
✔ validates materialized LLM ontology and tree proposals (0.8821ms)
✔ blocks malformed LLM proposal output before it can be reviewed for application (0.2938ms)
✔ blocks unsafe destructive and canonical-memory tree proposals (0.1587ms)
✔ creates review-gated proposal records (0.2502ms)
✔ current-version memory plans no migration changes (0.6036ms)
✔ future memory versions block migration with an actionable issue (3.0795ms)
✔ dry run does not write memory files (2.7756ms)
✔ workspace migration validates current-version fixture output (2.0031ms)
✔ requested source version must match the workspace config (2.2408ms)
✔ unsupported older schema versions require an explicit migration path (1.9581ms)
✔ current-version no-op migration does not create backups (1.6731ms)
✔ router sends simple documentation typo prompts to direct (1.3988ms)
✔ router keeps small code bug fixes direct when memory points to a narrow area (0.7324ms)
✔ router sends complex multi-area implementation prompts to goal-driven (0.7249ms)
✔ router sends broad strategy prompts to assessment packs (0.2218ms)
✔ router sends destructive safety-bypass prompts to manual review (0.3321ms)
✔ router does not treat negated safety constraints as the requested action (0.231ms)
✔ router does not treat ambiguous high-impact rewrites as direct (0.1893ms)
✔ router handles missing abstraction memory with reduced confidence (0.0749ms)
✔ summarizeRunMarkdown reads current task heading (0.1238ms)
✔ summarizeRunMarkdown keeps legacy task chosen heading compatibility (0.0911ms)
✔ summarizeRunMarkdown recognizes no-op result spellings (0.0736ms)
✔ summarizeRunMarkdown stops sections at the next heading (0.0454ms)
✔ runtime schema accepts valid v0.1 memory shapes (0.5166ms)
✔ api state schema rejects missing app-required top-level fields (0.0946ms)
✔ loadAtreeMemory treats missing memory files as empty valid collections (2.245ms)
✔ loadAtreeMemory reports malformed JSON with file, field, severity, and recovery hint (2.8015ms)
✔ loadAtreeMemory reports malformed memory shape at the failing field path (2.4348ms)
✔ loadChangeRecords reports malformed JSON while tolerant reads keep valid records (3.3655ms)
✔ loadAtreeMemory reports non-object change JSON with recovery guidance (3.2444ms)
✔ loadAtreeMemory reports malformed change record shapes with file paths and hints (2.6589ms)
✔ future config schema versions stop loading with migration guidance (2.7299ms)
✔ summarizeFile uses AST facts for TypeScript and TSX (2.643ms)
✔ summarizeFile keeps module extension metadata aligned (1.7919ms)
✔ summarizeFile keeps regex scanning for non-JS languages (1.2735ms)
✔ summarizeFile uses README intro prose as project purpose evidence (0.2126ms)
✔ summarizeFile labels expanded regex extension coverage (0.236ms)
✔ scanProject includes MJS script tests with AST facts (2.7656ms)
✔ scanProject includes expanded language extension fixtures (10.006ms)
✔ scanProject skips large and binary files for supported extensions (3.3054ms)
✔ scanProject walks sourceRoot and preserves project-relative paths (3.1317ms)
✔ scanProject honors glob ignores and keeps default directory ignores (5.4604ms)
✔ scanProject honors negated ignore patterns (4.2269ms)
✔ scanProject reads root gitignore patterns when configured (3.607ms)
✔ buildScopeContract maps ambiguous tree UI prompts to app tree files (1.13ms)
✔ checkScope blocks files outside the contract while allowing generated memory refreshes (0.6224ms)
✔ checkScope reports clean when changed files stay inside the contract (0.3192ms)
✔ buildDeterministicTree infers concepts from repo-specific paths and symbols (3.8337ms)
✔ buildDeterministicTree uses README purpose for the root project node (0.4505ms)
✔ buildDeterministicTree generates human-readable explanations for high-level and ownership nodes (0.494ms)
✔ buildDeterministicTree puts inferred human subsystems at the first layer (5.9229ms)
✔ buildDeterministicTree does not invent an app subsystem without app evidence (0.3764ms)
✔ buildDeterministicTree keeps repo concept fixtures stable and filters documentation filler (1.8107ms)
✔ buildDeterministicTree populates architecture nodes for the Abstraction Tree package shape (1.5507ms)
✔ buildDeterministicTree infers API, UI, and dataflow architecture for a small web app fixture (0.9214ms)
✔ formatTreeAsMermaid emits deterministic node declarations and tree edges (0.248ms)
✔ formatTreeAsDot emits Graphviz with parent fallback edges and escaped labels (0.2172ms)
✔ detectFileDrift reports stale file summaries and new files (0.8125ms)
✔ detectFileDrift ignores platform line ending size differences when content hash matches (0.2623ms)
✔ detectFileDrift uses legacy signatures when only one side has a content hash (0.2109ms)
✔ detectFileDrift reports files removed from disk (0.1775ms)
✔ detectFileDrift falls back to ownedFiles when sourceFiles is empty (0.0849ms)
✔ validateTree reports parent and children link mismatches (0.1157ms)
✔ validateTree reports parent cycles even when links are bidirectional (0.1213ms)
✔ validateTree reports duplicate node ids before map lookups collapse them (0.0817ms)
✔ validateTree reports duplicate file paths before path lookups collapse them (0.303ms)
✔ validateTree falls back to ownedFiles when sourceFiles is empty (0.0694ms)
✔ validateTree reports duplicate ontology level ids before ontology lookups collapse them (0.0793ms)
✔ validateTree reports duplicate ontology level names (0.0469ms)
✔ validateTree reports invalid ontology rank shapes (0.1306ms)
✔ validateTree reports invalid ontology confidence values (0.1348ms)
✔ validateTree reports invalid node confidence values (0.093ms)
✔ validateTree warns gently for missing or thin high-level explanations (0.1579ms)
✔ validateConcepts reports duplicate concept ids before context de-duplication (0.2095ms)
✔ validateConcepts reports concept references to missing nodes and files (0.2735ms)
✔ validateInvariants reports duplicate invariant ids before invariant lookups collapse them (0.1584ms)
✔ validateInvariants reports invariant references to missing nodes and files (0.2924ms)
✔ validateInvariants reports tree nodes that reference missing invariant ids (0.1013ms)
✔ validateChanges reports duplicate ids and missing node, file, and invariant references (0.5404ms)
✔ validateChanges reports malformed change record shapes before checking references (0.1674ms)
✔ readJson accepts JSON files with a leading BOM (1.487ms)
✔ ensureWorkspace creates a blank project-local workspace (2.0244ms)
✔ scan memory for a temporary project is generated from that project (8.304ms)
✔ summarizeRunMarkdown reads current task heading (0.1214ms)
✔ summarizeRunMarkdown keeps legacy task chosen heading compatibility (0.0718ms)
✔ summarizeRunMarkdown recognizes no-op result spellings (0.0425ms)
✔ /api/state loader returns fixture memory using the shared core state contract (7.1772ms)
✔ /api/state supplies stable defaults when optional health files are missing (2.865ms)
✔ /api/state agent health surfaces the latest scope contract status (4.6784ms)
✔ /api/state contract rejects missing app-required top-level fields (7.0049ms)
✔ changes review --limit bounds CLI output while preserving counts (4.3443ms)
✔ changes review rejects invalid --limit input (1.6088ms)
✔ changes prune-generated dry-runs unless --apply is provided (2.6339ms)
✔ changes prune-generated --apply deletes superseded generated scan records (2.8735ms)
✔ doctor reports an empty project as uninitialized (1.3964ms)
✔ doctor guides an initialized project without a scan to run scan (6.0944ms)
✔ doctor reports valid memory as ok (12.5022ms)
✔ doctor warns when external projects contain Abstraction Tree dogfooding memory (13.5489ms)
✔ doctor does not warn when an external project merely documents Abstraction Tree commands (13.6066ms)
✔ doctor resolves visual app checks from the project root (11.8474ms)
✔ doctor surfaces runtime schema issues from memory loading (8.7637ms)
✔ doctor strict mode treats warnings as failures (4.9291ms)
✔ export command prints Mermaid output from tree memory (177.3175ms)
✔ export command writes DOT output to a project-relative file (181.885ms)
✔ top-level CLI help labels stable, beta, and experimental command groups (176.6305ms)
✔ goal command plan-only writes a complete workspace and preserves the original goal (18.2615ms)
✔ goal command review-required prints mission runner commands (15.7059ms)
✔ goal command auto-route writes route and scope artifacts for goal-driven prompts (17.7763ms)
✔ goal command auto-route stops direct prompts before creating a goal workspace (5.044ms)
✔ goal command auto-route stops assessment-pack prompts (5.2836ms)
✔ goal command auto-route stops manual-review prompts with manual-review exit (5.7494ms)
✔ goal command force-goal records route override (20.0944ms)
✔ goal command full-auto plans but refuses unsafe execution (15.8312ms)
✔ goal command run refuses clearly and writes checks, score, and PR body when requested (17.2021ms)
✔ goal command create-pr writes draft PR body without pushing (15.6872ms)
✔ goal command missing file fails clearly (1.835ms)
✔ migrate dry-run formats a clear no-op plan (3.1581ms)
✔ migrate reports unsupported target versions as command failures (2.2544ms)
✔ migrate reports future workspace memory without rewriting config (2.5206ms)
✔ browserOpenCommand chooses the platform browser command (0.1055ms)
✔ openBrowser resolves success without waiting for the browser process (0.2987ms)
✔ openBrowser failure is reported as non-fatal result data (0.0788ms)
✔ propose saves adapter output under proposals without changing canonical memory (13.0711ms)
✔ route command prints readable routing from a prompt file (6.0211ms)
✔ route command supports JSON output from prompt text (4.7108ms)
✔ route command rejects ambiguous input sources (1.8551ms)
✔ goal auto-route stops direct prompts unless forced (5.7849ms)
✔ goal auto-route continues goal-driven prompts (15.8808ms)
✔ scope command writes a prompt scope contract (6.2107ms)
✔ scope check blocks out-of-contract files with injected Git input (6.9641ms)
✔ serve command exposes --open in CLI help (177.0231ms)
✔ README documents atree serve --open (0.3213ms)
✔ selectServeHost defaults to loopback without a warning (0.1716ms)
✔ selectServeHost keeps explicit loopback hosts without a warning (0.0412ms)
✔ selectServeHost warns for wildcard and non-loopback hosts (0.0653ms)
✔ formatServeUrl brackets IPv6 hosts (0.0428ms)
✔ browserServeUrl prefers loopback for local and wildcard hosts (0.0395ms)
✔ serve project summary makes the resolved project and memory counts explicit (6.4979ms)
✔ serve project summary warns for unscanned workspaces (2.3153ms)
✔ serve project summary warns when serving the Abstraction Tree development repo (2.8552ms)
✔ init guidance for full mode points to scan and serve --open (0.1127ms)
✔ scan guidance for full mode points to serve --open (0.072ms)
✔ scan guidance for core mode explains how to enable the app (0.0406ms)
✔ tree export command prints Mermaid diagrams by default (3.6883ms)
✔ tree export command writes Graphviz diagrams to a project-relative output file (3.1901ms)
✔ tree export command rejects unsupported formats (3.0107ms)
✔ fetchAbstractionState reports failed /api/state responses (11.2684ms)
✔ LoadError renders a useful /api/state error and retry control (2.788ms)
✔ AppExplorer renders the selected node summary once (8.2196ms)
✔ TreeList builds and renders nested parent child relationships (0.5882ms)
✔ TreeList keeps ancestor branches visible when a descendant matches search (0.119ms)
✔ flattenVisibleTreeItems hides descendants until their branch is expanded (0.0756ms)
✔ moveTreeSelection handles arrow and boundary keys (0.0656ms)
✔ mission panels render independently (0.6174ms)
✔ NodeDetails starts with the selected node representation summary (0.3295ms)
✔ app nodeFiles falls back to ownedFiles when sourceFiles is empty (0.1019ms)
✔ app nodeFiles prefers non-empty sourceFiles (0.0359ms)
✔ app nodeDependencies falls back to dependsOn when dependencies is empty (0.0275ms)
✔ app node accessors keep compatibility aliases visible (0.055ms)
✔ release checks accept synchronized package versions with a changelog entry (7.8504ms)
✔ release checks reject missing changelog entries and version drift (6.3683ms)
✔ checkDocCommands accepts documented package scripts and CLI commands (4.4106ms)
✔ checkDocCommands reports stale scripts, commands, and doc links (3.5033ms)
✔ findSuspiciousUnicode reports bidi controls with location and code point (0.2086ms)
✔ sanitizeLine replaces controls with visible placeholders (0.0383ms)
✔ createAssessmentPack creates a timestamped pack folder (11.5969ms)
✔ createAssessmentPack writes all required files (12.1692ms)
✔ assessment prompt states ChatGPT/human strategy and bounded Codex execution (10.2023ms)
✔ assessment prompt and required files include pack safety metadata (9.6902ms)
✔ parseArgs accepts assessment pack safety controls (0.1796ms)
✔ assessment pack redacts default and custom sensitive values (12.6685ms)
✔ assessment pack truncates large artifacts with visible markers (9.4831ms)
✔ assessment pack can omit high-risk artifact classes (16.4185ms)
✔ missing optional source artifacts degrade gracefully (9.9987ms)
✔ runCli reports the generated prompt path (9.7134ms)
✔ runCli reports safety notices for omitted artifacts (10.5007ms)
✔ root npm scripts keep PowerShell commands explicitly Windows-scoped (0.4914ms)
✔ diff-summary Node wrapper reads fixture input without PowerShell (1.6508ms)
✔ PowerShell automation invokes npm through npm.cmd on Windows (0.4675ms)
✔ data model docs describe node explanations (0.3669ms)
✔ generated memory fixture quality stays stable for small web app (15.9209ms)
✔ generated memory fixture quality stays stable for inventory API (6.4788ms)
✔ args require a source folder and import name (0.2261ms)
✔ valid assessment missions are imported under the named manual mission folder (8.3509ms)
✔ README is allowed but is not treated as a mission (1.729ms)
✔ dry run validates without creating the destination folder (1.9569ms)
✔ non-Markdown files fail before copy (2.726ms)
✔ missing or invalid frontmatter fails with actionable messages (2.8502ms)
✔ affected files, affected nodes, and dependsOn must be arrays (1.599ms)
✔ mission body must include required schema headings (2.146ms)
✔ duplicate mission ids fail validation (2.4122ms)
✔ existing destinations require explicit overwrite (5.2575ms)
✔ runtime artifact destinations are rejected (1.4417ms)
✔ source and destination folders must not overlap (2.04ms)
✔ isLintableProjectFile includes source code and skips generated outputs (0.1102ms)
✔ isAutonomyClaimProjectFile scopes claim checks to public docs and prompts (0.0957ms)
✔ lintRelativeImportSpecifier enforces NodeNext runtime extensions (0.064ms)
✔ lintAutonomyClaims reports unqualified public autonomy claims (0.7164ms)
✔ lintAutonomyClaims allows explicit non-goal and historical contexts (0.1364ms)
✔ shouldLintNodeNextImportExtensions scopes NodeNext imports to workspace code (0.0937ms)
✔ lintSourceText reports focused tests and debugger statements (0.6191ms)
✔ lintSourceText allows fixture-local extensionless imports outside NodeNext workspaces (0.0932ms)
✔ lintSourceText reports relative imports that cannot run as emitted ESM (0.3351ms)
✔ frontmatter parser supports mission scalar, boolean, and array fields (0.0699ms)
✔ markdown parser reports whether frontmatter was delimited (0.1734ms)
✔ mission markdown validation requires schema values and body headings (0.1718ms)
✔ mission folder validation rejects duplicate ids (2.7219ms)
✔ required body heading list is the canonical contract (0.0525ms)
✔ README routes new users to productization docs and stable demo commands (0.2561ms)
✔ stable vs experimental doc labels core, beta, and experimental surfaces (0.2726ms)
✔ getting started stays on the provider-free beginner path (0.2415ms)
✔ packaging docs and release dry run agree on package smoke preflight (0.3759ms)
✔ release dry run uses explicit npm tags for prerelease versions (0.1445ms)
✔ supportsTextProcessing recognizes shared script text extensions (0.084ms)
✔ fallback project file listing skips transient and generated directories (9.3647ms)
✔ fallback ignores normalize Windows-style runtime paths (0.0611ms)
✔ coverageDirectory resolves the ignored V8 coverage folder (0.0787ms)
✔ buildCoverageEnv preserves existing env while setting NODE_V8_COVERAGE (0.0608ms)
✔ isCoverageArtifact recognizes V8 coverage files (0.0804ms)
✔ full-loop args parse safe defaults (0.1285ms)
✔ full-loop args parse safe defaults and explicit controls (0.1101ms)
✔ full-loop args parse assessment-pack-only flag (0.0438ms)
✔ full-loop args parse external coherence review flag (0.0475ms)
✔ full-loop rejects assessment-pack-only with mission-source flags (0.0891ms)
✔ full-loop rejects external coherence review before post-run context exists (0.0482ms)
✔ full-loop rejects skip-codex-assessment without missions folder (0.0273ms)
✔ full-loop rejects missions folder without skip-codex-assessment (0.0273ms)
✔ full-loop rejects danger-full-access without explicit allow flag (0.0272ms)
✔ full-loop accepts danger-full-access with explicit allow flag (0.0226ms)
✔ assessment prompt states full project goal and mission output contract (0.1425ms)
✔ coherence prompt asks whether to stop or repeat (0.0804ms)
✔ durable run report records runtime artifact policy (0.0803ms)
✔ durable run report labels external strategy source (0.0328ms)
✔ durable run report marks external coherence review pending (0.0281ms)
✔ valid assessment output passes validation (3.7422ms)
✔ assessment output validation fails when a mission is missing frontmatter (3.212ms)
✔ assessment output validation fails when a mission is missing required frontmatter fields (3.2964ms)
✔ assessment output validation fails when a mission is missing category (3.4944ms)
✔ assessment output validation fails when a mission has invalid category (3.0675ms)
✔ assessment output validation rejects multiple automation-maintenance missions by default (3.9628ms)
✔ assessment output validation allows multiple automation-maintenance missions with override (4.2478ms)
✔ assessment output validation fails when parallelGroupSafe is not boolean (3.0887ms)
✔ assessment output validation fails when required body sections are missing (3.3466ms)
✔ assessment output validation fails without assessment.md (2.8641ms)
✔ assessment output validation fails without missions README (1.9007ms)
✔ assessment output validation fails when too many missions are written (3.6653ms)
✔ assessment output validation fails for mission Markdown outside missions directory (3.3147ms)
✔ dry run writes assessment prompt without invoking Codex (6.0548ms)
✔ assessment-pack-only creates pack and exits before Codex or missions (11.7281ms)
✔ external mission dry run discovers provided folder without assessment prompt (5.5403ms)
✔ external mission run skips assessment spawn and passes folder to mission runner (12.5624ms)
✔ external coherence review writes evidence pack without Codex coherence spawn (12.5294ms)
✔ dry run still rejects danger-full-access without explicit allow flag (0.5619ms)
✔ frontmatter parser supports scalars, empty arrays, and block arrays (0.0853ms)
✔ mission discovery recursively excludes README files (4.8503ms)
✔ mission title is inferred from the first markdown heading (1.8067ms)
✔ affected files are inferred from body text when files exist (3.5152ms)
✔ batch planning prevents overlap on affected files (0.3935ms)
✔ batch planning prevents overlap on affected node neighborhoods (0.1319ms)
✔ high-risk missions are isolated from other missions (0.0744ms)
✔ global shared files are not parallel-safe for writable missions (0.1028ms)
✔ dry-run prints commands without spawning Codex (4.0163ms)
✔ plan surfaces workspace-write concurrency blocker without failing planning (3.8921ms)
✔ workspace-write execution blocks concurrency without worktrees before spawning Codex (4.6161ms)
✔ plan surfaces danger-full-access blocker without failing planning (3.1737ms)
✔ plan omits execution blocker for explicitly allowed danger-full-access (3.6307ms)
✔ default queue uses automation missions and skips completed runtime entries (3.917ms)
✔ legacy basename runtime entries do not collide across duplicate basenames (5.9869ms)
✔ mission-folder-relative runtime entries skip only the intended duplicate basename (5.4544ms)
✔ runtime-only completion exits with an explicit no pending message (4.1798ms)
✔ execution uses an injected Codex process and writes final output (9.885ms)
✔ workspace-write execution with worktrees creates a real git worktree (244.0124ms)
✔ parallel-safe read-only execution writes one batch summary for the batch (10.6378ms)
✔ runtime updates record repo-relative paths for duplicate basenames (10.9949ms)
✔ filesMatching recursively returns sorted matching files (2.7505ms)
✔ collectTestFiles discovers nested package and script tests (7.3928ms)
✔ small web app fixture scans checkout files and builds useful context (10.4631ms)
✔ checkout coordinates cart, payment, and order services (25.2696ms)
✔ checkout propagates cart and payment validation errors (10.3149ms)
✔ cart and payment services reject invalid inputs (12.3078ms)
ℹ tests 337
ℹ suites 0
ℹ pass 337
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 11261.4682

EXIT CODE: 0
END: 2026-05-15T10:47:22.4978439-04:00
```

### npm run pack:smoke

```text
COMMAND: npm run pack:smoke
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:47:31.1623740-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 pack:smoke
> node scripts/pack-smoke-test.mjs

pack smoke: @abstraction-tree/core dry-run and tarball checks passed
pack smoke: @abstraction-tree/cli dry-run and tarball checks passed
pack smoke: @abstraction-tree/app dry-run and tarball checks passed
pack smoke: abstraction-tree dry-run and tarball checks passed
pack smoke: installed package commands passed

EXIT CODE: 0
END: 2026-05-15T10:47:42.4495456-04:00
```

### npm run release:dry-run -- --version 0.2.0-beta.1

```text
COMMAND: npm run release:dry-run -- --version 0.2.0-beta.1
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:47:42.5855438-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 release:dry-run
> node scripts/release-dry-run.mjs --version 0.2.0-beta.1

release dry-run: package smoke and installability checks passed
release dry-run: @abstraction-tree/core publish dry-run passed
release dry-run: @abstraction-tree/cli publish dry-run passed
release dry-run: @abstraction-tree/app publish dry-run passed
release dry-run: abstraction-tree publish dry-run passed

EXIT CODE: 0
END: 2026-05-15T10:47:55.6934215-04:00
```

### npm run atree:scan

```text
COMMAND: npm run atree:scan
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:47:55.8384227-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 atree:scan
> node packages/cli/dist/index.js scan --project .

Scanned 194 files and built 513 tree nodes.
View the project map:
  atree serve --project . --open

EXIT CODE: 0
END: 2026-05-15T10:47:56.4894259-04:00
```

### npm run atree:validate

```text
COMMAND: npm run atree:validate
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:47:56.6304268-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 atree:validate
> node packages/cli/dist/index.js validate --project . --strict

No validation issues found.

EXIT CODE: 0
END: 2026-05-15T10:47:57.6859060-04:00
```

### npm run atree:evaluate

```text
COMMAND: npm run atree:evaluate
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:47:57.8210891-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 atree:evaluate
> node packages/cli/dist/index.js evaluate --project .

Wrote evaluation report to .abstraction-tree/evaluations/2026-05-15-1047-evaluation.json
{
  "timestamp": "2026-05-15T14:47:58.174Z",
  "tree": {
    "nodeCount": 513,
    "orphanNodeCount": 0,
    "nodesWithoutSummaries": 0,
    "nodesWithoutExplanations": 0,
    "thinExplanationCount": 0,
    "averageExplanationLength": 778.26,
    "filesWithoutOwners": 0
  },
  "context": {
    "lastPackCount": 2,
    "averageFilesPerPack": 17,
    "averageConceptsPerPack": 9.5,
    "possibleOverBroadPacks": 0
  },
  "drift": {
    "staleFileCount": 0,
    "missingFileCount": 0
  },
  "runs": {
    "runReportCount": 69,
    "successCount": 44,
    "partialCount": 25,
    "failedCount": 0,
    "noOpCount": 0
  },
  "changes": {
    "totalChangeRecordCount": 36,
    "generatedScanRecordCount": 3,
    "semanticChangeRecordCount": 33,
    "eligibleGeneratedScanRecordCount": 1,
    "changeReviewIssueCount": 0,
    "generatedScanReviewNeeded": false,
    "retainedGeneratedScanRecordId": "scan.1778856476464"
  },
  "lessons": {
    "lessonCount": 68,
    "duplicateLessonCandidates": 0
  },
  "automation": {
    "runtimeStateIgnored": true,
    "configValid": true
  },
  "quality": {
    "fixture": {
      "path": ".abstraction-tree/evaluation-fixture.json",
      "expectedTreeNodeCount": 9,
      "missingExpectedTreeNodeCount": 0,
      "missingExpectedTreeNodeIds": [],
      "expectedArchitectureNodeCount": 5,
      "missingExpectedArchitectureNodeCount": 0,
      "missingExpectedArchitectureNodeIds": [],
      "expectedConceptCount": 7,
      "missingExpectedConceptCount": 0,
      "missingExpectedConceptIds": [],
      "expectedInvariantCount": 2,
      "missingExpectedInvariantCount": 0,
      "missingExpectedInvariantIds": []
    },
    "concepts": {
      "totalConceptCount": 32,
      "noisyConceptCount": 0,
      "noisyConceptIds": [],
      "conceptsWithoutEvidence": 0,
      "conceptsWithoutRelatedFiles": 0
    },
    "imports": {
      "unresolvedImportCount": 0
    },
    "architecture": {
      "architectureNodeCount": 8,
      "architectureCoverableFileCount": 137,
      "architectureCoveredFileCount": 72,
      "architectureCoveragePercent": 52.55
    },
    "context": {
      "evaluatedContextPackCount": 2,
      "expectedContextPackCount": 1,
      "passingExpectedContextPackCount": 1,
      "missingExpectedInclusionCount": 0,
      "missingExpectedInclusions": [],
      "expectedContextPackCeilingViolationCount": 0,
      "expectedContextPackCeilingViolations": []
    }
  },
  "issues": []
}

EXIT CODE: 0
END: 2026-05-15T10:47:58.8897739-04:00
```

### npm run atree -- doctor --project . --strict

```text
COMMAND: npm run atree -- doctor --project . --strict
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:47:59.0227747-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 atree
> node packages/cli/dist/index.js doctor --project . --strict

Abstraction Tree doctor

Project: abstraction-tree
Node: ok (24.14.0 satisfies >=20.19.0)
Config: ok
Memory: ok (194 files, 513 nodes, 32 concepts, 2 invariants, 36 changes)
Import graph: ok
Runtime schema: ok
Validation: ok
Self dogfooding memory: ok for Abstraction Tree package
Automation runtime boundary: ok
Visual app: available (C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree\packages\app\dist)
Next step: npm run assessment:pack

EXIT CODE: 0
END: 2026-05-15T10:48:00.0216627-04:00
```

### npm run diff:summary

```text
COMMAND: npm run diff:summary
CWD: C:\Users\Sam\AppData\Local\Temp\abstraction-tree-release-gate-20260515-104624\abstraction-tree
START: 2026-05-15T10:48:00.1546627-04:00


> abstraction-tree-monorepo@0.2.0-beta.1 diff:summary
> node scripts/diff-summary.mjs

# Diff Summary Since Last Commit

Base: c332bfa Document npm beta verification

## Totals
Changed files: 2
Lines: +112 / -0 / 112 total
Source files: 0
Test files: 0
Docs files: 0
Memory files: 2
Generated memory files: 2
Automation files: 0
Package files: 0
CI files: 0
App files: 0
Areas: generated-memory, memory

## Dangerous Changes
None detected.

## Possible Overreach
None detected.

## Files
- A .abstraction-tree/changes/scan.1778856476464.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/evaluations/2026-05-15-1047-evaluation.json (+89/-0) [generated-memory, memory]

EXIT CODE: 0
END: 2026-05-15T10:48:00.4868622-04:00
```
