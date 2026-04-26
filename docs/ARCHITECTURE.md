# Architecture

Abstraction Tree has three layers.

## 1. Core engine

The core engine is responsible for deterministic project understanding:

- scan files;
- extract imports, exports, symbols, tests, and basic summaries;
- build an initial abstraction tree;
- infer concepts and invariants;
- validate drift;
- generate context packs for agents.

The core should remain independent from a specific editor, LLM provider, or UI framework.

## 2. CLI

The CLI is the main integration surface. It is published as the core-only package `@abstraction-tree/cli`:

```bash
atree init --core
atree scan
atree validate
atree context --target checkout
atree serve
```

It is designed to run inside any existing repo.

## 3. Optional visual app

The visual app is published separately as `@abstraction-tree/app`. The full package `abstraction-tree` installs both the CLI and the app.

The visual app is the human-readable interface to `.abstraction-tree/`.

It shows:

- abstraction hierarchy;
- file ownership;
- concepts;
- invariants;
- semantic change history;
- context packs;
- drift warnings.

The browser app is local-first. It is served by the CLI and reads local project state through a local API. Projects that only install `@abstraction-tree/cli` can still scan, validate, and produce agent context packs without installing the UI.

## Future layers

- LLM abstraction provider adapters;
- VS Code/Cursor extension;
- GitHub Action for PR drift checks;
- Tauri desktop wrapper;
- Tree-sitter based multi-language symbol extraction.
