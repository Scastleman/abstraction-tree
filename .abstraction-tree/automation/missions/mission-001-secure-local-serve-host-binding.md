---
id: mission-001
title: Bind `atree serve` to localhost by default
priority: P0
status: completed
project: abstraction-tree
---

# Mission 001: Bind `atree serve` to localhost by default

## Objective

Make the local visual app safe-by-default by binding the HTTP server to loopback unless the user explicitly opts into LAN exposure.

## Why this matters

The CLI serves `/api/state`, which exposes local project abstraction memory. The current implementation calls `server.listen(port)` without a host, which may bind beyond localhost depending on platform defaults.

## Scope

- Update `packages/cli/src/index.ts` serve command host handling.
- Add a `--host <host>` option with default `127.0.0.1` or `localhost`.
- Warn clearly when binding to `0.0.0.0`, `::`, or any non-loopback host.
- Update README/docs command examples if needed.
- Add tests for default host selection and warning behavior.

## Non-goals

- Do not add remote auth or public cloud hosting.
- Do not change the shape of `/api/state` in this mission.

## Likely touchpoints

- `packages/cli/src/index.ts`
- `packages/cli/src/*.test.ts`
- `README.md`
- `docs/ARCHITECTURE.md`

## Acceptance criteria

- [x] `atree serve` defaults to loopback binding.
- [x] `atree serve --host 0.0.0.0` still works but prints a risk warning.
- [x] Tests verify the host default and explicit host option.
- [x] CI passes: format, Unicode check, build, tests, and `atree:validate`.

## Suggested checks

```bash
npm run format:check
npm run check:unicode
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Record implementation summary here.
- Record tests run here.
- Record follow-up risks here.

Implementation summary:

- Added `--host <host>` to `atree serve`, defaulting to `127.0.0.1`.
- Changed server startup to call `server.listen(port, host, ...)` and print the actual bound URL.
- Added a clear `/api/state` exposure warning for wildcard and non-loopback host bindings.
- Documented the safe default and explicit LAN opt-in in README and architecture docs.
- Refreshed root abstraction memory after code/docs changes.

Tests run:

- `npm run format:check`
- `npm run check:unicode`
- `npm run build`
- `npm test`
- `npm run atree:scan`
- `npm run atree:validate`

Follow-up risks:

- None for this mission.
