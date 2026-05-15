# Current Release Gate Evidence

> Candidate evidence only. This file does not declare v1 readiness; maintainer signoff is still required.

Result: pass

This evidence captures the documented v1 release-gate command list for the current working tree. A failed command is recorded as blocker evidence, not hidden or converted into a pass.

## Run Metadata

- Started: 2026-05-15T22:16:44.712Z
- Ended: 2026-05-15T22:17:40.068Z
- Repository: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
- Evidence file: docs/release-evidence/2026-05-15-current-gate.md
- Candidate version: 0.2.0-beta.1
- Git HEAD: a85d7e4a151a9e6b83e50b54c7e355ded42e1017
- Git branch: main

## Environment

- OS: Windows_NT 10.0.26200 x64
- Platform: win32
- Node: v24.14.0
- npm: 11.9.0
- Git: git version 2.53.0.windows.2

## Git Status Before

```text
## main...origin/main
 M .abstraction-tree/changes/context-pack-fixture-expectation.2026-05-08.json
 M .abstraction-tree/concepts.json
 M .abstraction-tree/evaluation-fixture.json
 M .abstraction-tree/files.json
 M .abstraction-tree/import-graph.json
 M .abstraction-tree/invariants.json
 M .abstraction-tree/ontology.json
 M .abstraction-tree/tree.json
 M README.md
 M docs/ARCHITECTURE.md
 M docs/CONFIGURATION.md
 M docs/DATA_MODEL.md
 M docs/ROADMAP.md
 M docs/SCOPE_CONTRACTS.md
 M docs/STABLE_VS_EXPERIMENTAL.md
 M docs/V1_RELEASE_CANDIDATE_REVIEW.md
 M docs/V1_RELEASE_GATE.md
 M docs/VISUAL_DEMO.md
 M docs/release-evidence/2026-05-15-diverse-repository-beta-evaluation.md
 M packages/app/src/app.test.tsx
 M packages/app/src/components/GoalWorkflowPanel.tsx
 M packages/cli/src/apiState.test.ts
 M packages/cli/src/apiState.ts
 M packages/cli/src/doctor.test.ts
 M packages/cli/src/doctor.ts
 M packages/cli/src/index.ts
 M packages/cli/src/serveCommand.test.ts
 M packages/cli/src/serveHost.test.ts
 M packages/cli/src/serveHost.ts
 M packages/core/package.json
 M packages/core/src/context.test.ts
 M packages/core/src/context.ts
 M packages/core/src/diffSummary.test.ts
 M packages/core/src/diffSummary.ts
 M packages/core/src/evaluator.test.ts
 M packages/core/src/evaluator.ts
 M packages/core/src/goal.test.ts
 M packages/core/src/goal.ts
 M packages/core/src/importGraph.test.ts
 M packages/core/src/importGraph.ts
 M packages/core/src/promptRouter.test.ts
 M packages/core/src/promptRouter.ts
 M packages/core/src/runtimeSchema.test.ts
 M packages/core/src/runtimeSchema.ts
 M packages/core/src/scanner.test.ts
 M packages/core/src/scanner.ts
 M packages/core/src/schema.ts
 M packages/core/src/scope.test.ts
 M packages/core/src/scope.ts
 M packages/core/src/treeBuilder.test.ts
 M packages/core/src/treeBuilder.ts
 M packages/core/src/validator.ts
 M packages/core/src/workspace.test.ts
 M packages/core/src/workspace.ts
?? .abstraction-tree/changes/2026-05-15-context-quality-benchmarks.json
?? .abstraction-tree/changes/scan.1778871776283.json
?? .abstraction-tree/changes/scan.1778872558408.json
?? .abstraction-tree/changes/scan.1778873095728.json
?? .abstraction-tree/changes/scan.1778873546528.json
?? .abstraction-tree/changes/scan.1778873672388.json
?? .abstraction-tree/changes/scan.1778874602344.json
?? .abstraction-tree/changes/scan.1778875323278.json
?? .abstraction-tree/changes/scan.1778876483543.json
?? .abstraction-tree/changes/scan.1778877144482.json
?? .abstraction-tree/changes/scan.1778877903284.json
?? .abstraction-tree/changes/scan.1778878773023.json
?? .abstraction-tree/changes/scan.1778879589256.json
?? .abstraction-tree/changes/scan.1778880233843.json
?? .abstraction-tree/changes/scan.1778880861156.json
?? .abstraction-tree/changes/scan.1778881234435.json
?? .abstraction-tree/changes/scan.1778881429796.json
?? .abstraction-tree/changes/scan.1778881579584.json
?? .abstraction-tree/changes/scan.1778881652232.json
?? .abstraction-tree/changes/scan.1778883233874.json
?? .abstraction-tree/changes/scan.1778883327783.json
?? .abstraction-tree/changes/scan.1778883343850.json
?? .abstraction-tree/missions/
?? docs/release-evidence/2026-05-15-current-gate.md
?? examples/context-quality-benchmarks/
?? packages/cli/src/index.test.ts
?? scripts/capture-release-gate-evidence.mjs
?? scripts/capture-release-gate-evidence.test.mjs
```

## Command Summary

| Command | Status | Exit code |
| --- | --- | --- |
| `npm run format:check` | Pass | 0 |
| `npm run check:unicode` | Pass | 0 |
| `npm run docs:commands` | Pass | 0 |
| `npm run lint` | Pass | 0 |
| `npm run audit:security` | Pass | 0 |
| `npm run typecheck` | Pass | 0 |
| `npm run build` | Pass | 0 |
| `npm run coverage` | Pass | 0 |
| `npm run package:size` | Pass | 0 |
| `npm run pack:smoke` | Pass | 0 |
| `npm run release:dry-run -- --version 0.2.0-beta.1` | Pass | 0 |
| `npm run atree:scan` | Pass | 0 |
| `npm run atree:validate` | Pass | 0 |
| `npm run atree:evaluate` | Pass | 0 |
| `npm run atree -- doctor --project . --strict` | Pass | 0 |
| `npm run diff:summary` | Pass | 0 |

## Git Status After

```text
## main...origin/main
 M .abstraction-tree/changes/context-pack-fixture-expectation.2026-05-08.json
 M .abstraction-tree/concepts.json
 M .abstraction-tree/evaluation-fixture.json
 M .abstraction-tree/files.json
 M .abstraction-tree/import-graph.json
 M .abstraction-tree/invariants.json
 M .abstraction-tree/ontology.json
 M .abstraction-tree/tree.json
 M README.md
 M docs/ARCHITECTURE.md
 M docs/CONFIGURATION.md
 M docs/DATA_MODEL.md
 M docs/ROADMAP.md
 M docs/SCOPE_CONTRACTS.md
 M docs/STABLE_VS_EXPERIMENTAL.md
 M docs/V1_RELEASE_CANDIDATE_REVIEW.md
 M docs/V1_RELEASE_GATE.md
 M docs/VISUAL_DEMO.md
 M docs/release-evidence/2026-05-15-diverse-repository-beta-evaluation.md
 M packages/app/src/app.test.tsx
 M packages/app/src/components/GoalWorkflowPanel.tsx
 M packages/cli/src/apiState.test.ts
 M packages/cli/src/apiState.ts
 M packages/cli/src/doctor.test.ts
 M packages/cli/src/doctor.ts
 M packages/cli/src/index.ts
 M packages/cli/src/serveCommand.test.ts
 M packages/cli/src/serveHost.test.ts
 M packages/cli/src/serveHost.ts
 M packages/core/package.json
 M packages/core/src/context.test.ts
 M packages/core/src/context.ts
 M packages/core/src/diffSummary.test.ts
 M packages/core/src/diffSummary.ts
 M packages/core/src/evaluator.test.ts
 M packages/core/src/evaluator.ts
 M packages/core/src/goal.test.ts
 M packages/core/src/goal.ts
 M packages/core/src/importGraph.test.ts
 M packages/core/src/importGraph.ts
 M packages/core/src/promptRouter.test.ts
 M packages/core/src/promptRouter.ts
 M packages/core/src/runtimeSchema.test.ts
 M packages/core/src/runtimeSchema.ts
 M packages/core/src/scanner.test.ts
 M packages/core/src/scanner.ts
 M packages/core/src/schema.ts
 M packages/core/src/scope.test.ts
 M packages/core/src/scope.ts
 M packages/core/src/treeBuilder.test.ts
 M packages/core/src/treeBuilder.ts
 M packages/core/src/validator.ts
 M packages/core/src/workspace.test.ts
 M packages/core/src/workspace.ts
?? .abstraction-tree/changes/2026-05-15-context-quality-benchmarks.json
?? .abstraction-tree/changes/scan.1778871776283.json
?? .abstraction-tree/changes/scan.1778872558408.json
?? .abstraction-tree/changes/scan.1778873095728.json
?? .abstraction-tree/changes/scan.1778873546528.json
?? .abstraction-tree/changes/scan.1778873672388.json
?? .abstraction-tree/changes/scan.1778874602344.json
?? .abstraction-tree/changes/scan.1778875323278.json
?? .abstraction-tree/changes/scan.1778876483543.json
?? .abstraction-tree/changes/scan.1778877144482.json
?? .abstraction-tree/changes/scan.1778877903284.json
?? .abstraction-tree/changes/scan.1778878773023.json
?? .abstraction-tree/changes/scan.1778879589256.json
?? .abstraction-tree/changes/scan.1778880233843.json
?? .abstraction-tree/changes/scan.1778880861156.json
?? .abstraction-tree/changes/scan.1778881234435.json
?? .abstraction-tree/changes/scan.1778881429796.json
?? .abstraction-tree/changes/scan.1778881579584.json
?? .abstraction-tree/changes/scan.1778881652232.json
?? .abstraction-tree/changes/scan.1778883233874.json
?? .abstraction-tree/changes/scan.1778883327783.json
?? .abstraction-tree/changes/scan.1778883343850.json
?? .abstraction-tree/changes/scan.1778883456795.json
?? .abstraction-tree/evaluations/2026-05-15-1817-evaluation.json
?? .abstraction-tree/missions/
?? docs/release-evidence/2026-05-15-current-gate.md
?? examples/context-quality-benchmarks/
?? packages/cli/src/index.test.ts
?? scripts/capture-release-gate-evidence.mjs
?? scripts/capture-release-gate-evidence.test.mjs
```

