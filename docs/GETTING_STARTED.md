# Getting Started

> Audience: New users
> Status: Stable core workflow
> Read after: README.md

This guide covers the provider-free path: initialize a workspace, scan a project, inspect the generated tree, and optionally open the local visual app. It does not require Codex, API keys, mission runners, or provider adapters.

## Prerequisites

- Node.js `20.19.0` or newer.
- npm.
- Git.
- No API key is required for the stable core path.

## Option A: Use Repo-Local Commands Before npm Publish

From this repository:

```bash
npm install
npm run build
npm run atree -- scan --project examples/small-web-app
npm run atree -- doctor --project examples/small-web-app
```

The example project should now have generated memory under `examples/small-web-app/.abstraction-tree/`.

## Option B: Use Package Commands After Publish

The package names are already configured in this monorepo, but they are not public registry packages until the first release.

After publish, the full local app path will be:

```bash
cd your-existing-project
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree doctor
npx atree serve --open
```

Core-only usage will be:

```bash
npm install -D @abstraction-tree/cli
npx atree init --core
npx atree scan
npx atree doctor
```

## Scan the Included Example

```bash
npm run atree -- init --with-app --project examples/small-web-app
npm run atree -- scan --project examples/small-web-app
npm run atree -- validate --project examples/small-web-app
```

After scan, you should see files such as:

```text
.abstraction-tree/config.json
.abstraction-tree/files.json
.abstraction-tree/import-graph.json
.abstraction-tree/ontology.json
.abstraction-tree/tree.json
.abstraction-tree/concepts.json
.abstraction-tree/invariants.json
.abstraction-tree/changes/
.abstraction-tree/context-packs/
```

## Scan Your Own Project

Use an absolute or relative path:

```bash
npm run atree -- init --with-app --project ../my-project
npm run atree -- scan --project ../my-project
npm run atree -- doctor --project ../my-project
```

`atree init` creates a blank local workspace. It must not copy this repository's committed dogfooding `.abstraction-tree/` memory into your project.

## Run Doctor

```bash
npm run atree -- doctor --project examples/small-web-app
```

`doctor` checks whether the workspace is initialized, whether memory can load, whether validation issues exist, and whether the visual app is available.

## Validate and Check Drift

```bash
npm run atree -- validate --project examples/small-web-app
```

Validation checks tree/file alignment, references, generated memory shape, and file drift against the current project.

## Generate an Agent Context Pack

```bash
npm run atree -- context --project examples/small-web-app --target checkout --format markdown
```

Context packs collect relevant tree nodes, files, concepts, invariants, and recent changes for a focused coding task.

## Export Diagrams

```bash
npm run atree -- export --project examples/small-web-app --format mermaid
npm run atree -- export --project examples/small-web-app --format dot --out .abstraction-tree/tree.dot
```

Mermaid output is useful for Markdown previews. DOT output is useful with Graphviz tooling.

## Serve the Visual App

```bash
npm run atree -- serve --project examples/small-web-app --open
```

`--open` launches your default browser. Without `--open`, the CLI prints the local URL so you can open it manually.

## Common Troubleshooting

- If `serve` says the app is missing, run `npm run build`.
- If `doctor` reports uninitialized memory, run `atree init` and `atree scan` for the target project.
- If validation reports drift, run `atree scan` after meaningful source changes.
- If a project appears to contain Abstraction Tree's own dogfooding memory, delete that project's `.abstraction-tree/` folder if safe, then run `atree init` and `atree scan`.

## Where To Go Next

- [Stable vs Experimental](STABLE_VS_EXPERIMENTAL.md)
- [Visual Demo](VISUAL_DEMO.md)
- [Data Model](DATA_MODEL.md)
- [Architecture](ARCHITECTURE.md)
- [Packaging](PACKAGING.md)
