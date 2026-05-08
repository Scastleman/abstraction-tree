---
id: mission-005
title: Add lint, typecheck, and coverage targets to CI
priority: P1
status: completed
project: abstraction-tree
---

# Mission 005: Add lint, typecheck, and coverage targets to CI

## Objective

Strengthen quality gates beyond build/test by adding explicit linting, typechecking, and coverage reporting.

## Why this matters

The repo has strict TypeScript and useful tests, but no dedicated lint, typecheck, or coverage scripts. These gates catch maintainability and regression issues earlier.

## Scope

- Choose a lightweight lint setup compatible with NodeNext TypeScript and ESM.
- Add `typecheck` scripts per workspace or a root aggregate script.
- Add coverage using Node test coverage or another minimal tool.
- Update CI to run lint, typecheck, coverage, and existing checks.
- Document the new local contributor command sequence.

## Non-goals

- Do not impose heavy stylistic rules that duplicate the custom formatter.
- Do not block all work on arbitrary coverage thresholds initially.

## Likely touchpoints

- `package.json`
- `.github/workflows/ci.yml`
- `tsconfig.base.json`
- `CONTRIBUTING.md`

## Acceptance criteria

- [x] `npm run lint`, `npm run typecheck`, and `npm run coverage` exist at the root.
- [x] CI runs the new scripts.
- [x] Baseline coverage report is generated and documented.
- [x] Rules are focused on correctness and maintainability.

## Suggested checks

```bash
npm run lint
npm run typecheck
npm run coverage
npm run build
npm test
```

## Completion notes

- Implementation summary: Added root `lint`, `typecheck`, and `coverage` scripts; added per-workspace `typecheck` scripts for core, CLI, and app; implemented a lightweight TypeScript-parser lint runner for focused tests, `debugger` statements, and NodeNext relative import extensions in workspace code; wired CI to run lint, typecheck, and coverage; documented the local contributor command sequence and coverage baseline behavior.
- Tests run: `npm run lint`; `npm run typecheck`; `npm run coverage` (baseline: 86.81% lines, 81.38% branches, 89.89% functions); `npm run build`; `npm test`; `npm run format:check`; `npm run check:unicode`; `npm run atree:scan`; `npm run atree:validate`.
- Follow-up risks: `npm run pack:smoke` was attempted but this sandbox blocked `npm pack` startup with `spawn EPERM`; CI should still run the existing smoke gate in its normal environment. No coverage threshold is enforced yet by design.