## Command Outputs

### npm run format:check

````text
COMMAND: npm run format:check
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:44.896Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 format:check
> node scripts/format.mjs --check

Formatting check passed.

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:16:45.159Z
````

### npm run check:unicode

````text
COMMAND: npm run check:unicode
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:45.159Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 check:unicode
> node scripts/check-unicode.mjs

No suspicious Unicode control characters found.

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:16:45.427Z
````

### npm run docs:commands

````text
COMMAND: npm run docs:commands
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:45.428Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 docs:commands
> node scripts/check-doc-commands.mjs

Documentation command check passed.

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:16:45.573Z
````

### npm run lint

````text
COMMAND: npm run lint
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:45.573Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 lint
> node scripts/lint.mjs

Lint passed (193 files checked).

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:16:46.063Z
````

### npm run audit:security

````text
COMMAND: npm run audit:security
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:46.063Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 audit:security
> npm audit --audit-level=high

found 0 vulnerabilities

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:16:46.656Z
````

### npm run typecheck

````text
COMMAND: npm run typecheck
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:46.656Z

STDOUT:

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

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:16:51.061Z
````

### npm run build

````text
COMMAND: npm run build
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:51.061Z

STDOUT:

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
transforming...✓ 1580 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.40 kB │ gzip:  0.26 kB
dist/assets/index-CBR2feHU.css   11.85 kB │ gzip:  2.88 kB
dist/assets/index-WJnh1Im-.js   174.11 kB │ gzip: 55.22 kB

