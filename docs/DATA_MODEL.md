# Data Model

A project using Abstraction Tree stores its semantic memory in `.abstraction-tree/`.

## `config.json`

Project-level configuration. It includes the current install mode: `core` for abstraction-only usage, or `full` when the local visual app is enabled.

## `files.json`

Mechanical scan output for source files:

- path;
- language;
- imports;
- exports;
- symbols;
- test flag;
- summary;
- owning tree nodes.

## `tree.json`

The abstraction hierarchy.

Each node has:

- id;
- title;
- level;
- summary;
- children;
- parent;
- owned files;
- dependencies;
- invariants;
- change policy;
- confidence.

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
