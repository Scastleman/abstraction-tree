# Packaging and install modes

> Audience: Maintainers preparing packages or releases
> Status: Public beta release guidance
> Read after: GETTING_STARTED.md and STABLE_VS_EXPERIMENTAL.md.

Abstraction Tree supports two install modes because the abstraction layer should be useful even when a developer does not want a visual interface.

Both modes support the same product direction: local project memory for safer complex prompt implementation. Full mode adds the visual app so humans can inspect the generated abstraction tree before or after Codex runs scoped missions.

The package names below are public npm packages. The current published beta is `0.2.0-beta.1`; use the npm `beta` tag while the project is pre-v1. The npm registry currently also lists this beta as `latest` because it is the only published version, but docs should continue to recommend `@beta` until a stable v1 release is ready.

## Core-only package

Package: `@abstraction-tree/cli`

Use it for:

- `.abstraction-tree/` generation;
- deterministic project scanning;
- context packs for agents;
- CI validation;
- drift checks;
- semantic change records.

Example:

```bash
npm install -D @abstraction-tree/cli@beta
npx atree init --core
npx atree scan
npx atree validate
```

This mode does not install or require the visual app.

## Full package

Package: `abstraction-tree`

Use it for the complete local-first experience:

- everything in core-only mode;
- the local browser-based visual project explorer.

## Recommended Setup Flow

```bash
npm install -D abstraction-tree@beta
npx atree init --with-app
npx atree scan
npx atree serve --open
```

The `--open` flag launches the local visual app in the default browser after the server starts. Without it, `atree serve` prints the URL for manual opening. The app reads the target project's own `.abstraction-tree/` memory, not Abstraction Tree's dogfooding memory unless this repository is the target project.

The full package depends on:

```txt
@abstraction-tree/cli
@abstraction-tree/app
```

## Source of truth

The source of truth is always `.abstraction-tree/`. The visual app only reads and displays the data. It must not maintain a separate project model.

## Switching modes

A project can switch modes without deleting its tree data:

```bash
npx atree mode core
npx atree mode full
```

This updates `.abstraction-tree/config.json` only.

## Publishable packages

The public beta release covers these npm packages:

```txt
@abstraction-tree/core
@abstraction-tree/cli
@abstraction-tree/app
abstraction-tree
```

The root package is private and is not published.

## Dogfooding memory boundary

The root `.abstraction-tree/` folder in this repository is committed dogfooding memory for this repository only. It must not be published in npm packages and must not be copied into consumer projects.

Publishable workspace packages use explicit `files` allowlists. The packaging smoke test also inspects `npm pack --json` output and fails if any package includes `.abstraction-tree/` paths. After installing a packed CLI into a temporary project, the smoke test runs `atree init --core` and verifies that the new project starts with only:

```text
.abstraction-tree/
  config.json
  changes/
  context-packs/
```

`atree scan` then generates memory from the temporary project's own files. This separation is required for every release.

## Versioning strategy

Abstraction Tree uses synchronized SemVer across the publishable package set.
Every release bumps the root `package.json`, every publishable workspace
`package.json`, and internal workspace dependencies to the same version.

Use normal SemVer meaning for the synchronized version:

- patch for bug fixes, docs that affect release process correctness, and safe
  packaging fixes;
- minor for backward-compatible CLI, schema, scanner, app, or package additions;
- major for breaking CLI behavior, package entrypoints, schema contracts, or
  install-mode changes.

Prereleases use the same prerelease suffix across all packages, such as
`0.2.0-beta.1`. Independent package versioning should wait until the project has
stable compatibility guarantees and a documented support matrix.

## Changelog requirement

Every release must have a `CHANGELOG.md` section for the exact synchronized
version being released. Keep an `Unreleased` section at the top for the next
release.

Validate the changelog and synchronized versions with:

```bash
npm run release:changelog -- --version <version>
```

For the current public beta, use:

