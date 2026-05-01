# Data Model

A project using Abstraction Tree stores its semantic memory in `.abstraction-tree/`.

## `config.json`

Project-level configuration. It includes the current install mode: `core` for abstraction-only usage, or `full` when the local visual app is enabled.

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
- imports;
- exports;
- symbols;
- test flag;
- summary;
- owning tree nodes.

`parseStrategy` is `typescript-ast` for TypeScript/JavaScript-family files parsed with the TypeScript compiler API and `regex` for the current fallback scanner.

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

## `context-packs/`

Compressed bundles of relevant tree nodes, files, concepts, invariants, and recent changes for coding agents.
