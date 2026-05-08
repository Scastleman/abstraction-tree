---
id: mission-018
title: Update contributing docs with the full dogfooding contract
priority: P1
status: completed
project: abstraction-tree
---

# Mission 018: Update contributing docs with the full dogfooding contract

## Objective

Make contributor expectations match the actual CI checks and `.abstraction-tree` memory policy.

## Why this matters

`CONTRIBUTING.md` currently asks for install and build. Contributors need to know when to run formatting, tests, validation, evaluation, and memory regeneration.

## Scope

- Update `CONTRIBUTING.md` with the canonical local check sequence.
- Document when `.abstraction-tree/` should be regenerated after changes.
- Document which `.abstraction-tree/automation/*` files are committed vs ignored.
- Add a PR checklist section for tests, docs, examples, and memory updates.
- Cross-link agent protocol and packaging docs.

## Non-goals

- Do not require contributors to run autonomous loops.
- Do not require app mode for core-only changes.

## Likely touchpoints

- `CONTRIBUTING.md`
- `docs/AGENT_PROTOCOL.md`
- `docs/PACKAGING.md`
- `README.md`

## Acceptance criteria

- [x] Contributing docs match CI commands.
- [x] Dogfooding memory update policy is explicit.
- [x] PR checklist covers docs, tests, examples, and abstraction memory.
- [x] New contributors can follow the docs without prior project context.

## Suggested checks

```bash
npm run format:check
npm run check:unicode
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: expanded `CONTRIBUTING.md` with the full CI-equivalent local check sequence, dogfooding memory regeneration and evaluation guidance, committed-versus-ignored `.abstraction-tree/automation/*` boundaries, PR checklist, and links to agent protocol, packaging, and README dogfooding docs. Added a semantic change record for the contributor contract update.
- Tests run: `npm.cmd run format:check` passed; `npm.cmd run check:unicode` passed; `npm.cmd run lint` passed; `npm.cmd run typecheck` passed; `npm.cmd run build` passed; `npm.cmd run coverage` passed with 129 tests; `npm.cmd test` passed with 129 tests; `npm.cmd run atree:scan` passed; `npm.cmd run atree:validate` passed. Direct `npm run format:check` was blocked by local PowerShell execution policy for `npm.ps1`, so `npm.cmd` was used for npm scripts. `npm.cmd run pack:smoke` was blocked by sandbox `spawn EPERM` while starting `npm pack --dry-run`.
- Follow-up risks: packaging smoke coverage still needs confirmation in a normal developer shell or CI environment because this sandbox blocks the dry-run pack subprocess.
