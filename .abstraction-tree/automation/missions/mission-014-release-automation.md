---
id: mission-014
title: Add release and changelog automation
priority: P2
status: completed
project: abstraction-tree
---

# Mission 014: Add release and changelog automation

## Objective

Make publishing repeatable, auditable, and safe for the CLI/app package set.

## Why this matters

The repo has multiple publishable packages but no formal release workflow, changelog, or dry-run release documentation.

## Scope

- Add a changelog and release process documentation.
- Choose versioning strategy for synchronized packages.
- Add `npm publish --dry-run` or equivalent release dry-run checks.
- Add GitHub release workflow or manual checklist.
- Add README badges for CI, license, and package status once appropriate.

## Non-goals

- Do not publish automatically before packaging smoke tests are stable.
- Do not introduce complex release tooling unless needed.

## Likely touchpoints

- `CHANGELOG.md`
- `docs/PACKAGING.md`
- `package.json`
- `.github/workflows/release.yml`

## Acceptance criteria

- [x] Maintainers have a documented release checklist.
- [x] Dry-run publish validates package contents.
- [x] Changelog entries are required or generated for releases.
- [x] Versioning approach is documented.

## Suggested checks

```bash
npm run build
npm test
node scripts/pack-smoke-test.mjs
npm run atree:validate
```

## Completion notes

- Implementation summary: added `CHANGELOG.md`, synchronized-version and changelog validation through `npm run release:changelog`, package publish dry-run automation through `npm run release:dry-run`, a manual `Release Dry Run` GitHub Actions workflow, README CI/license/npm badges, and release/versioning/checklist documentation in `docs/PACKAGING.md`.
- Tests run: `npm.cmd run format:check`, `npm.cmd run check:unicode`, `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd test`, `npm.cmd run coverage`, `npm.cmd run release:changelog`, `node scripts/check-changelog.test.mjs`, `npm.cmd run atree:scan`, and `npm.cmd run atree:validate`.
- Follow-up risks: this sandbox blocks Node child-process package dry runs with `spawn EPERM`, so `npm.cmd run pack:smoke` and `npm.cmd run release:dry-run` could not complete locally here. The scripts are wired for normal developer and GitHub Actions environments; maintainers should confirm those two dry-run checks in CI before any real npm publish.
