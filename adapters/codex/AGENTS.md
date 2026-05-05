# Codex Agent Instructions for Abstraction Tree

When working inside a project that contains `.abstraction-tree/`, treat that folder as durable project memory.

## Required behavior

Before making code changes:

1. Read `.abstraction-tree/tree.json`.
2. Read `.abstraction-tree/files.json`.
3. Read `.abstraction-tree/concepts.json` and `.abstraction-tree/invariants.json` when relevant.
4. Identify the smallest relevant subtree for the user's request.
5. Avoid touching unrelated nodes unless necessary.

After making meaningful changes:

1. Update the relevant tree nodes and file summaries.
2. Add or update concepts if a durable concept was introduced.
3. Preserve invariants unless the user explicitly requested a change.
4. Write a change record in `.abstraction-tree/changes/`.
5. Run `atree validate` if available.

## Memory and runtime boundaries

Treat committed `.abstraction-tree/` files as durable memory: abstraction data, stable automation config, change records, context packs, run reports, lessons, and evaluations can be part of the repo.

Do not commit live runtime state: loop counters, mission runner state, logs, secrets, `.env` files, or local Codex state. Runtime examples and stable configs are acceptable; machine-local state is not.

Useful repo scripts:

```bash
npm run abstraction:loop
npm run atree:validate
npm run atree:evaluate
npm run diff:summary
```

The autonomous loop runs bounded Codex cycles and post-loop checks. It does not push to remote, bypass failed checks, commit ignored runtime state, or enable LLM-inferred abstraction as default scanner behavior.

The loop is bounded by configured limits for loop count, elapsed time, failed loops, stagnation, repeated test failures, and diff size. Use objective evaluation metrics alongside run reports because self-reporting alone cannot prove that drift, ownership, context breadth, or automation health improved.

Current limitation: deterministic scan, validation, context, evaluation, and app serving are implemented. LLM-inferred abstraction remains adapter-ready scaffolding and is not default behavior.

## Prompt expansion

Do not force the user to use special prompts. Internally translate ordinary requests into tree-aware scope.

Example user prompt:

> Add coupon support.

Internal interpretation:

```txt
Find relevant pricing, checkout, UI, data, and test nodes.
Preserve payment authorization and order validation invariants.
Implement the smallest coherent change.
Update tree memory after completion.
```

## Anti-overreach rule

If the requested change belongs to one subtree, do not refactor unrelated architecture simply because it looks improvable.
