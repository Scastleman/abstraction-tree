---
id: mission-016
title: Expand scanner language and extension coverage
priority: P1
status: completed
project: abstraction-tree
---

# Mission 016: Expand scanner language and extension coverage

## Objective

Support more common project files while preserving deterministic, bounded scanning.

## Why this matters

The scanner covers several text/code extensions, but real repos often contain `.mts`, `.cts`, `.cjs`, `.mdx`, `.toml`, shell scripts, PowerShell, HTML, CSS, and other common files.

## Scope

- Add descriptors for `.mts`, `.cts`, `.cjs`, `.mdx`, `.toml`, `.sh`, `.ps1`, `.html`, `.css`, and `.scss` where reasonable.
- Improve test detection by language conventions, such as Python `test_*.py` and Go `*_test.go`.
- Add fixture tests for each new extension class.
- Ensure large file and binary protections still work.
- Document supported languages/extensions.

## Non-goals

- Do not add full tree-sitter parsing in this mission.
- Do not scan binary or huge generated files.

## Likely touchpoints

- `packages/core/src/scanner.ts`
- `packages/core/src/scanner.test.ts`
- `docs/ARCHITECTURE.md`
- `README.md`

## Acceptance criteria

- [x] New extensions are summarized with correct language labels.
- [x] Additional language test-file conventions are recognized.
- [x] Regression tests cover representative files.
- [x] Docs list supported extensions and parse strategies.

## Suggested checks

```bash
npm run build
npm test
npm run atree:scan
npm run atree:validate
```

## Completion notes

- Implementation summary: Added scanner descriptors for `.mts`, `.cts`, `.cjs`, `.mdx`, `.toml`, `.sh`, `.ps1`, `.html`, `.css`, and `.scss`; kept JS/TS module variants on TypeScript AST scanning; added regex extraction for shell, PowerShell, CSS/SCSS, HTML, TOML, and MDX signals; added Python `test_*.py`/`*_test.py` and Go `*_test.go` detection; added byte-sample binary skipping while preserving the 512,000 byte file limit; aligned import graph resolution with `.mts`, `.cts`, and `.cjs`.
- Tests run: `npm.cmd run build`; `npm.cmd test`; `npm.cmd run atree:scan`; `npm.cmd run atree:validate`. A direct `npm run build -w @abstraction-tree/core` attempt was blocked by the local PowerShell `npm.ps1` execution policy, so the checks were run with `npm.cmd`.
- Follow-up risks: Regex extraction is intentionally shallow for non-JS languages; richer per-language symbol extraction remains a future tree-sitter or parser-backed mission.
