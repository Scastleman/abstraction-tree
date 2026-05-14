# CI Integration

> Audience: Maintainers and adopters configuring CI
> Status: Stable guidance for deterministic checks
> Read after: GETTING_STARTED.md and STABLE_VS_EXPERIMENTAL.md.

Use Abstraction Tree in CI as a deterministic project-memory gate. The default
workflow should run Node, install dependencies, and validate committed
`.abstraction-tree/` memory. Do not run Codex, mission runners, provider
adapters, or other LLM-dependent automation in adopter CI unless your team has a
separate reviewed policy for that.

Most projects should commit `.abstraction-tree/` and review changes to it in the
same pull request as the code or docs that caused the memory change. Treat the
folder as generated but durable project memory: it explains what the repository
believes about its files, ownership, concepts, invariants, and recent semantic
changes.

## One-time setup

Install the public beta core CLI and create the initial memory baseline:

```bash
npm install -D @abstraction-tree/cli@beta
npx atree init --core
npx atree scan
npx atree validate --strict
```

Use the repository-local CLI while developing this project itself or while testing unpublished local changes:

```bash
npm install
npm run build
npm run atree -- scan --project .
npm run atree -- validate --project . --strict
```

Commit the resulting `.abstraction-tree/` files with the package manifest and
lockfile updates. Re-run `npx atree scan` whenever source files, docs, package
layout, ownership boundaries, concepts, or invariants change.

## Minimal validation

Use this when `.abstraction-tree/` is already committed and you want pull
requests to fail when memory is structurally invalid or stale.

```yaml
name: Abstraction Tree Validate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  atree:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.x
          cache: npm
      - run: npm ci
      - run: npx atree validate --project . --strict
```

`--strict` treats warnings as failures. In practice, that means file drift,
missing ownership, missing files, schema issues, and invalid memory references
block the PR.

## This Repository's CI

The Abstraction Tree repository uses CI as both a normal TypeScript quality gate
and a smoke test for the product workflows that should remain deterministic and
local-only. The workflow runs:

- dependency installation with `npm ci`;
- formatting, Unicode, lint, typecheck, build, and package smoke checks;
- the full test suite through `npm run coverage`;
- strict abstraction-memory validation with `npm run atree:validate`;
- deterministic evaluation with `npm run atree:evaluate`;
- doctor diagnostics with `npm run atree -- doctor --project . --strict`;
- tree export with `npm run atree -- export --project . --format mermaid`;
- prompt routing with `npm run atree:route`;
- goal planning with `npm run atree:goal -- --auto-route --review-required`;
- scope contract creation with `npm run atree -- scope --prompt ... --json`;
- assessment-pack generation with reduced noisy artifacts;
- `npm run self:loop -- --assessment-pack-only`, which creates evidence and
  stops before Codex assessment, mission planning, mission execution, and
  coherence review.

`npm run coverage` invokes `scripts/run-tests.mjs` under V8 coverage, so CI does
not run `npm test` a second time. That keeps one clear test-suite pass while
still preserving coverage artifact generation.

The workflow intentionally does not invoke Codex, run mission execution, use
provider adapters, push, open pull requests, or depend on secrets. Smoke commands
may create local generated artifacts in the CI checkout, but the workflow does
not treat those as durable committed memory.

## Strict drift gate

Use this when you want CI to show exactly which stable generated memory files
would change after a fresh scan. This is stricter than validation alone because
it rewrites the local CI checkout and fails on any diff in the durable baseline.

```yaml
name: Abstraction Tree Drift Gate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  atree:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.x
          cache: npm
      - run: npm ci
      - run: npx atree validate --project . --strict
      - run: npx atree scan --project .
      - name: Fail if generated memory changed
        shell: bash
        run: |
          git diff --exit-code -- \
            .abstraction-tree/files.json \
            .abstraction-tree/import-graph.json \
            .abstraction-tree/ontology.json \
            .abstraction-tree/tree.json \
            .abstraction-tree/concepts.json \
            .abstraction-tree/invariants.json
```

This diff intentionally focuses on stable generated memory. `atree scan` also
writes timestamped `.abstraction-tree/changes/scan.*.json` records; teams should
review and commit meaningful semantic change records, but a CI scan record is
usually not a useful required artifact for every run.

If this gate fails, run the same commands locally:

```bash
npx atree scan --project .
npx atree validate --project . --strict
git diff -- .abstraction-tree
```

Commit the memory updates when they describe the same product, docs, package, or
architecture change as the PR. Do not commit memory updates that only reflect
local secrets, ignored runtime state, generated build output, or unrelated
working tree changes.

## PR context pack artifact

Use this optional workflow when reviewers or agents benefit from a compact
Abstraction Tree context pack attached to each PR. It validates memory first,
then uploads markdown plus the generated JSON context pack as a GitHub Actions
artifact.

```yaml
name: Abstraction Tree PR Context

on:
  pull_request:

jobs:
  context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.x
          cache: npm
      - run: npm ci
      - run: npx atree validate --project . --strict
      - name: Build context pack
        shell: bash
        env:
          ATREE_TARGET: ${{ github.event.pull_request.title }}
        run: |
          mkdir -p atree-artifacts/context-packs
          npx atree context --project . --target "$ATREE_TARGET" --format markdown --why > atree-artifacts/context.md
          cp .abstraction-tree/context-packs/*.json atree-artifacts/context-packs/
      - uses: actions/upload-artifact@v4
        with:
          name: abstraction-tree-context
          path: atree-artifacts
```

Context packs are useful review artifacts, but they are not required for a
deterministic validation gate. Commit context packs only when your project treats
specific packs as durable memory. For ordinary PR review, uploading them as
artifacts keeps generated review context out of the branch.

## Choosing a strategy

- Validation only: run `npx atree validate --project .`. This checks schema and
  memory consistency, but warnings do not fail the job.
- Validation plus drift detection: run
  `npx atree validate --project . --strict`. This is the recommended default PR
  gate.
- Scan and fail on generated-memory changes: run `npx atree scan --project .`
  and `git diff --exit-code` on stable `.abstraction-tree/` memory files.
- Context artifact: run `npx atree context` after validation and upload the
  generated pack for reviewers.

Keep adopter CI deterministic. The commands above do not require API keys,
network access beyond package installation, provider adapters, or a running
visual app.
