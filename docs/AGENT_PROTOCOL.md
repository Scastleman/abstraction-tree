# Agent Protocol

The developer should not need to change how they prompt.

A user may simply ask:

> Add coupon support.

The agent adapter should perform this protocol internally.

## Before editing

1. Read `.abstraction-tree/config.json`.
2. Search tree nodes and concepts relevant to the request.
3. Generate or load a context pack.
4. Identify likely affected files.
5. Identify invariants and must-not-change boundaries.
6. Explain the planned scope if the change is large.

## During editing

1. Stay inside relevant ownership boundaries when possible.
2. Touch neighboring files only when dependencies require it.
3. Prefer small, coherent changes.
4. Add or update tests for behavior changes.

## After editing

1. Run the relevant tests or validation commands.
2. Update file summaries if ownership changed.
3. Update affected tree nodes.
4. Add concepts or invariants if new durable ideas were introduced.
5. Write a semantic change record in `.abstraction-tree/changes/`.
6. Run `atree validate`.

## This Repository

The Abstraction Tree repo dogfoods the protocol at the repository root. Changes to core behavior, CLI commands, packaging, docs, or the app should update the root `.abstraction-tree/` memory and pass:

```bash
npm run atree:validate
```

## Bounded self-improvement loops

When running an autonomous improvement loop on this repository, start from existing memory before exploring widely:

1. Check `git diff`, `.abstraction-tree/automation/loop-state.json`, and the latest files in `.abstraction-tree/runs/` and `.abstraction-tree/lessons/`.
2. Use targeted reads of `README.md`, `docs/`, `packages/core/src/`, `packages/cli/src/`, and `.abstraction-tree/` before broad repository search.
3. Choose one small, testable improvement that reduces future uncertainty, validation gaps, drift, or agent setup cost.
4. In the run report, separate pre-existing dirty files from files changed by the current loop.
5. Run the canonical checks when possible, and record any sandbox-blocked commands with the fallback checks used.

## Overreach detection

A change may be overreaching if:

- many files outside the target subtree changed;
- unrelated modules were rewritten;
- invariants changed without explicit user request;
- public APIs changed without corresponding tree updates;
- tests were deleted instead of adapted.
