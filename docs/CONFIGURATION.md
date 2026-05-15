# Project Configuration

> Audience: users who need repository-specific subsystem and vocabulary rules
> Status: Beta config surface

Abstraction Tree always keeps committed project memory in `.abstraction-tree/config.json`. For scanner customization, add JSON overrides outside generated memory:

- project override: `atree.config.json` at the project root;
- global override: `~/.abstraction-tree/config.json`;
- one-off override: `atree scan --config path/to/atree.config.json`;
- built-in repo-type profile: `atree scan --profile rust-cli`;
- debugging without overrides: `atree scan --no-custom-config`.

The scanner merges settings in this order: `.abstraction-tree/config.json`, selected built-in profile, global override, then project or explicit override. Custom array settings are additive unless two subsystem patterns use the same `id`; in that case the later override wins for that pattern. When `--no-custom-config` is used, global and project override files are ignored; an explicitly selected `--profile` still applies.

## Built-In Repo-Type Profiles

Profiles are optional heuristic boosts. They do not auto-detect a repository type and they do not promise a complete architecture model; they supply subsystem patterns, domain vocabulary, concept weights, mission planning hints, and scanner ignore hints that project config can override.

Use one profile per scan:

```bash
atree scan --profile rust-cli
atree scan --profile node-monorepo --config ./atree.config.json
```

Available profiles:

| Profile | Intended repository shape |
| --- | --- |
| `node-monorepo` | npm, pnpm, yarn, or bun workspaces with packages and apps |
| `react-app` | React or Vite-style frontend applications |
| `python-package` | Python libraries and CLI packages |
| `rust-cli` | Cargo-based command-line tools |
| `go-service` | Go API services and command binaries |
| `docs-book` | mdBook-style or chapter-oriented documentation repositories |
| `mixed-fullstack` | Repositories with frontend, backend, shared contracts, and data layers |

For example, `rust-cli` adds Cargo-oriented ignore hints, Rust CLI/package/test subsystem patterns, Rust vocabulary, and mission planning defaults such as `cargo build` and `cargo test`. A project override can still replace any subsystem pattern by reusing its `id`, add more patterns, or override mission planning commands:

```json
{
  "subsystemPatterns": [
    {
      "id": "subsystem.rust.cli",
      "title": "Custom Command Surface",
      "paths": ["crates/cli/**"],
      "priority": 100
    }
  ],
  "missionPlanning": {
    "testCommands": ["cargo test --workspace"]
  }
}
```

## Workspace Package Discovery

The import graph automatically discovers workspace packages from root `package.json` `workspaces` and from `pnpm-workspace.yaml` or `pnpm-workspace.yml`. pnpm support is intentionally scoped to the top-level `packages` field with string values, block lists, or single-line arrays:

```yaml
packages:
  - packages/*
  - "tools/*"
  - '!packages/private-*'
```

`!` patterns exclude package roots after all workspace include patterns are expanded. Discovered package roots are merged across package managers and deduplicated by package name.

## Built-In Python Heuristics

The deterministic scanner includes lightweight Python package heuristics without requiring a Python AST parser. It recognizes `.py`, `.rst`, `.toml`, `.cfg`, and `.ini` files; treats `tests/`, `test_*.py`, and `*_test.py` as tests; captures indented Python functions and classes as symbols; and resolves simple Python imports such as `from .parser import OptionParser` and `from click.parser import OptionParser`.

When a project has Python source plus package evidence such as `pyproject.toml`, `setup.py`, `setup.cfg`, `src/<package>/`, or a top-level package folder, the tree builder can infer Python architecture nodes for package API modules, CLI entrypoints, parser/options handling, tests, docs, and packaging metadata. CLI evidence includes `click`, `typer`, `argparse`, `main`/`cli` symbols, `__main__.py`, `cli.py`, and console script metadata.

## Built-In Rust Heuristics

Rust projects are scanned without requiring `rustc` or `cargo`. The scanner recognizes `.rs`, `Cargo.toml`, and `Cargo.lock`; captures Rust `mod`, `use`, public functions, structs, enums, traits, and Cargo package/bin metadata; and marks `tests/`, `benches/`, and `*_test.rs` as test evidence.

