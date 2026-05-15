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
npm run docs:commands
npm run lint
npm run audit:security
npm run typecheck
npm run build
npm run coverage
npm run package:size
npm run pack:smoke
npm run atree:validate
```

This mirrors the main local CI gates after checkout. CI also runs the build and coverage suite on both Ubuntu and Windows, then runs package smoke checks and a clean-checkout publish rehearsal on Ubuntu. Use `npm install` for day-to-day dependency updates, but use `npm ci` when you want to reproduce CI from a clean lockfile state.

`npm run coverage` runs the full test suite through `c8` and fails when global package-source coverage drops below 80% for statements, branches, functions, or lines. The threshold excludes script wrappers, adapters, test files, and example fixture tests from the measured package-source baseline, but those tests still run. If coverage fails, add focused tests or intentionally adjust the threshold in `scripts/run-coverage.mjs` with a clear rationale.

`npm run audit:security` fails on high-severity npm advisories. Upgrade, replace, or remove the vulnerable dependency before merging; only document an exception when no patched release exists and the vulnerable path is not reachable.

`npm run package:size` measures compressed tarball size and installed unpacked size for each publishable package. If it fails, inspect the dry-run package file list, remove accidental artifacts, or intentionally raise the budget in `scripts/check-package-size.mjs` with release-note context. `npm run pack:smoke` verifies the publishable package tarballs, installed binaries, installed commands, and app serving path; it is part of CI for every PR.

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
