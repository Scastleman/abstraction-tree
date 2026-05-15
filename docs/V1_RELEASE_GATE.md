# V1 Release Gate

> Audience: Maintainers and release reviewers
> Status: Required gate before a v1 label
> Read after: GETTING_STARTED.md, STABLE_VS_EXPERIMENTAL.md, PACKAGING.md, and VISUAL_DEMO.md.

A real v1 means the stable path is installable, documented, tested, visually demonstrated, schema-conscious, and safe by default.

This page is the release gate for calling Abstraction Tree v1. It does not mark the project v1-ready by itself; it defines what must be true before maintainers can make that claim.

## Stable User Path

The stable path must work in a project that is not this repository:

```bash
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree doctor
npx atree validate
npx atree context --target checkout
npx atree export --format mermaid
npx atree serve --open
```

For future release candidates, the equivalent local-tarball path must also pass through `npm run pack:smoke` before public publish.

Pass criteria:

- `init` creates blank project-local memory only.
- `scan` generates memory from the target project's files.
- `doctor --json` reports the target project, not this repository's dogfooding memory.
- `validate` passes on the generated memory.
- `context`, `export`, and `serve` work without providers or API keys.
- `serve --open` remains opt-in; tests must not launch a browser.

## Install And Package Gate

Pass criteria:

- `npm run pack:smoke` installs local tarballs into a temporary external project.
- Packed packages include only intended files and exclude root `.abstraction-tree/` dogfooding memory.
- Linked binaries are verified from the installed project.
- The full package can serve the local app from the installed tarball.
- `npm run release:dry-run -- --version <candidate-version>` passes before any publish. For the current beta candidate, use `npm run release:dry-run -- --version 0.2.0-beta.1`.
- Public beta verification is recorded from a clean external directory using [release-evidence/beta-verification-template.md](release-evidence/beta-verification-template.md).

Prerelease plan:

- Use a synchronized prerelease such as `0.2.0-beta.1` for public beta testing while the project is still pre-v1.
- Use the npm `beta` dist-tag for beta builds or `next` for release candidates.
- Publish in dependency order: `@abstraction-tree/core`, `@abstraction-tree/cli`, `@abstraction-tree/app`, then `abstraction-tree`.
- If a package is broken, deprecate the broken version with a clear message and publish a fixed prerelease. Do not intentionally promote `latest` to a stable release until the stable path passes. The first beta may appear as `latest` on npm because it is the only published version; public docs should still recommend the prerelease tag until v1.
- Follow [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md) for manual publish and post-publish verification. Agents must not publish packages, move dist-tags, create credentials, or handle 2FA.

## Schema And Migration Gate

Pass criteria:

- `docs/DATA_MODEL.md` states the current schema version and compatibility policy.
- `atree migrate --dry-run` is tested and does not write files.
- Future schema versions fail with actionable messages.
- Unsupported older schema versions require an explicit migration path.
- `scan`, `validate`, and `serve` do not silently rewrite schema versions.
- When a future migration writes memory, it must validate before and after the migration and create backups for changed files unless backup creation is explicitly disabled.

The current schema is `0.1.0`. It is intentionally a no-op migration state; v1 requires the migration contract to be clear even before the first breaking schema change exists.

## Visual Proof Gate

Pass criteria:

- `docs/VISUAL_DEMO.md` embeds real screenshots from the local app.
- The README embeds at least one representative screenshot.
- Screenshots show a real target project, preferably `examples/small-web-app`.
- The app visibly supports the v1 stable scope: tree hierarchy, node details, file ownership, concepts, invariants, changes, and health.
- Screenshot freshness is reviewed before release when UI layout, `/api/state` payloads, node details, or visual-demo docs change.
- `docs:commands` verifies that referenced screenshot files exist.

Goal workspace and mission-plan visualization is post-v1 unless a small read-only panel lands without weakening the stable app. v1 does not require visual mission execution.

## Docs And Changelog Gate

Pass criteria:

- README is a concise entry point, not the whole manual.
- `docs/README.md` owns the docs map.
- `docs:commands` passes and catches stale npm scripts, stale `atree` commands, and missing Markdown doc links.
- `CHANGELOG.md` has accurate unreleased or candidate release notes.
- Public docs do not claim full autonomous self-improvement or guaranteed correctness.
- Beta and experimental workflows are clearly labeled.
- `goal --review-required` remains beta through the first v1 unless external beta evidence justifies graduating only the planning surface.

## CI And Release Preflight Gate

Before a v1 or release candidate tag, run:

```bash
npm run format:check
npm run check:unicode
npm run docs:commands
npm run lint
npm run audit:security
npm run typecheck
npm run build
npm run coverage
npm run package:size
npm run pack:smoke
npm run release:dry-run -- --version <candidate-version>
npm run atree:scan
npm run atree:validate
npm run atree:evaluate
npm run atree -- doctor --project . --strict
npm run diff:summary
```

CI must run the build and coverage suite on at least Ubuntu and Windows, fail
below the configured coverage thresholds, fail on high-severity npm audit
findings, report package tarball and installed sizes, and rehearse package
creation from a clean checkout. CI must not invoke Codex, run mission execution,
push, merge, require secrets, or launch a browser.

## Memory Hygiene Gate

Pass criteria:

- Root `.abstraction-tree/` memory validates.
- Evaluation does not warn about excessive generated scan records, or the warning is intentionally explained with a bounded cleanup plan.
- The repo retains semantic change records and the latest generated scan baseline.
- External projects do not inherit this repo's dogfooding memory.

Use:

```bash
npm run atree -- changes review --project . --summary
npm run atree -- changes prune-generated --project . --apply
```

`prune-generated` deletes only superseded generated scan records and keeps semantic records plus the newest generated scan.

## Explicit V1 Non-Goals

- No claim of fully autonomous self-improving software.
- No auto-merge or auto-publish behavior.
- No default LLM/provider calls during scan, validate, context, export, evaluate, or serve.
- No guarantee that generated tree memory is perfect semantic understanding.
- No stable promise for `missions:run`, `self:loop`, `propose`, or `goal --run`.
- No requirement that the visual app executes missions or replaces human review.

## Release Decision

A release candidate may be cut when every gate above is either passing or documented as an explicit blocker in `docs/V1_RELEASE_CANDIDATE_REVIEW.md`.

Do not call the project v1-ready if public package install verification is missing or stale, screenshots are missing, release dry-run fails, root memory is invalid, or beta/experimental workflows are presented as stable.
