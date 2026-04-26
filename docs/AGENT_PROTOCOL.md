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

## Overreach detection

A change may be overreaching if:

- many files outside the target subtree changed;
- unrelated modules were rewritten;
- invariants changed without explicit user request;
- public APIs changed without corresponding tree updates;
- tests were deleted instead of adapted.
