---
id: mission-006
title: Honor `sourceRoot` and real ignore/glob semantics in the scanner
priority: P1
status: completed
project: abstraction-tree
---

# Mission 006: Honor `sourceRoot` and real ignore/glob semantics in the scanner

## Objective

Make scanning predictable for real repositories by supporting source roots and `.gitignore`-style patterns.

## Why this matters

The config includes `sourceRoot` and ignored paths, and core depends on `ignore`, but the scanner currently walks the project root and uses manual prefix checks.

## Scope

- Use `config.sourceRoot` as the scanner walk root while preserving project-relative output paths.
- Use the `ignore` package for `config.ignored` patterns.
- Optionally read root `.gitignore` patterns when configured.
- Add skipped-file or skipped-directory diagnostics for debugging.
- Add tests for nested source roots, glob ignores, and negated patterns if supported.

## Non-goals

- Do not implement every Git ignore edge case manually if the `ignore` package can handle it.

## Likely touchpoints

- `packages/core/src/scanner.ts`
- `packages/core/src/scanner.test.ts`
- `packages/core/src/workspace.ts`
- `docs/DATA_MODEL.md`

## Acceptance criteria

- [x] Changing `sourceRoot` affects scanned files as expected.
- [x] Glob ignores such as `**/*.generated.ts` work.
- [x] Existing default ignores continue to work.
- [x] Tests cover sourceRoot and ignore edge cases.

## Suggested checks

```bash
npm run build
npm test
npm run atree:scan
npm run atree:validate
```

## Completion notes

- Implementation summary:
  - `scanProject` now resolves `config.sourceRoot` as the walk root while emitting project-relative file paths.
  - Scanner ignores now use the `ignore` package for `config.ignored`, including glob and negated patterns.
  - Added optional `respectGitignore` config support to include root `.gitignore` patterns when enabled.
  - Scan results now include diagnostics for ignored files/directories and invalid source roots.
  - Data model docs describe `sourceRoot`, `.gitignore`-style `ignored`, and `respectGitignore`.
- Tests run:
  - `npm run build -w @abstraction-tree/core`
  - `npm run typecheck -w @abstraction-tree/core`
  - `node -e "import('./packages/core/dist/scanner.test.js')"`
  - `npm run build`
  - `npm test`
  - `npm run atree:scan`
  - `npm run atree:validate`
- Follow-up risks:
  - Negated patterns work for files reached by traversal; re-including files under an ignored directory still requires unignoring enough parent directories for the scanner to descend.
  - `respectGitignore` defaults to `false` to avoid surprising existing scans; projects must opt in to root `.gitignore` matching.
