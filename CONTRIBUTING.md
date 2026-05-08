# Contributing

Abstraction Tree is designed around one principle: humans and agents should share the same project memory.

Good contributions improve one of these layers:

- scanner accuracy;
- abstraction tree schema;
- visual comprehension;
- agent protocol;
- drift validation;
- language support;
- context compression.

Before opening a PR, run:

```bash
npm ci
npm run format:check
npm run check:unicode
npm run lint
npm run typecheck
npm run build
npm run coverage
npm run pack:smoke
npm test
npm run atree:validate
```

This is the same command sequence enforced by CI after checkout. Use `npm install` for day-to-day dependency updates, but use `npm ci` when you want to reproduce CI from a clean lockfile state.

`npm run coverage` uses Node's built-in test coverage reporting against the built package artifacts and script tests. The report establishes the current baseline in CI, but there is no coverage threshold yet. `npm run pack:smoke` verifies the publishable package tarballs, installed binaries, and installed commands; it is part of CI for every PR.

For feature work, update docs and the example project when relevant.

## Dogfooding memory

This repository dogfoods Abstraction Tree on itself. The root `.abstraction-tree/` folder is committed project memory, not disposable build output.

Regenerate the root memory in the same PR when you intentionally change scanned project facts, including:

- package source, CLI behavior, scanner/tree/context/validator behavior, app structure, scripts, adapters, or package metadata;
- docs that describe architecture, packaging, agent protocol, contributor workflow, or public behavior;
- examples or fixture behavior that scanner, validation, or context-pack tests depend on;
- durable concepts, invariants, ownership boundaries, or abstraction layers.

Use the built CLI so local memory matches the package artifacts:

```bash
npm run build
npm run atree:scan
npm run atree:validate
```

Run `npm run atree:evaluate` when a change materially affects scanner quality, tree shape, context-pack selection, automation health, or accumulated abstraction-memory quality. It is a diagnostic quality signal, not a required CI command for every PR.

Do not regenerate or commit memory for ignored local runtime state, logs, secrets, or machine-local Codex state. Do not run autonomous loop commands for normal PRs. Do not run app mode or `atree serve` for core-only changes unless the change affects the visual app.

When a change alters behavior, architecture, packaging, protocol, or durable contributor expectations, add a semantic change record under `.abstraction-tree/changes/` in addition to any generated scan record.

## Automation files

Commit stable automation inputs and examples:

- `.abstraction-tree/automation/codex-loop-prompt.md`
- `.abstraction-tree/automation/loop-config.json`
- `.abstraction-tree/automation/loop-runtime.example.json`
- `.abstraction-tree/automation/mission-runtime.example.json`
- `.abstraction-tree/automation/missions/*.md`

Keep local runtime state ignored and uncommitted:

- `.abstraction-tree/automation/loop-runtime.json`
- `.abstraction-tree/automation/mission-runtime.json`
- `.abstraction-tree/automation/mission-logs/`
- `.abstraction-tree/automation/*.log`
- `.env`, API keys, and other secrets

## PR checklist

- [ ] Tests: ran the relevant focused tests and the full local CI sequence above, or documented why a command could not run.
- [ ] Docs: updated README or `docs/` pages when public behavior, setup, packaging, or agent workflow changed.
- [ ] Examples: updated `examples/small-web-app` and its fixture expectations when scanner, tree, context, or validator behavior changed.
- [ ] Abstraction memory: ran `npm run atree:scan` and `npm run atree:validate` when scanned project facts changed, and added a semantic change record when durable project meaning changed.

## Related docs

- [Agent protocol](docs/AGENT_PROTOCOL.md)
- [Packaging and install modes](docs/PACKAGING.md)
- [Dogfooding overview](README.md#dogfooding)
