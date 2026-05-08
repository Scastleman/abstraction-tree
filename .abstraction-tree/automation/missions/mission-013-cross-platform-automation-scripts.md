---
id: mission-013
title: Make automation scripts cross-platform or clearly Windows-scoped
priority: P2
status: completed
project: abstraction-tree
---

# Mission 013: Make automation scripts cross-platform or clearly Windows-scoped

## Objective

Reduce contributor friction by providing cross-platform Node wrappers or clear Windows-only documentation for automation loops.

## Why this matters

Several root automation scripts call PowerShell directly. That may be fine for local operations, but public contributors on macOS/Linux need a clear path.

## Scope

- Audit PowerShell scripts and decide which should remain Windows-specific.
- Create Node wrappers for cross-platform operations where feasible.
- Document platform requirements for bounded autonomous loops.
- Ensure CI does not depend on local-only runtime state.
- Add smoke tests for cross-platform wrappers where possible.

## Non-goals

- Do not make autonomous loops run in public CI.
- Do not weaken existing loop guardrails.

## Likely touchpoints

- `package.json`
- `scripts/*.ps1`
- `scripts/*.mjs`
- `docs/AGENT_PROTOCOL.md`
- `docs/ARCHITECTURE.md`

## Acceptance criteria

- [x] Contributors can run core checks on macOS/Linux without PowerShell-specific commands.
- [x] Windows-only automation commands are labeled clearly.
- [x] Docs explain local runtime files and ignore policy.
- [x] Existing automation guardrails remain intact.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: `npm run diff:summary` now uses the Node wrapper, direct PowerShell npm commands are explicitly scoped behind `:windows` names, the diff summary wrapper exposes a testable runner, and docs now separate cross-platform checks from Windows-only local loop automation.
- Tests run: `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run atree:scan`, and `npm.cmd run atree:validate`. Plain `npm run build` was blocked by this machine's PowerShell execution policy for `npm.ps1`, so the same npm scripts were executed through `npm.cmd`. An extra `npm.cmd run diff:summary -- --json` smoke attempt reached the Node wrapper but was blocked by this sandbox when the wrapper tried to spawn `git` (`spawn EPERM`); the wrapper now reports that as a concise collection error.
- Follow-up risks: autonomous loop and mission-runner orchestration remain Windows PowerShell scoped; a future cross-platform Node port should preserve the same runtime guardrails before replacing those scripts.
