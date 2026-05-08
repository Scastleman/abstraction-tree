---
id: mission-003
title: Add package publishing smoke tests
priority: P0
status: completed
project: abstraction-tree
---

# Mission 003: Add package publishing smoke tests

## Objective

Prove that the packed CLI, core, app, and full package work after installation outside the monorepo.

## Why this matters

Workspace builds can pass while published packages are missing files, bins, app bundles, or dependency metadata. A temporary install smoke test catches these before users do.

## Scope

- Add `npm pack --dry-run` checks for each publishable package.
- Create a temp project, install the packed `abstraction-tree` tarball, and run `npx atree init --core`.
- Run `npx atree scan`, `npx atree validate`, and `npx atree context --target checkout` in the temp project.
- Verify CLI bin paths and app dist lookup still work from installed package layout.
- Add this smoke test to CI.

## Non-goals

- Do not publish to npm in CI for this mission.
- Do not add release automation yet; keep this as a pre-release packaging check.

## Likely touchpoints

- `package.json`
- `packages/core/package.json`
- `packages/cli/package.json`
- `packages/app/package.json`
- `packages/full/package.json`
- `scripts/pack-smoke-test.mjs`
- `.github/workflows/ci.yml`

## Acceptance criteria

- [x] A single script can run the packaging smoke test locally.
- [x] CI runs the smoke test on pull requests.
- [x] Packed packages include only intended files and include required runtime files.
- [x] Failure messages identify which package or installed command failed.

## Suggested checks

```bash
npm run build
node scripts/pack-smoke-test.mjs
npm test
```

## Completion notes

- Implementation summary: Added `scripts/pack-smoke-test.mjs`, `npm run pack:smoke`, CI execution after build, and constrained package file manifests for the core, CLI, and app packages.
- Tests run: `npm run build`; `npm run pack:smoke`; `npm test`.
- Follow-up risks: The smoke install uses the public npm dependency resolver for third-party runtime dependencies, so CI must continue to run with registry access or a warm/cache-backed npm setup.
