# Packaging and install modes

Abstraction Tree supports two install modes because the abstraction layer should be useful even when a developer does not want a visual interface.

The package names below are the intended public npm package names. They are valid workspace package names in this repository, but they are not installable from the npm registry until the first publish. Before that release, use the repo-local scripts from the root README.

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
npm install -D @abstraction-tree/cli
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

Example:

```bash
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree serve
```

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

The planned public release covers these npm packages:

```txt
@abstraction-tree/core
@abstraction-tree/cli
@abstraction-tree/app
abstraction-tree
```

The root package is private and is not published.

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
npm run release:changelog -- --version 0.1.0
```

Omit `-- --version <version>` to validate the version currently recorded in the
root `package.json`.

## Release dry run

Run the packaging smoke test first because it validates tarball contents,
installability, linked binaries, and installed commands:

```bash
npm run build
npm run pack:smoke
```

Then run the publish dry run:

```bash
npm run release:dry-run -- --version 0.1.0
```

`release:dry-run` verifies synchronized package versions, verifies the
changelog section, and runs `npm publish --dry-run` in each publishable package
directory. It does not publish or tag anything.

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
npm run pack:smoke
npm run release:dry-run -- --version <version>
npm run atree:validate
```

6. Run the `Release Dry Run` GitHub Actions workflow with the same version.
7. Inspect the dry-run logs and confirm the package file lists contain only
   intended build artifacts, package manifests, README files, and binaries.
8. After packaging smoke tests are stable, publish manually from a clean checkout
   in dependency order:

```bash
npm publish --workspace @abstraction-tree/core --access public
npm publish --workspace @abstraction-tree/cli --access public
npm publish --workspace @abstraction-tree/app --access public
npm publish --workspace abstraction-tree
```

9. Create a GitHub release for tag `v<version>` using the matching changelog
   section as the release notes.