[32m✓ built in 146ms[39m

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:16:54.740Z
````

### npm run coverage

````text
COMMAND: npm run coverage
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:16:54.740Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 coverage
> node scripts/run-coverage.mjs

✔ validateAutomation accepts valid committed config and ignored runtime state (520.7731ms)
✔ validateAutomation ignores projects without automation state (1.2745ms)
✔ validateAutomation accepts BOM-prefixed automation JSON (393.6419ms)
✔ validateAutomation reports legacy loop-state.json (415.0856ms)
✔ validateAutomation reports volatile runtime fields in committed config (391.5194ms)
✔ validateAutomation reports invalid automation config values (385.3365ms)
✔ validateAutomation reports invalid automation runtime example values (393.7125ms)
✔ validateAutomation reports invalid mission runtime example values (408.0825ms)
✔ validateAutomation reports missing config and runtime example files (382.4967ms)
✔ validateAutomation reports local runtime artifact paths when they are not ignored (391.2383ms)
✔ validateAutomation uses root gitignore fallback for runtime artifact paths (391.7515ms)
✔ validateAutomation warns when local runtime artifact paths are tracked (7.0408ms)
✔ reviewChangeRecords marks older generated scans as consolidation candidates (10.7742ms)
✔ buildChangeRecordReviewSummary returns compact deterministic counts (4.4393ms)
✔ limitChangeRecordReviewReport bounds generated scan details while preserving counts (4.2345ms)
✔ reviewChangeRecords reports malformed change files without mutating them (2.7766ms)
✔ reviewChangeRecords preserves generated scans referenced by semantic records (4.5811ms)
✔ pruneGeneratedScanRecords dry-runs by default and keeps files (3.6314ms)
✔ pruneGeneratedScanRecords deletes only superseded generated scan records (4.8927ms)
✔ pruneGeneratedScanRecords refuses to delete when change records have errors (4.0135ms)
✔ buildContextPack pulls concept-related files and nodes into vague target queries (2.9758ms)
✔ buildContextPack scores symbols and exports, not just file paths (0.3758ms)
✔ buildContextPack scores and emits node explanations (0.4808ms)
✔ buildContextPack uses the project explanation as project summary when available (0.1377ms)
✔ buildContextPack falls back to owned files when source files are empty (0.1623ms)
✔ buildContextPack falls back to dependsOn when dependencies are empty (0.1933ms)
✔ buildContextPack keeps generated packs below over-broad evaluation thresholds (3.9957ms)
✔ buildContextPack records scoring diagnostics and nearby exclusions when requested (3.5601ms)
✔ buildContextPack applies max token budget to selected context items (1.3902ms)
✔ buildContextPack preserves representative selected-node files by compacting rich nodes under tight budgets (0.5304ms)
✔ buildContextPack ranks Rust traversal source and tests ahead of dependency metadata (0.4798ms)
✔ buildContextPack ranks Click option parser source and tests ahead of broad docs (0.5506ms)
✔ buildContextPack preserves route-estimated files for the same prompt (1.4321ms)
✔ context-quality benchmarks cover diverse repository findings (108.4153ms)
✔ formatContextPackMarkdown emits markdown context packs (0.4431ms)
✔ buildDiffSummary accepts a safe small diff (0.6836ms)
✔ buildDiffSummary flags broad overreach (0.1705ms)
✔ buildDiffSummary detects dangerous file changes (0.16ms)
✔ buildDiffSummary detects generated memory files (0.1379ms)
✔ buildDiffSummary reports review-specific overreach categories (0.1495ms)
✔ evaluateProject counts tree nodes (409.7908ms)
✔ evaluateProject reports explanation completeness metrics (393.9863ms)
✔ evaluateProject detects missing ownership (390.0998ms)
✔ evaluateProject counts run reports by result (392.3824ms)
✔ evaluateProject reports generated scan buildup with one retained scan (413.8509ms)
✔ evaluateProject keeps semantic records separate from generated scan eligibility (415.3539ms)
✔ evaluateProject does not warn when generated scan count is below threshold (397.9945ms)
✔ evaluateProject reports automation config status (387.0971ms)
✔ evaluateProject flags context packs at over-broad boundaries (433.8813ms)
✔ evaluateProject accepts BOM-prefixed metadata JSON (381.0838ms)
✔ evaluateProject reports generated-memory quality regressions (393.8009ms)
✔ evaluateProject excludes classified asset, generated, and virtual imports from source unresolved warnings (396.335ms)
✔ evaluateProject warns when expected context pack exceeds fixture ceilings (407.2131ms)
✔ evaluateProject validates context-pack fixture ceilings (383.6474ms)
✔ evaluateProject checks expected prompt route inclusions (386.7346ms)
✔ evaluation output is serializable (389.0843ms)
✔ formatTreeMermaid exports tree nodes and parent edges (0.3542ms)
✔ formatTreeDot exports Graphviz-compatible tree edges (0.1662ms)
✔ goal planner creates deterministic goal workspace artifacts (3.8403ms)
✔ goal planner writes create-pr planning body without execution claims (0.838ms)
✔ goal planner carries route-estimated files into affected tree and missions (0.8109ms)
✔ goal planner derives mission shapes for external repository conventions (7.5922ms)
✔ goal planner applies mission planning overrides (0.6767ms)
✔ buildImportGraphFromFiles resolves relative extensionless, JS-suffixed, and index imports (0.4137ms)
✔ buildImportGraphFromFiles resolves ESM and CommonJS module variant imports (0.1711ms)
✔ buildImportGraph resolves workspace package imports and separates external and unresolved imports (5.9442ms)
✔ buildImportGraph discovers pnpm workspace packages and resolves workspace imports (7.3401ms)
✔ buildImportGraph merges package.json and pnpm workspace package roots (6.1743ms)
✔ buildImportGraph respects pnpm workspace exclusion patterns (5.8611ms)
✔ buildImportGraph resolves relative generated package artifact imports to scanned source files (5.1145ms)
✔ buildImportGraph resolves TypeScript paths aliases with baseUrl, rootDirs, and specific pattern conflicts (6.1982ms)
✔ buildImportGraph resolves Vite resolve.alias entries (2.9893ms)
✔ buildImportGraph resolves Webpack aliases and reports matched aliases with missing targets (2.3753ms)
✔ buildImportGraphFromFiles resolves configured alias hooks and diagnoses unconfigured alias-shaped imports (0.2899ms)
✔ buildImportGraphFromFiles classifies static asset, generated artifact, and virtual imports (0.323ms)
✔ buildImportGraphFromFiles keeps genuinely missing relative source imports unresolved (0.1656ms)
✔ buildImportGraphFromFiles resolves Python relative and package imports (0.1925ms)
✔ buildImportGraphFromFiles resolves Rust module and crate imports (0.363ms)
✔ buildImportGraphFromFiles resolves Go module imports and reports local misses (0.3525ms)
✔ buildImportGraphFromFiles resolves Markdown links to scanned local docs and code (0.2868ms)
✔ buildImportGraphFromFiles detects non-JS local dependency cycles (0.2324ms)
✔ buildImportGraphFromFiles detects file import cycles (0.1633ms)
✔ core exports LLM abstraction types and deterministic no-op builder (0.2154ms)
✔ validates materialized LLM ontology and tree proposals (1.1449ms)
✔ blocks malformed LLM proposal output before it can be reviewed for application (0.3161ms)
✔ blocks unsafe destructive and canonical-memory tree proposals (0.2175ms)
✔ creates review-gated proposal records (0.2586ms)
✔ current-version memory plans no migration changes (0.9663ms)
✔ future memory versions block migration with an actionable issue (3.1913ms)
✔ dry run does not write memory files (2.7702ms)
✔ workspace migration validates current-version fixture output (2.0848ms)
✔ requested source version must match the workspace config (2.5519ms)
✔ unsupported older schema versions require an explicit migration path (2.1806ms)
✔ current-version no-op migration does not create backups (1.6375ms)
✔ router sends simple documentation typo prompts to direct (0.3066ms)
✔ router keeps small code bug fixes direct when memory points to a narrow area (0.1991ms)
✔ shared prompt evidence scorer ranks files, nodes, and concepts deterministically (0.1396ms)
✔ router sends complex multi-area implementation prompts to goal-driven (0.1809ms)
✔ router sends broad strategy prompts to assessment packs (0.1411ms)
✔ router sends destructive safety-bypass prompts to manual review (0.1625ms)
✔ router does not treat negated safety constraints as the requested action (0.1532ms)
✔ router does not treat ambiguous high-impact rewrites as direct (0.1979ms)
✔ router handles missing abstraction memory with reduced confidence (0.1444ms)
✔ summarizeRunMarkdown reads current task heading (0.0806ms)
✔ summarizeRunMarkdown keeps legacy task chosen heading compatibility (0.0615ms)
✔ summarizeRunMarkdown recognizes no-op result spellings (0.0425ms)
✔ summarizeRunMarkdown stops sections at the next heading (0.0274ms)
✔ runtime schema accepts valid v0.1 memory shapes (1.0418ms)
✔ api state schema rejects missing app-required top-level fields (0.1883ms)
✔ custom config override schema validates project-specific scanner settings (0.1885ms)
✔ loadAtreeMemory treats missing memory files as empty valid collections (2.7985ms)
✔ loadAtreeMemory reports malformed JSON with file, field, severity, and recovery hint (2.8466ms)
✔ loadAtreeMemory reports malformed memory shape at the failing field path (3.0737ms)
✔ loadChangeRecords reports malformed JSON while tolerant reads keep valid records (3.4782ms)
✔ loadAtreeMemory reports non-object change JSON with recovery guidance (3.1729ms)
✔ loadAtreeMemory reports malformed change record shapes with file paths and hints (3.0465ms)
✔ future config schema versions stop loading with migration guidance (2.5623ms)
✔ summarizeFile uses AST facts for TypeScript and TSX (1.2697ms)
✔ summarizeFile keeps module extension metadata aligned (1.354ms)
✔ summarizeFile keeps regex scanning for non-JS languages (1.2396ms)
✔ summarizeFile uses README intro prose as project purpose evidence (0.1916ms)
✔ summarizeFile labels expanded regex extension coverage (0.2484ms)
✔ scanProject includes MJS script tests with AST facts (3.2357ms)
✔ scanProject includes expanded language extension fixtures (10.9031ms)
✔ scanProject skips large and binary files for supported extensions (3.5673ms)
✔ scanProject walks sourceRoot and preserves project-relative paths (3.1991ms)
✔ scanProject honors glob ignores and keeps default directory ignores (5.6093ms)
✔ scanProject honors negated ignore patterns (4.7581ms)
✔ scanProject reads root gitignore patterns when configured (5.2002ms)
✔ buildScopeContract maps ambiguous tree UI prompts to app tree files (1.555ms)
✔ checkScope blocks files outside the contract while allowing generated memory refreshes (0.7589ms)
✔ checkScope reports clean when changed files stay inside the contract (0.3945ms)
✔ buildScopeContract includes route-estimated files in allowed scope (0.4616ms)
✔ buildScopeContract grounds scope files with concept, import, and nearby test evidence (0.4839ms)
✔ checkScope reports review-specific overreach categories (0.1633ms)
✔ buildDeterministicTree infers concepts from repo-specific paths and symbols (0.6502ms)
✔ buildDeterministicTree uses README purpose for the root project node (0.3082ms)
✔ buildDeterministicTree generates human-readable explanations for high-level and ownership nodes (0.6106ms)
✔ buildDeterministicTree puts inferred human subsystems at the first layer (5.167ms)
✔ buildDeterministicTree does not invent an app subsystem without app evidence (0.4354ms)
✔ buildDeterministicTree keeps repo concept fixtures stable and filters documentation filler (2.0522ms)
✔ buildDeterministicTree prunes filler concepts and preserves configured domain vocabulary (0.6468ms)
✔ concept quality validation and evaluation flag filler concepts (0.3264ms)
✔ buildDeterministicTree applies configured subsystem patterns (3.5304ms)
✔ buildDeterministicTree uses selected profile config to alter subsystem structure (2.5925ms)
✔ buildDeterministicTree applies configured domain vocabulary and concept weights (0.637ms)
✔ buildDeterministicTree populates architecture nodes for the Abstraction Tree package shape (2.2301ms)
✔ buildDeterministicTree infers Python package architecture for Click-style packages (1.4074ms)
✔ buildDeterministicTree infers Rust CLI architecture for fd-style crates (0.9109ms)
✔ buildDeterministicTree infers documentation book architecture for mdBook-style repositories (2.0075ms)
✔ buildDeterministicTree infers API, UI, and dataflow architecture for a small web app fixture (0.8311ms)
✔ formatTreeAsMermaid emits deterministic node declarations and tree edges (0.2829ms)
✔ formatTreeAsDot emits Graphviz with parent fallback edges and escaped labels (0.1212ms)
✔ detectFileDrift reports stale file summaries and new files (0.6517ms)
✔ detectFileDrift ignores platform line ending size differences when content hash matches (0.201ms)
✔ detectFileDrift uses legacy signatures when only one side has a content hash (0.4416ms)
✔ detectFileDrift reports files removed from disk (0.1694ms)
✔ detectFileDrift falls back to ownedFiles when sourceFiles is empty (0.0914ms)
✔ validateTree reports parent and children link mismatches (0.1089ms)
✔ validateTree reports parent cycles even when links are bidirectional (0.1039ms)
✔ validateTree reports duplicate node ids before map lookups collapse them (0.0848ms)
✔ validateTree reports duplicate file paths before path lookups collapse them (0.2973ms)
✔ validateTree falls back to ownedFiles when sourceFiles is empty (0.0944ms)
✔ validateTree reports duplicate ontology level ids before ontology lookups collapse them (0.0947ms)
✔ validateTree reports duplicate ontology level names (0.0552ms)
✔ validateTree reports invalid ontology rank shapes (0.086ms)
✔ validateTree reports invalid ontology confidence values (0.0644ms)
✔ validateTree reports invalid node confidence values (0.0631ms)
✔ validateTree warns gently for missing or thin high-level explanations (0.0983ms)
✔ validateConcepts reports duplicate concept ids before context de-duplication (0.0748ms)
✔ validateConcepts reports concept references to missing nodes and files (0.2234ms)
✔ validateInvariants reports duplicate invariant ids before invariant lookups collapse them (0.2257ms)
✔ validateInvariants reports invariant references to missing nodes and files (0.2345ms)
✔ validateInvariants reports tree nodes that reference missing invariant ids (0.0669ms)
✔ validateChanges reports duplicate ids and missing node, file, and invariant references (0.4499ms)
✔ validateChanges reports malformed change record shapes before checking references (0.1209ms)
✔ readJson accepts JSON files with a leading BOM (2.6654ms)
✔ ensureWorkspace creates a blank project-local workspace (2.9265ms)
✔ ensureWorkspace preserves visual app artifact policy (3.8679ms)
✔ scan memory for a temporary project is generated from that project (9.0251ms)
✔ readEffectiveConfig merges global and root custom overrides (5.9386ms)
✔ readEffectiveConfig merges selected profile before project overrides (4.0103ms)
✔ summarizeRunMarkdown reads current task heading (0.08ms)
✔ summarizeRunMarkdown keeps legacy task chosen heading compatibility (0.0392ms)
✔ summarizeRunMarkdown recognizes no-op result spellings (0.0485ms)
✔ /api/state loader returns fixture memory using the shared core state contract (8.8951ms)
✔ /api/state supplies stable defaults when optional health files are missing (2.9659ms)
✔ /api/state agent health surfaces the latest scope contract status (6.2807ms)
✔ /api/state exposes redacted goal workflow visual data (18.4033ms)
✔ /api/artifact can be disabled from visual app config (4.9314ms)
✔ /api/artifact redacts common secret-like forms in text artifacts (3.5241ms)
✔ /api/state contract rejects missing app-required top-level fields (7.7134ms)
✔ /api/state contract validates workflow view shape (14.056ms)
✔ changes review --limit bounds CLI output while preserving counts (5.1328ms)
✔ changes review rejects invalid --limit input (1.3522ms)
✔ changes prune-generated dry-runs unless --apply is provided (3.0644ms)
✔ changes prune-generated --apply deletes superseded generated scan records (2.9058ms)
✔ doctor reports an empty project as uninitialized (1.294ms)
✔ doctor guides an initialized project without a scan to run scan (6.6799ms)
✔ doctor reports valid memory as ok (14.4304ms)
✔ doctor warns when external projects contain Abstraction Tree dogfooding memory (14.9038ms)
✔ doctor does not warn when an external project merely documents Abstraction Tree commands (14.3108ms)
✔ doctor does not warn for book-like projects with generic subsystem ids (25.6834ms)
✔ doctor resolves visual app checks from the project root (13.9123ms)
✔ doctor surfaces runtime schema issues from memory loading (8.452ms)
✔ doctor strict mode treats warnings as failures (5.2154ms)
✔ export command prints Mermaid output from tree memory (235.4125ms)
✔ export command writes DOT output to a project-relative file (235.0916ms)
✔ top-level CLI help labels stable, beta, and experimental command groups (227.8421ms)
✔ goal command plan-only writes a complete workspace and preserves the original goal (21.0884ms)
✔ goal command review-required prints mission runner commands (23.284ms)
✔ goal command prefers repo-local atree scripts for review commands (19.4967ms)
✔ goal command reads mission planning overrides from config (17.3457ms)
✔ goal command auto-route writes route and scope artifacts for goal-driven prompts (18.1931ms)
✔ goal command auto-route stops direct prompts before creating a goal workspace (6.1283ms)
✔ goal command auto-route stops assessment-pack prompts (5.4553ms)
✔ goal command auto-route stops manual-review prompts with manual-review exit (5.9016ms)
✔ goal command force-goal records route override (17.4098ms)
✔ goal command full-auto plans but refuses unsafe execution (17.516ms)
✔ goal command run refuses clearly and writes checks, score, and PR body when requested (17.3303ms)
✔ goal command create-pr writes draft PR body without pushing (16.956ms)
✔ goal command missing file fails clearly (2.0399ms)
✔ scan --profile applies a built-in profile through the CLI (263.3825ms)
✔ scan --profile rejects unknown profile names (235.5571ms)
✔ migrate dry-run formats a clear no-op plan (3.2981ms)
✔ migrate reports unsupported target versions as command failures (2.5368ms)
✔ migrate reports future workspace memory without rewriting config (2.7842ms)
✔ browserOpenCommand chooses the platform browser command (0.1267ms)
✔ openBrowser resolves success without waiting for the browser process (0.2433ms)
✔ openBrowser failure is reported as non-fatal result data (0.0904ms)
✔ propose saves adapter output under proposals without changing canonical memory (13.8479ms)
✔ route command prints readable routing from a prompt file (6.6298ms)
✔ route command supports JSON output from prompt text (5.0947ms)
✔ route command rejects ambiguous input sources (2.4053ms)
✔ goal auto-route stops direct prompts unless forced (5.5573ms)
✔ goal auto-route continues goal-driven prompts (17.6625ms)
✔ scope command writes a prompt scope contract (7.0416ms)
✔ scope check blocks out-of-contract files with injected Git input (7.3697ms)
✔ serve command exposes --open in CLI help (229.6545ms)
✔ scan command exposes custom config options (228.6769ms)
✔ README documents atree serve --open and network token usage (0.3255ms)
✔ serve command refuses non-loopback hosts without a token (231.7677ms)
✔ selectServeHost defaults to loopback without a warning (0.2948ms)
✔ selectServeHost keeps explicit loopback hosts without a warning (0.0817ms)
✔ selectServeHost warns for wildcard and non-loopback hosts (0.097ms)
✔ selectServeAuth allows loopback without a token (0.1651ms)
✔ selectServeAuth requires a token for non-loopback hosts (0.069ms)
✔ selectServeAuth accepts explicit and environment tokens (0.1353ms)
✔ selectServeAuth rejects empty or whitespace tokens (0.1375ms)
✔ isServeRequestAuthorized enforces bearer tokens when configured (0.4273ms)
✔ formatServeUrl brackets IPv6 hosts (0.0744ms)
✔ browserServeUrl prefers loopback for local and wildcard hosts (0.0567ms)
✔ serve project summary makes the resolved project and memory counts explicit (6.6833ms)
✔ serve project summary warns for unscanned workspaces (2.4323ms)
✔ serve project summary warns when serving the Abstraction Tree development repo (3.3903ms)
✔ init guidance for full mode points to scan and serve --open (0.142ms)
✔ scan guidance for full mode points to serve --open (0.0953ms)
✔ scan guidance for core mode explains how to enable the app (0.0438ms)
✔ tree export command prints Mermaid diagrams by default (3.2405ms)
✔ tree export command writes Graphviz diagrams to a project-relative output file (3.6854ms)
✔ tree export command rejects unsupported formats (2.6291ms)
✔ fetchAbstractionState reports failed /api/state responses (10.8509ms)
✔ fetchAbstractionState sends bearer token when supplied (1.7584ms)
✔ readApiTokenFromLocation reads the URL fragment token (0.1539ms)
✔ LoadError renders a useful /api/state error and retry control (3.4278ms)
✔ LoadError renders a token form for unauthorized /api/state responses (0.4768ms)
✔ AppExplorer renders the selected node summary once (8.263ms)
✔ TreeList builds and renders nested parent child relationships (0.7054ms)
✔ TreeList keeps ancestor branches visible when a descendant matches search (0.153ms)
✔ flattenVisibleTreeItems hides descendants until their branch is expanded (0.0877ms)
✔ moveTreeSelection handles arrow and boundary keys (0.0822ms)
✔ mission panels render independently (4.9023ms)
✔ NodeDetails starts with the selected node representation summary (0.3048ms)
✔ GoalWorkflowPanel renders mission stages, scope filters, and report links (1.8523ms)
✔ GoalWorkflowPanel hides artifact links when local artifact serving is disabled (1.4214ms)
✔ app nodeFiles falls back to ownedFiles when sourceFiles is empty (0.123ms)
✔ app nodeFiles prefers non-empty sourceFiles (0.0819ms)
✔ app nodeDependencies falls back to dependsOn when dependencies is empty (0.0439ms)
✔ app node accessors keep compatibility aliases visible (0.044ms)
✔ buildGateCommands constructs the documented gate commands with candidate version (0.1481ms)
✔ resolveNpmInvocation avoids npm.ps1 on Windows (0.2155ms)
✔ formatEvidenceTimestamp emits stable ISO timestamps (0.1452ms)
✔ runGateCommands records failures and continues by default (0.1745ms)
✔ captureReleaseGateEvidence writes failed-command evidence without masking status (213.0328ms)
✔ release checks accept synchronized package versions with a changelog entry (15.1403ms)
✔ release checks reject missing changelog entries and version drift (7.4199ms)
✔ checkDocCommands accepts documented package scripts and CLI commands (5.0708ms)
✔ checkDocCommands reports stale scripts, commands, and doc links (2.7672ms)
✔ formatBytes renders stable binary units (0.0931ms)
✔ parseNpmPackJson extracts npm pack size fields (0.0775ms)
✔ parseNpmPackJson rejects malformed npm pack output (0.1483ms)
✔ evaluatePackageSizes reports package size budget status (0.1194ms)
✔ evaluatePackageSizes fails on tarball, installed, and missing budgets (0.0535ms)
✔ findSuspiciousUnicode reports bidi controls with location and code point (0.1646ms)
✔ sanitizeLine replaces controls with visible placeholders (0.0352ms)
✔ createAssessmentPack creates a timestamped pack folder (12.5699ms)
✔ createAssessmentPack writes all required files (13.2741ms)
✔ assessment prompt states ChatGPT/human strategy and bounded Codex execution (9.7681ms)
✔ assessment prompt and required files include pack safety metadata (10.2076ms)
✔ parseArgs accepts assessment pack safety controls (0.1978ms)
✔ assessment pack redacts default and custom sensitive values (12.5204ms)
✔ assessment pack truncates large artifacts with visible markers (10.8627ms)
✔ assessment pack can omit high-risk artifact classes (13.0111ms)
✔ missing optional source artifacts degrade gracefully (11.6714ms)
✔ runCli reports the generated prompt path (16.4926ms)
✔ runCli reports safety notices for omitted artifacts (10.5375ms)
✔ root npm scripts keep PowerShell commands explicitly Windows-scoped (0.5419ms)
✔ diff-summary Node wrapper reads fixture input without PowerShell (1.8315ms)
✔ PowerShell automation invokes npm through npm.cmd on Windows (0.4508ms)
✔ data model docs describe node explanations (0.4882ms)
✔ generated memory fixture quality stays stable for small web app (18.4864ms)
✔ generated memory fixture quality stays stable for inventory API (8.8995ms)
✔ args require a source folder and import name (0.2344ms)
✔ valid assessment missions are imported under the named manual mission folder (9.2094ms)
✔ README is allowed but is not treated as a mission (1.5927ms)
✔ dry run validates without creating the destination folder (2.1695ms)
✔ non-Markdown files fail before copy (2.6417ms)
✔ missing or invalid frontmatter fails with actionable messages (3.1414ms)
✔ affected files, affected nodes, and dependsOn must be arrays (1.8269ms)
✔ mission body must include required schema headings (2.273ms)
✔ duplicate mission ids fail validation (2.8478ms)
✔ existing destinations require explicit overwrite (5.26ms)
✔ runtime artifact destinations are rejected (1.5895ms)
✔ source and destination folders must not overlap (2.3245ms)
✔ isLintableProjectFile includes source code and skips generated outputs (0.115ms)
✔ isAutonomyClaimProjectFile scopes claim checks to public docs and prompts (0.1428ms)
✔ lintRelativeImportSpecifier enforces NodeNext runtime extensions (0.1057ms)
✔ lintAutonomyClaims reports unqualified public autonomy claims (0.5291ms)
✔ lintAutonomyClaims allows explicit non-goal and historical contexts (0.094ms)
✔ shouldLintNodeNextImportExtensions scopes NodeNext imports to workspace code (0.0762ms)
✔ lintSourceText reports focused tests and debugger statements (0.8654ms)
✔ lintSourceText allows fixture-local extensionless imports outside NodeNext workspaces (0.1491ms)
✔ lintSourceText reports relative imports that cannot run as emitted ESM (0.4704ms)
✔ frontmatter parser supports mission scalar, boolean, and array fields (0.1066ms)
✔ markdown parser reports whether frontmatter was delimited (0.2615ms)
✔ mission markdown validation requires schema values and body headings (0.2076ms)
✔ mission folder validation rejects duplicate ids (3.0969ms)
✔ required body heading list is the canonical contract (0.0607ms)
✔ README routes new users to productization docs and stable demo commands (0.2536ms)
✔ stable vs experimental doc labels core, beta, and experimental surfaces (0.3167ms)
✔ getting started stays on the provider-free beginner path (0.4198ms)
✔ packaging docs and release dry run agree on package smoke preflight (0.5677ms)
✔ release dry run uses explicit npm tags for prerelease versions (0.119ms)
✔ supportsTextProcessing recognizes shared script text extensions (0.0425ms)
✔ fallback project file listing skips transient and generated directories (6.5615ms)
✔ fallback ignores normalize Windows-style runtime paths (0.0641ms)
✔ coverageDirectory resolves the ignored c8 coverage folder (0.0618ms)
✔ resolveC8CliPath points at the project-local c8 binary (0.048ms)
✔ buildCoverageArgs enforces global c8 thresholds and report paths (0.101ms)
✔ coverage excludes scripts, adapters, tests, and example fixture tests from package-source thresholds (0.0309ms)
✔ full-loop args parse safe defaults (0.1315ms)
✔ full-loop args parse safe defaults and explicit controls (0.071ms)
✔ full-loop args parse assessment-pack-only flag (0.0436ms)
✔ full-loop args parse external coherence review flag (0.0396ms)
✔ full-loop rejects assessment-pack-only with mission-source flags (0.079ms)
✔ full-loop rejects external coherence review before post-run context exists (0.056ms)
✔ full-loop rejects skip-codex-assessment without missions folder (0.0351ms)
✔ full-loop rejects missions folder without skip-codex-assessment (0.0352ms)
✔ full-loop rejects danger-full-access without explicit allow flag (0.0358ms)
✔ full-loop accepts danger-full-access with explicit allow flag (0.0232ms)
✔ assessment prompt states full project goal and mission output contract (0.1568ms)
✔ coherence prompt asks whether to stop or repeat (0.093ms)
✔ durable run report records runtime artifact policy (0.0944ms)
✔ durable run report labels external strategy source (0.0421ms)
✔ durable run report marks external coherence review pending (0.0341ms)
✔ valid assessment output passes validation (4.337ms)
✔ assessment output validation fails when a mission is missing frontmatter (3.8448ms)
✔ assessment output validation fails when a mission is missing required frontmatter fields (4.1372ms)
✔ assessment output validation fails when a mission is missing category (3.4666ms)
✔ assessment output validation fails when a mission has invalid category (3.697ms)
✔ assessment output validation rejects multiple automation-maintenance missions by default (4.4119ms)
✔ assessment output validation allows multiple automation-maintenance missions with override (4.1965ms)
✔ assessment output validation fails when parallelGroupSafe is not boolean (3.0943ms)
✔ assessment output validation fails when required body sections are missing (3.818ms)
✔ assessment output validation fails without assessment.md (2.8876ms)
✔ assessment output validation fails without missions README (2.8663ms)
✔ assessment output validation fails when too many missions are written (3.949ms)
✔ assessment output validation fails for mission Markdown outside missions directory (4.3553ms)
✔ dry run writes assessment prompt without invoking Codex (6.7717ms)
✔ assessment-pack-only creates pack and exits before Codex or missions (12.8042ms)
✔ external mission dry run discovers provided folder without assessment prompt (6.0744ms)
✔ external mission run skips assessment spawn and passes folder to mission runner (14.2741ms)
✔ external coherence review writes evidence pack without Codex coherence spawn (12.965ms)
✔ dry run still rejects danger-full-access without explicit allow flag (0.7217ms)
✔ frontmatter parser supports scalars, empty arrays, and block arrays (0.1002ms)
✔ mission discovery recursively excludes README files (4.7698ms)
✔ mission title is inferred from the first markdown heading (2.2325ms)
✔ affected files are inferred from body text when files exist (3.5645ms)
✔ batch planning prevents overlap on affected files (0.4501ms)
✔ batch planning prevents overlap on affected node neighborhoods (0.1326ms)
✔ high-risk missions are isolated from other missions (0.0792ms)
✔ global shared files are not parallel-safe for writable missions (0.0863ms)
✔ dry-run prints commands without spawning Codex (4.6129ms)
✔ plan surfaces workspace-write concurrency blocker without failing planning (4.3671ms)
✔ workspace-write execution blocks concurrency without worktrees before spawning Codex (4.278ms)
✔ plan surfaces danger-full-access blocker without failing planning (3.805ms)
✔ plan omits execution blocker for explicitly allowed danger-full-access (3.5628ms)
✔ default queue uses automation missions and skips completed runtime entries (4.9222ms)
✔ legacy basename runtime entries do not collide across duplicate basenames (5.6568ms)
✔ mission-folder-relative runtime entries skip only the intended duplicate basename (6.4157ms)
✔ runtime-only completion exits with an explicit no pending message (4.5763ms)
✔ execution uses an injected Codex process and writes final output (10.0376ms)
✔ workspace-write execution with worktrees creates a real git worktree (257.1374ms)
✔ parallel-safe read-only execution writes one batch summary for the batch (15.0901ms)
✔ runtime updates record repo-relative paths for duplicate basenames (13.1808ms)
✔ filesMatching recursively returns sorted matching files (2.934ms)
✔ collectTestFiles discovers nested package and script tests (7.6271ms)
✔ small web app fixture scans checkout files and builds useful context (13.8308ms)
✔ checkout coordinates cart, payment, and order services (29.1759ms)
✔ checkout propagates cart and payment validation errors (12.3655ms)
✔ cart and payment services reject invalid inputs (11.9524ms)
ℹ tests 411
ℹ suites 0
ℹ pass 411
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14221.9187
--------------------------|---------|----------|---------|---------|--------------------------------
File                      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------------|---------|----------|---------|---------|--------------------------------
All files                 |   91.13 |    79.87 |   92.93 |   91.13 |
 app/src                  |   78.27 |       50 |      50 |   78.27 |
  App.tsx                 |   76.44 |       45 |      30 |   76.44 | ...164,188-189,209-217,223-225
  nodeAccessors.ts        |     100 |    57.14 |     100 |     100 | 4,8,12-13,17-18
 app/src/components       |   90.33 |    65.98 |   78.87 |   90.33 |
  AgentHealthPanel.tsx    |      90 |    26.92 |    92.3 |      90 | ...126-127,129-133,137,139-140
  ChangeHistory.tsx       |     100 |       60 |     100 |     100 | 8,25
  CollapsibleSection.tsx  |     100 |       50 |     100 |     100 | 21
  ConceptPanel.tsx        |     100 |    66.66 |     100 |     100 | 9
  DiffView.tsx            |     100 |    66.66 |     100 |     100 | 16,21-25
  GoalWorkflowPanel.tsx   |   93.59 |       71 |      72 |   93.59 | ...353,380-381,449-450,456-474
  InvariantPanel.tsx      |     100 |    66.66 |     100 |     100 | 8
  NodeDetails.tsx         |   90.69 |       40 |     100 |   90.69 | 36-43
  Panel.tsx               |     100 |      100 |     100 |     100 |
  Stat.tsx                |     100 |      100 |     100 |     100 |
  Timeline.tsx            |     100 |    66.66 |     100 |     100 | 18
  TreeList.tsx            |   77.77 |    82.97 |   63.15 |   77.77 | ...115,255-282,300-307,309-315
  WorkflowList.tsx        |     100 |    77.77 |     100 |     100 | 19,28
 app/src/hooks            |   46.21 |    61.53 |      50 |   46.21 |
  useAbstractionState.ts  |   46.21 |    61.53 |      50 |   46.21 | ...37-38,42-92,110-113,115-119
 cli/src                  |    87.4 |    72.52 |   88.55 |    87.4 |
  agentHealth.ts          |     100 |      100 |     100 |     100 |
  apiState.ts             |    92.8 |    57.87 |   95.38 |    92.8 | ...,982-983,999-1003,1005-1009
  changeReviewCommand.ts  |   95.77 |       75 |      60 |   95.77 | 53-55
  doctor.ts               |    87.9 |       80 |   91.42 |    87.9 | ...449,457-469,496-507,590-591
  goalCommand.ts          |    97.9 |    85.51 |   93.33 |    97.9 | ...424-425,433,713-714,755-756
  index.ts                |   54.28 |    53.33 |      25 |   54.28 | ...400-405,407-474,477-481,489
  migrate.ts              |   81.15 |    81.25 |      75 |   81.15 | 40-41,44,52-58,67-69
  openBrowser.ts          |   95.58 |    69.23 |     100 |   95.58 | 56-58
  propose.ts              |   93.49 |    36.84 |     100 |   93.49 | 74-75,79-80,89-90,107-108
  routeCommand.ts         |   91.33 |    63.33 |   77.77 |   91.33 | ...109,122-124,129-134,140-141
  scopeCommand.ts         |   75.11 |       60 |   53.84 |   75.11 | ...167,169-176,178-186,188-200
  serveHost.ts            |     100 |    93.75 |     100 |     100 | 74,98,105
  serveProject.ts         |   96.29 |    71.42 |     100 |   96.29 | 73-74,91-92
  setupGuidance.ts        |   82.22 |    81.81 |     100 |   82.22 | 12-19
  treeExportCommand.ts    |   92.77 |    84.21 |   83.33 |   92.77 | 38-40,44-46
 core/src                 |   92.91 |    82.64 |   95.87 |   92.91 |
  automationValidation.ts |   94.85 |    93.42 |     100 |   94.85 | 306-321,329-330,358-359
  changeReview.ts         |   98.89 |    81.57 |     100 |   98.89 | 147-148
  context.ts              |   95.44 |       88 |    98.7 |   95.44 | ...84,1197,1209-1215,1217-1224
  contextLimits.ts        |     100 |      100 |     100 |     100 |
  diffSummary.ts          |   90.25 |    89.44 |   96.55 |   90.25 | 216-267,441-442
  evaluator.ts            |   85.63 |    84.82 |    87.3 |   85.63 | ...26-1128,1130-1136,1138-1142
  goal.ts                 |   97.82 |    81.91 |     100 |   97.82 | ...64-1365,1468-1469,1477-1480
  importAliases.ts        |   84.32 |     62.5 |    87.8 |   84.32 | ...433-435,437-445,461,484-486
  importGraph.ts          |   92.51 |       79 |   94.81 |   92.51 | ...32-1434,1490-1495,1524-1526
  index.ts                |     100 |      100 |     100 |     100 |
  migrations.ts           |   64.75 |    61.29 |   85.71 |   64.75 | ...272,277-290,319-320,347-349
  promptRouter.ts         |   97.93 |    88.93 |     100 |   97.93 | 151-160,308-309
  runReports.ts           |   93.75 |       90 |     100 |   93.75 | 31-32
  runtimeSchema.ts        |   88.28 |    75.55 |   93.33 |   88.28 | ...37-1339,1360-1363,1377-1378
  scanner.ts              |   92.61 |    88.46 |   97.82 |   92.61 | ...462,536-539,559-561,673-674
  schema.ts               |     100 |      100 |     100 |     100 |
  scope.ts                |   91.89 |    76.95 |   97.82 |   91.89 | ...608,634-640,681-683,786-787
  treeBuilder.ts          |   97.63 |    86.05 |   98.32 |   97.63 | ...68-2169,2208-2209,2219-2221
  treeExport.ts           |      93 |    84.09 |     100 |      93 | 33-35,58-61,123-125
  validator.ts            |   92.26 |    79.14 |     100 |   92.26 | ...634-636,638-639,643,645-646
  workspace.ts            |   93.55 |    85.51 |   89.74 |   93.55 | ...738,809-811,817-822,865-875
 core/src/llm             |   84.23 |    65.81 |   91.42 |   84.23 |
  abstractionBuilder.ts   |     100 |    76.92 |     100 |     100 | 55-57
  proposals.ts            |   78.84 |    64.42 |      90 |   78.84 | ...470,480-482,484-486,519-526
  types.ts                |     100 |      100 |     100 |     100 |
--------------------------|---------|----------|---------|---------|--------------------------------
Coverage thresholds passed; report written to coverage/c8.

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:09.644Z
````

### npm run package:size

````text
COMMAND: npm run package:size
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:09.645Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 package:size
> node scripts/check-package-size.mjs

@abstraction-tree/core: tarball 131.0 KiB / 214.8 KiB installed 661.9 KiB / 1.1 MiB
@abstraction-tree/cli: tarball 55.6 KiB / 78.1 KiB installed 275.4 KiB / 341.8 KiB
@abstraction-tree/app: tarball 56.7 KiB / 87.9 KiB installed 182.7 KiB / 244.1 KiB
abstraction-tree: tarball 621 B / 4.9 KiB installed 1.0 KiB / 9.8 KiB
Package size check passed.

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:10.790Z
````

### npm run pack:smoke

````text
COMMAND: npm run pack:smoke
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:10.790Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 pack:smoke
> node scripts/pack-smoke-test.mjs

pack smoke: @abstraction-tree/core dry-run and tarball checks passed
pack smoke: @abstraction-tree/cli dry-run and tarball checks passed
pack smoke: @abstraction-tree/app dry-run and tarball checks passed
pack smoke: abstraction-tree dry-run and tarball checks passed
pack smoke: installed package commands passed

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:22.698Z
````

### npm run release:dry-run -- --version 0.2.0-beta.1

````text
COMMAND: npm run release:dry-run -- --version 0.2.0-beta.1
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:22.698Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 release:dry-run
> node scripts/release-dry-run.mjs --version 0.2.0-beta.1

release dry-run: package smoke and installability checks passed
release dry-run: @abstraction-tree/core publish dry-run passed
release dry-run: @abstraction-tree/cli publish dry-run passed
release dry-run: @abstraction-tree/app publish dry-run passed
release dry-run: abstraction-tree publish dry-run passed

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:36.145Z
````

### npm run atree:scan

````text
COMMAND: npm run atree:scan
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:36.145Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 atree:scan
> node packages/cli/dist/index.js scan --project .

Scanned 242 files and built 637 tree nodes.
View the project map:
  atree serve --project . --open

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:36.813Z
````

### npm run atree:validate

````text
COMMAND: npm run atree:validate
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:36.813Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 atree:validate
> node packages/cli/dist/index.js validate --project . --strict

No validation issues found.

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:37.804Z
````

### npm run atree:evaluate

````text
COMMAND: npm run atree:evaluate
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:37.804Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 atree:evaluate
> node packages/cli/dist/index.js evaluate --project .

Wrote evaluation report to .abstraction-tree/evaluations/2026-05-15-1817-evaluation.json
{
  "timestamp": "2026-05-15T22:17:38.073Z",
  "tree": {
    "nodeCount": 637,
    "orphanNodeCount": 0,
    "nodesWithoutSummaries": 0,
    "nodesWithoutExplanations": 0,
    "thinExplanationCount": 0,
    "averageExplanationLength": 788.74,
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
    "totalChangeRecordCount": 62,
    "generatedScanRecordCount": 24,
    "semanticChangeRecordCount": 38,
    "eligibleGeneratedScanRecordCount": 22,
    "changeReviewIssueCount": 0,
    "generatedScanReviewNeeded": true,
    "retainedGeneratedScanRecordId": "scan.1778883456795"
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
      "conceptsWithoutRelatedFiles": 0,
      "fillerOnlyEvidenceConcepts": 0,
      "fillerOnlyEvidenceConceptIds": []
    },
    "imports": {
      "unresolvedImportCount": 6,
      "unresolvedSourceImportCount": 0,
      "staticAssetImportCount": 7,
      "generatedArtifactImportCount": 3,
      "virtualImportCount": 0
    },
    "architecture": {
      "architectureNodeCount": 23,
      "architectureCoverableFileCount": 179,
      "architectureCoveredFileCount": 99,
      "architectureCoveragePercent": 55.31
    },
    "context": {
      "evaluatedContextPackCount": 2,
      "expectedContextPackCount": 1,
      "passingExpectedContextPackCount": 1,
      "missingExpectedInclusionCount": 0,
      "missingExpectedInclusions": [],
      "expectedContextPackCeilingViolationCount": 0,
      "expectedContextPackCeilingViolations": []
    },
    "routes": {
      "expectedRouteCount": 0,
      "passingExpectedRouteCount": 0,
      "decisionMismatchCount": 0,
      "decisionMismatches": [],
      "missingExpectedInclusionCount": 0,
      "missingExpectedInclusions": []
    }
  },
  "issues": [
    {
      "severity": "warning",
      "area": "changes",
      "filePath": ".abstraction-tree/changes",
      "message": ".abstraction-tree/changes contains 24 generated scan records and 38 semantic records; 22 older generated scan records are eligible for consolidation, retaining latest generated scan scan.1778883456795. Change review reported 0 issues. Evaluation is read-only."
    }
  ]
}

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:38.799Z
````

### npm run atree -- doctor --project . --strict

````text
COMMAND: npm run atree -- doctor --project . --strict
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:38.799Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 atree
> node packages/cli/dist/index.js doctor --project . --strict

Abstraction Tree doctor

Project: abstraction-tree
Node: ok (24.14.0 satisfies >=20.19.0)
Config: ok
Memory: ok (242 files, 637 nodes, 32 concepts, 2 invariants, 62 changes)
Import graph: ok
Runtime schema: ok
Validation: ok
Self dogfooding memory: ok for Abstraction Tree package
Automation runtime boundary: ok
Visual app: available (C:\Users\Sam\Documents\abstraction tree\abstraction-tree\packages\app\dist)
Next step: npm run assessment:pack

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:39.803Z
````

### npm run diff:summary

````text
COMMAND: npm run diff:summary
CWD: C:\Users\Sam\Documents\abstraction tree\abstraction-tree
START: 2026-05-15T22:17:39.803Z

STDOUT:

> abstraction-tree-monorepo@0.2.0-beta.1 diff:summary
> node scripts/diff-summary.mjs

# Diff Summary Since Last Commit

Base: a85d7e4 Improve beta readiness workflows

## Totals
Changed files: 137
Lines: +39320 / -18491 / 57811 total
Source files: 34
Test files: 21
Docs files: 20
Memory files: 48
Generated memory files: 30
Automation files: 2
Package files: 6
CI files: 0
App files: 2
Areas: app, automation, docs, generated-memory, memory, package, source, tests

## Dangerous Changes
- examples/context-quality-benchmarks/vite-lite/pnpm-workspace.yaml (package manager config)

## Possible Overreach
- [file-count] Too many files changed: 137 exceeds 25.
- [line-count] Too many changed lines: 57811 exceeds 1200.
- [broad-areas] Unrelated areas may be mixed: app, automation, docs, generated-memory, memory, package, source, tests.
- [package-metadata-change] Package metadata or lockfiles changed; review dependency, script, and install impact.
- [cross-subsystem-change] Implementation changes span multiple subsystems: app, cli, core, examples, scripts.
- [source-app-docs-automation] Source, app, docs, and automation files all changed together.

## Files
- A .abstraction-tree/changes/2026-05-15-context-quality-benchmarks.json (+36/-0) [generated-memory, memory]
- M .abstraction-tree/changes/context-pack-fixture-expectation.2026-05-08.json (+1/-1) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778871776283.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778872558408.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778873095728.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778873546528.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778873672388.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778874602344.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778875323278.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778876483543.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778877144482.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778877903284.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778878773023.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778879589256.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778880233843.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778880861156.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778881234435.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778881429796.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778881579584.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778881652232.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778883233874.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778883327783.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778883343850.json (+23/-0) [generated-memory, memory]
- A .abstraction-tree/changes/scan.1778883456795.json (+23/-0) [generated-memory, memory]
- M .abstraction-tree/concepts.json (+6297/-5567) [generated-memory, memory]
- M .abstraction-tree/evaluation-fixture.json (+2/-2) [memory]
- A .abstraction-tree/evaluations/2026-05-15-1817-evaluation.json (+110/-0) [generated-memory, memory]
- M .abstraction-tree/files.json (+1705/-310) [generated-memory, memory]
- M .abstraction-tree/import-graph.json (+942/-3) [memory]
- M .abstraction-tree/invariants.json (+169/-13) [generated-memory, memory]
- A .abstraction-tree/missions/v1-quality-followups/00-current-gate-evidence.md (+124/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/01-dogfooding-detector.md (+124/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/02-pnpm-workspaces.md (+124/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/03-import-classification.md (+126/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/04-context-fallback.md (+122/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/05-concept-quality.md (+122/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/06-context-quality-benchmarks.md (+122/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/07-python-architecture.md (+119/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/08-rust-architecture.md (+118/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/09-docs-book-architecture.md (+118/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/10-route-context-consistency.md (+122/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/11-scope-contracts.md (+120/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/12-artifact-security.md (+125/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/13-repo-type-profiles.md (+127/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/14-non-js-dependency-graphs.md (+120/-0) [memory]
- A .abstraction-tree/missions/v1-quality-followups/15-docs-boundaries-drift.md (+122/-0) [memory]
- M .abstraction-tree/ontology.json (+1/-1) [generated-memory, memory]
- M .abstraction-tree/tree.json (+19063/-12259) [generated-memory, memory]
- M docs/ARCHITECTURE.md (+2/-2) [docs]
- M docs/CONFIGURATION.md (+89/-1) [docs]
- M docs/DATA_MODEL.md (+23/-5) [docs]
- A docs/release-evidence/2026-05-15-current-gate.md (+1384/-0) [docs]
- M docs/release-evidence/2026-05-15-diverse-repository-beta-evaluation.md (+10/-0) [docs]
- M docs/ROADMAP.md (+3/-3) [docs]
- M docs/SCOPE_CONTRACTS.md (+12/-1) [docs]
- M docs/STABLE_VS_EXPERIMENTAL.md (+3/-1) [docs]
- M docs/V1_RELEASE_CANDIDATE_REVIEW.md (+22/-7) [docs]
- M docs/V1_RELEASE_GATE.md (+9/-1) [docs]
- M docs/VISUAL_DEMO.md (+28/-4) [docs]
- A examples/context-quality-benchmarks/click-lite/.abstraction-tree/evaluation-fixture.json (+46/-0)
- A examples/context-quality-benchmarks/click-lite/docs/options.rst (+6/-0) [docs]
- A examples/context-quality-benchmarks/click-lite/pyproject.toml (+6/-0)
- A examples/context-quality-benchmarks/click-lite/src/click/core.py (+9/-0) [source]
- A examples/context-quality-benchmarks/click-lite/src/click/parser.py (+9/-0) [source]
- A examples/context-quality-benchmarks/click-lite/tests/test_defaults.py (+6/-0) [tests]
- A examples/context-quality-benchmarks/click-lite/tests/test_options.py (+6/-0) [tests]
- A examples/context-quality-benchmarks/fd-lite/.abstraction-tree/evaluation-fixture.json (+47/-0)
- A examples/context-quality-benchmarks/fd-lite/Cargo.toml (+8/-0)
- A examples/context-quality-benchmarks/fd-lite/README.md (+4/-0) [docs]
- A examples/context-quality-benchmarks/fd-lite/src/cli.rs (+9/-0) [source]
- A examples/context-quality-benchmarks/fd-lite/src/main.rs (+8/-0) [source]
- A examples/context-quality-benchmarks/fd-lite/src/walk.rs (+10/-0) [source]
- A examples/context-quality-benchmarks/fd-lite/tests/tests.rs (+6/-0) [tests]
- A examples/context-quality-benchmarks/mern-lite/.abstraction-tree/evaluation-fixture.json (+51/-0)
- A examples/context-quality-benchmarks/mern-lite/backend/controllers/goalController.js (+7/-0) [source]
- A examples/context-quality-benchmarks/mern-lite/backend/middleware/authMiddleware.js (+9/-0) [source]
- A examples/context-quality-benchmarks/mern-lite/backend/routes/goalRoutes.js (+7/-0) [source]
- A examples/context-quality-benchmarks/mern-lite/backend/server.js (+8/-0) [source]
- A examples/context-quality-benchmarks/mern-lite/frontend/package.json (+9/-0) [package]
- A examples/context-quality-benchmarks/mern-lite/frontend/src/features/goals/goalSlice.js (+11/-0) [source]
- A examples/context-quality-benchmarks/mern-lite/frontend/src/pages/Dashboard.jsx (+6/-0) [source]
- A examples/context-quality-benchmarks/mern-lite/package.json (+13/-0) [package]
- A examples/context-quality-benchmarks/README.md (+16/-0) [docs]
- A examples/context-quality-benchmarks/rust-book-lite/.abstraction-tree/evaluation-fixture.json (+45/-0)
- A examples/context-quality-benchmarks/rust-book-lite/book.toml (+3/-0)
- A examples/context-quality-benchmarks/rust-book-lite/listings/ch04-understanding-ownership/listing-04-01/src/main.rs (+8/-0) [source]
- A examples/context-quality-benchmarks/rust-book-lite/src/ch04-00-understanding-ownership.md (+4/-0) [docs]
- A examples/context-quality-benchmarks/rust-book-lite/src/ch04-01-what-is-ownership.md (+5/-0) [docs]
- A examples/context-quality-benchmarks/rust-book-lite/src/ch04-02-references-and-borrowing.md (+5/-0) [docs]
- A examples/context-quality-benchmarks/rust-book-lite/src/SUMMARY.md (+5/-0) [docs]
- A examples/context-quality-benchmarks/vite-lite/.abstraction-tree/evaluation-fixture.json (+48/-0)
- A examples/context-quality-benchmarks/vite-lite/docs/guide/api-plugin.md (+8/-0) [docs]
- A examples/context-quality-benchmarks/vite-lite/package.json (+11/-0) [package]
- A examples/context-quality-benchmarks/vite-lite/packages/vite/package.json (+7/-0) [package]
- A examples/context-quality-benchmarks/vite-lite/packages/vite/src/node/plugin.ts (+8/-0) [source]
- A examples/context-quality-benchmarks/vite-lite/packages/vite/src/node/server/mixedModuleGraph.ts (+15/-0) [source]
- A examples/context-quality-benchmarks/vite-lite/packages/vite/src/node/server/pluginContainer.ts (+20/-0) [source]
- A examples/context-quality-benchmarks/vite-lite/pnpm-workspace.yaml (+2/-0) [package]
- M packages/app/src/app.test.tsx (+24/-0) [app, tests]
- M packages/app/src/components/GoalWorkflowPanel.tsx (+104/-24) [app, source]
- M packages/cli/src/apiState.test.ts (+65/-0) [tests]
- M packages/cli/src/apiState.ts (+48/-8) [source]
- M packages/cli/src/doctor.test.ts (+70/-4) [tests]
- M packages/cli/src/doctor.ts (+111/-26) [source]
- A packages/cli/src/index.test.ts (+61/-0) [tests]
- M packages/cli/src/index.ts (+19/-5) [source]
- M packages/cli/src/serveCommand.test.ts (+3/-1) [tests]
- M packages/cli/src/serveHost.test.ts (+4/-4) [tests]
- M packages/cli/src/serveHost.ts (+3/-3) [source]
- M packages/core/package.json (+1/-1) [package]
- M packages/core/src/context.test.ts (+272/-0) [tests]
- M packages/core/src/context.ts (+588/-19) [source]
- M packages/core/src/diffSummary.test.ts (+28/-0) [tests]
- M packages/core/src/diffSummary.ts (+75/-2) [source]
- M packages/core/src/evaluator.test.ts (+118/-1) [tests]
- M packages/core/src/evaluator.ts (+284/-28) [source]
- M packages/core/src/goal.test.ts (+30/-1) [tests]
- M packages/core/src/goal.ts (+51/-4) [source]
- M packages/core/src/importGraph.test.ts (+244/-10) [tests]
- M packages/core/src/importGraph.ts (+998/-40) [source]
- M packages/core/src/promptRouter.test.ts (+14/-1) [tests]
- M packages/core/src/promptRouter.ts (+85/-23) [source]
- M packages/core/src/runtimeSchema.test.ts (+23/-0) [tests]
- M packages/core/src/runtimeSchema.ts (+43/-3) [source]
- M packages/core/src/scanner.test.ts (+81/-0) [tests]
- M packages/core/src/scanner.ts (+218/-28) [source]
- M packages/core/src/schema.ts (+44/-1) [source]
- M packages/core/src/scope.test.ts (+121/-3) [tests]
- M packages/core/src/scope.ts (+346/-38) [source]
- M packages/core/src/treeBuilder.test.ts (+372/-1) [tests]
- M packages/core/src/treeBuilder.ts (+756/-17) [source]
- M packages/core/src/validator.ts (+62/-0) [source]
- M packages/core/src/workspace.test.ts (+55/-0) [tests]
- M packages/core/src/workspace.ts (+402/-13) [source]
- M README.md (+4/-1) [docs]
- A scripts/capture-release-gate-evidence.mjs (+478/-0) [automation, source]
- A scripts/capture-release-gate-evidence.test.mjs (+132/-0) [automation, tests]

STDERR:
(empty)

EXIT CODE: 0
END: 2026-05-15T22:17:40.068Z
````