When Rust source appears with Cargo evidence or conventional binary paths, the tree builder can infer architecture nodes for binary entrypoints, CLI argument surfaces, traversal/search engines, config and ignore rules, integration tests, and Cargo packaging metadata. Rust module edges resolve common `mod foo;`, `crate::foo`, and package-name imports such as `fd_lite::walk::ignore_hidden` to scanned `.rs` files when the target module exists.

## Built-In Go Heuristics

Go projects are scanned without invoking `go`. The scanner recognizes `.go` and `go.mod`, captures package imports, functions, methods, types, and module metadata, and marks `*_test.go` files as tests.

When `go.mod` is scanned, the import graph resolves imports under that module path to a deterministic representative scanned `.go` file in the imported package directory. Missing local module imports are reported as unresolved `go-package` edges, while standard library and third-party imports remain external.

## Built-In Documentation Book Heuristics

Documentation-heavy repositories can expose architecture even when most files are prose. The deterministic scanner treats Markdown headings as symbols, and the tree builder recognizes mdBook-style evidence such as `src/SUMMARY.md`, `book.toml`, chapter filenames, appendix paths, `listings/`, `examples/`, `theme/`, scripts, and docs-oriented CI files.

When book evidence is present, the architecture layer can infer book structure, chapter content, listings/examples, build and publishing, translations/editions, and editorial quality checks. Markdown and MDX links to local scanned docs or code files are included as `markdown-link` graph edges; local image or asset links that are not scanned are classified separately. Context selection gives extra weight to exact chapter-title and docs-path matches, and book prompts can keep `SUMMARY.md`, nearby chapter files, listings, and build config visible without treating generated `.abstraction-tree/evaluation-fixture.json` files as source content.

## Example

```json
{
  "subsystemPatterns": [
    {
      "id": "subsystem.api.routes",
      "title": "API Routes",
      "summary": "HTTP route handlers and request boundary code.",
      "paths": ["src/routes/**", "src/api/**"],
      "fileNames": ["*.route.ts"],
      "imports": ["hono", "express"],
      "priority": 50,
      "weight": 0.2,
      "responsibilities": [
        "Own request parsing, route handlers, and response shaping."
      ]
    },
    {
      "id": "subsystem.domain.logic",
      "title": "Domain Logic",
      "paths": ["src/domain/**", "src/usecases/**"],
      "priority": 40
    }
  ],
  "domainVocabulary": [
    {
      "concept": "inventory",
      "synonyms": ["sku", "stock unit", "catalog item"],
      "weight": 6
    }
  ],
  "conceptSignalWeights": {
    "path": 2,
    "symbol": 4,
    "export": 5,
    "doc": 1
  }
}
```

`subsystemPatterns` create or override first-level human subsystem nodes. A file matches when any configured selector matches its project-relative path, basename, imports, symbols, or extension. `paths` and `fileNames` use `*`, `**`, and `?` globs. `priority` controls subsystem ordering when configured priorities are present. `weight` increases confidence for matched custom subsystems.

`domainVocabulary` maps project terms to canonical concepts. In the example, scanner evidence for `sku` is ranked as `inventory`, and the synonym remains in the concept tags and evidence trail. `conceptSignalWeights` lets a project emphasize path, symbol, export, or documentation signals.

## Type Shape

```ts
interface SubsystemPatternConfig {
  id: string;
  title: string;
  summary?: string;
  paths?: string[];
  fileNames?: string[];
  imports?: string[];
  symbols?: string[];
  extensions?: string[];
  responsibilities?: string[];
  priority?: number;
  weight?: number;
  minimumMatches?: number;
}

interface DomainVocabularyMapping {
  concept: string;
  synonyms: string[];
  weight?: number;
}

type ConceptSignalWeightsConfig = Partial<Record<"path" | "symbol" | "export" | "doc", number>>;

type AtreeBuiltInProfileName =
  | "node-monorepo"
  | "react-app"
  | "python-package"
  | "rust-cli"
  | "go-service"
  | "docs-book"
  | "mixed-fullstack";
```

These types are exported from `@abstraction-tree/core`.
