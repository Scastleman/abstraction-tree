# Data Model

A project using Abstraction Tree stores its semantic memory in `.abstraction-tree/`.

## `config.json`

Project-level configuration. It includes the current install mode: `core` for abstraction-only usage, or `full` when the local visual app is enabled.

`version` is the schema version for committed `.abstraction-tree/` memory. The current schema version is `0.1.0`. The CLI validates this value before loading memory: future versions are blocked because an older CLI cannot safely interpret them, and unsupported older versions must be migrated before normal commands continue.

`sourceRoot` selects the directory the scanner walks. File paths written to `files.json` remain relative to the project root, so a `sourceRoot` of `src` still emits paths such as `src/app.ts`.

`ignored` contains `.gitignore`-style patterns evaluated against project-relative paths. Defaults exclude generated and local-only directories such as `node_modules`, `dist`, `.git`, `.abstraction-tree`, and `coverage`. Set `respectGitignore` to `true` to also apply patterns from the project root `.gitignore`.

## Schema migrations

Use `atree migrate` to inspect or apply schema migrations for `.abstraction-tree/` memory:

```sh
atree migrate --project .
atree migrate --project . --dry-run
atree migrate --project . --from 0.1.0 --to 0.1.0
```

The first migration system is intentionally structural: schema `0.1.0` is already current, so the plan is a no-op unless a workspace uses an unsupported or future version. Future schema changes should add explicit migration steps instead of silently rewriting memory during `scan`, `validate`, or `serve`.

Migration policy:

- every committed memory schema version is SemVer;
- compatible readers may tolerate optional fields, but breaking memory shape changes require a new schema version and a migration step;
- `atree migrate --dry-run` prints the plan and never writes files;
- `atree migrate` validates `config.json` before and after migration;
- when a migration writes files, the CLI backs up overwritten memory under `.abstraction-tree/backups/<timestamp>/`;
- if migration is blocked, keep the existing memory unchanged and upgrade the CLI or fix the reported schema issue.

## `ontology.json`

The project-specific abstraction ontology inferred during initialization or scan.

The system does not assume that every repository has the same conceptual layers. A React app, compiler, game engine, Kubernetes operator, and quant research repo can each describe different natural layers.

Each ontology level has:

- id;
- name;
- description;
- rank;
- signals used to infer it;
- confidence.

The ontology is variable. The node contract is fixed.

## `files.json`

Mechanical scan output for source files:

- path;
- language;
- parse strategy;
- normalized content hash;
- imports;
- exports;
- symbols;
- test flag;
- summary;
- owning tree nodes.

`parseStrategy` is `typescript-ast` for TypeScript/JavaScript-family files parsed with the TypeScript compiler API and `regex` for the current fallback scanner. The content hash normalizes line endings before hashing, so drift checks remain stable across Windows and Unix checkouts.

## `tree.json`

The abstraction hierarchy.

Each node has:

- id;
- name;
- abstraction level;
- parent;
- children;
- source files;
- summary;
- responsibilities;
- invariants;
- change policy;
- dependencies;
- change log;
- confidence.

For compatibility with older consumers, nodes may also expose alias fields such as `title`, `level`, `parentId`, `ownedFiles`, and `dependsOn`. New consumers should prefer `name`, `abstractionLevel`, `parent`, `sourceFiles`, and `dependencies`.

## `import-graph.json`

Resolved import graph output derived from scanned JavaScript and TypeScript-family files.

It includes:

- resolved local edges for relative imports;
- resolved workspace package edges when package roots or entrypoints can be inferred;
- external package imports;
- unresolved local imports with a reason;
- detected file import cycles;
- discovered workspace package metadata.

## `concepts.json`

Cross-cutting ideas that may touch multiple parts of the hierarchy.

Examples:

- authentication;
- checkout;
- pricing;
- context pack;
- scanner;
- visual app.

## `invariants.json`

Rules that should remain true unless explicitly changed.

Examples:

- behavior changes should update tests;
- tree memory must be updated after meaningful changes;
- payment authorization cannot happen before validation.

## `changes/`

Semantic change records written in tree language instead of only Git language.

Deterministic scans also write generated records with ids beginning `scan.`. These record the scan event, but older generated scan records can be reviewed for consolidation after a newer scan has superseded them. Use `atree changes review` for a read-only list of those candidates.

## `context-packs/`

Compressed bundles of relevant tree nodes, files, concepts, invariants, and recent changes for coding agents.

## `/api/state`

The local visual app reads a single CLI-served state payload from `GET /api/state`. This is an internal app contract, not a public stable HTTP API. The TypeScript shape is `AbstractionTreeState` from `@abstraction-tree/core`.

Top-level fields:

- `config`: migrated project config from `config.json`.
- `ontology`: abstraction ontology levels from `ontology.json`, or `[]` when missing.
- `nodes`: abstraction tree nodes from `tree.json`, or `[]` when missing.
- `files`: scanned file summaries from `files.json`, or `[]` when missing.
- `importGraph`: resolved import graph from `import-graph.json`, or an empty graph with `edges`, `externalImports`, `unresolvedImports`, `cycles`, and `workspacePackages` arrays.
- `concepts`: concept records from `concepts.json`, or `[]` when missing.
- `invariants`: invariant records from `invariants.json`, or `[]` when missing.
- `changes`: sorted semantic change records from `changes/*.json`, or `[]` when the directory is absent.
- `agentHealth`: derived status for the app, including optional `latestRun`, `latestEvaluation`, `validation`, and `automation` groups.

The CLI validates this payload with the runtime API-state contract before returning it. Missing run reports, evaluation reports, and automation runtime files are represented by absent nested `agentHealth` groups rather than request failures.
