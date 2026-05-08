---
id: mission-019
title: Report malformed change-record JSON during validation
priority: P1
status: completed
project: abstraction-tree
---

# Mission 019: Report malformed change-record JSON during validation

## Objective

Ensure `atree validate` reports invalid `.abstraction-tree/changes/*.json` files without breaking resilient change loading for context generation.

## Why this matters

Prior run notes identified that validation can miss JSON parse failures in change records because invalid files are skipped before `validateChanges` sees them.

## Scope

- Refactor `loadChanges` or add a shared change-record loader that returns records plus parse issues.
- Preserve tolerant behavior for commands that only need valid change records.
- Surface malformed JSON as validation issues with file paths.
- Add tests for invalid JSON, non-object JSON, and malformed ChangeRecord shapes.
- Consider reusing change review loading logic to avoid duplication.

## Non-goals

- Do not stop context-pack generation solely because one historical change record is malformed.
- Do not delete malformed files automatically.

## Likely touchpoints

- `packages/cli/src/index.ts`
- `packages/core/src/changeReview.ts`
- `packages/core/src/validator.ts`
- `packages/core/src/validator.test.ts`

## Acceptance criteria

- [ ] `atree validate` reports invalid change-record JSON files.
- [ ] Context generation still succeeds using valid change records.
- [ ] Tests cover parse failures and shape failures separately.
- [ ] Validation messages include recovery hints.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: Added shared change-record loading in `packages/core/src/workspace.ts` that returns valid records plus parse/schema issues, made `readChangeRecords` tolerant for context/API consumers, and reused the shared object loader in change review. Validation now retains file paths and recovery hints for malformed `.abstraction-tree/changes/*.json` files.
- Tests run: `npm.cmd run build -w @abstraction-tree/core`; `node -e "import('./packages/core/dist/runtimeSchema.test.js')"`; `node -e "import('./packages/core/dist/changeReview.test.js')"`; `npm.cmd run build`; `npm.cmd test`; `npm.cmd run atree:validate`.
- Follow-up risks: `npm.cmd run atree:validate` exits non-zero under `--strict` because the edited source files are stale relative to the current `.abstraction-tree` scan; no malformed change-record issues were present in the working tree during validation.