```bash
npm run release:changelog -- --version 0.2.0-beta.1
```

Omit `-- --version <version>` to validate the version currently recorded in the root `package.json`.

## Release dry run

Run the packaging smoke test directly during development when you want the
fastest package/installability signal:

```bash
npm run build
npm run pack:smoke
```

Run the full release preflight before publishing:

```bash
npm run release:dry-run -- --version <version>
```

For the current public beta, use:

```bash
npm run release:dry-run -- --version 0.2.0-beta.1
```

`release:dry-run` verifies synchronized package versions, verifies the
changelog section, runs the package smoke test, and runs `npm publish
--dry-run` in each publishable package directory. The package smoke test checks
tarball contents, dogfooding-memory exclusion, local tarball installability,
linked binaries, `init`, `scan`, `doctor`, `validate`, `context`, `export`, and
local app serving. It also verifies that the temporary installed project starts
with blank memory and that `scan` generates memory from that project instead of
copying this repository's dogfooding memory. It does not publish, tag, open a
browser, or move npm dist-tags.

## Prerelease path

Use a public prerelease before a v1 label. The current first public testing path is the synchronized `0.2.0-beta.1` release under the npm `beta` dist-tag. A later `1.0.0-rc.1` can use the `next` dist-tag only after the v1 release gate is nearly complete.

Prerelease procedure:

1. Choose the synchronized prerelease version.
2. Update root and publishable package versions plus internal package dependency pins.
3. Move relevant `CHANGELOG.md` entries into the prerelease version section.
4. Run `npm run release:dry-run -- --version <candidate-version>`.
5. Follow [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md) for manual publish. Agents must not publish packages, move dist-tags, or handle credentials.
6. Verify in a brand-new external directory:

```bash
npm install -D abstraction-tree@beta
npx atree init --with-app
npx atree scan
npx atree doctor
npx atree validate
npx atree export --format mermaid
npx atree serve
```

Capture post-publish verification in [release-evidence/beta-verification-template.md](release-evidence/beta-verification-template.md) or a copy of that template. The `0.2.0-beta.1` verification is recorded in [release-evidence/2026-05-14-0.2.0-beta.1-verification.md](release-evidence/2026-05-14-0.2.0-beta.1-verification.md).

If a prerelease package is broken, deprecate that exact version with a clear message and publish a fixed prerelease. Do not intentionally promote `latest` to a stable release until [V1_RELEASE_GATE.md](V1_RELEASE_GATE.md) passes. For `0.2.0-beta.1`, npm also assigned `latest` to the first published version; the supported install docs still use `@beta`.

## Maintainer release checklist

1. Start from an up-to-date `main` branch with no unrelated local changes.
2. Choose the next synchronized SemVer version.
3. Update the root package, every publishable package, internal package
   dependency pins, and `package-lock.json` to the same version.
4. Move the relevant `CHANGELOG.md` entries into a section for that exact
   version and add the release date.
5. Run the local preflight checks:

```bash
npm run format:check
npm run check:unicode
npm run lint
npm run typecheck
npm run build
npm run coverage
npm test
npm run release:dry-run -- --version <version>
npm run atree:validate
npm run atree -- doctor --project . --strict
```

6. Run the `Release Dry Run` GitHub Actions workflow with the same version.
7. Inspect the dry-run logs and confirm the package file lists contain only
   intended build artifacts, package manifests, README files, and binaries. They must not contain root `.abstraction-tree/` dogfooding memory.
8. After packaging smoke tests are stable, follow [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md). Publish manually from a clean checkout in dependency order:

```bash
npm publish --workspace @abstraction-tree/core --access public --tag beta
npm publish --workspace @abstraction-tree/cli --access public --tag beta
npm publish --workspace @abstraction-tree/app --access public --tag beta
npm publish --workspace abstraction-tree --tag beta
```

9. Create a GitHub release for tag `v<version>` using the matching changelog
   section as the release notes.
