# Agent Protocol

The developer should not need to change how they prompt.

A user may simply ask:

> Add coupon support.

The agent adapter should perform this protocol internally.

## Before editing

1. Read `.abstraction-tree/config.json`.
2. Search tree nodes and concepts relevant to the request. Prefer the root's human subsystem children for first-pass scope, descend into subsystem responsibility slices and file leaves for edit boundaries, then cross-check Project Indexes when the prompt needs concept, architecture, or file ownership lookup.
3. Generate or load a context pack.
4. Identify likely affected files.
5. Identify invariants and must-not-change boundaries.
6. Explain the planned scope if the change is large.

When setup is uncertain, run `atree doctor --project .` before editing. It is a read-only readiness check for initialization, memory files, runtime schema, validation summary, automation runtime boundaries, install mode, and the suggested next command.

## Context packs

`atree context --target <query>` emits JSON by default and writes the canonical JSON pack under `.abstraction-tree/context-packs/`.

Use `--format markdown` when the next consumer is an agent prompt or report. Use `--why` to include selection diagnostics for every selected node, file, concept, invariant, and recent change, plus nearby candidates excluded by hard limits or token budget. Use `--max-tokens <n>` to apply an approximate selected-item budget. The first-pass estimator is documented as `approximate-json-chars-div-4`, so it is a deterministic character-count approximation and does not require a tokenizer package.

Selected nodes include `summary`, `explanation`, `reasonForExistence`, and `separationLogic` when available. Read the summary for a quick label, the explanation for ownership, dependencies, parent/child context, invariants, and safe-change guidance, and the reason for existence to understand why the project has that node or subsystem in the first place. Read the separation logic to understand the partition rule for the child nodes and which child boundary best matches the prompt. Treat these fields as scope boundary aids: they should help you avoid editing sibling modules unless the dependency evidence says the change really crosses that boundary.

## During editing

1. Stay inside relevant ownership boundaries when possible.
2. Touch neighboring files only when dependencies require it.
3. Prefer small, coherent changes.
4. Add or update tests for behavior changes.

## After editing

1. Run the relevant tests or validation commands.
2. Update file summaries if ownership changed.
3. Update affected tree nodes, including `explanation`, `reasonForExistence`, and `separationLogic` when node purpose, ownership, dependencies, child boundaries, or safe-change guidance changed.
4. Add concepts or invariants if new durable ideas were introduced.
5. Write a semantic change record in `.abstraction-tree/changes/`.
6. Run `atree validate`.

Use `atree doctor` when you need the aggregate setup/readiness view. Use `atree validate` as the focused memory-alignment gate after files, tree nodes, concepts, invariants, or change records are updated.

## LLM-assisted proposals

The current protocol is deterministic by default. LLM support should enter through explicit provider adapters that implement the core `LlmAbstractionBuilder` interface rather than through the scanner, tree builder, or CLI default path.

LLM output is a proposal, not memory. Agents should validate proposed ontology changes, proposed tree changes, confidence, rationale, warnings, affected abstraction layers, and detected-change classifications before writing them into canonical `.abstraction-tree/` files.

Use the explicit proposal path when testing an adapter:

```bash
atree propose --provider local-json --adapter adapters/local-json/index.mjs --input adapters/local-json/proposal.example.json
```

The command writes `.abstraction-tree/proposals/<id>.json` and leaves `ontology.json`, `tree.json`, `files.json`, concepts, invariants, and change records unchanged. A human reviewer must resolve validation errors, inspect warnings and rationale, approve any destructive remove proposals separately, manually apply accepted memory edits, then run:

```bash
atree validate --strict
```

## This Repository

The Abstraction Tree repo dogfoods the protocol at the repository root. Changes to core behavior, CLI commands, packaging, docs, or the app should update the root `.abstraction-tree/` memory and pass:

```bash
npm run atree:validate
```

That root `.abstraction-tree/` folder is not a template for users. External projects should start with `atree init`, which creates blank project-local memory, then `atree scan`, which generates tree/files/concepts/invariants from the external project's own files. If `atree doctor` warns that a non-Abstraction-Tree project appears to contain this repo's dogfooding memory, clean the stale generated memory and scan again before using the tree for scope decisions.

## Strategic assessment workflow

For broad repository assessment, do not make Codex invent the strategy and execute it in one pass. Use the staged workflow:

1. Run `npm run assessment:pack`.
2. Review the generated `assessment-prompt.md` in ChatGPT or with a human reviewer.
3. Generate a mission folder from that assessment.
4. Import it with `npm run assessment:import -- --from <folder> --name <name>`.
5. Run `npm run missions:plan:manual -- --missions .abstraction-tree/missions/<name>` to inspect scope, dependencies, and execution blockers.
6. Run `npm run missions:run:manual -- --missions .abstraction-tree/missions/<name>` to execute scoped missions through Codex.
7. Run `npm run atree:evaluate` and review the results.

Codex is the bounded executor. ChatGPT and humans are the preferred strategic assessment layer. Abstraction Tree is the memory, evidence, validation, and scope boundary. Assessment output is still a proposal: validate the mission folder, run the checks requested by each mission, and review the diff before accepting changes.

## Bounded local dogfooding loops

When running an attended or configured repository-maintenance loop on this repository, start from existing memory before exploring widely:

Bounded loop orchestration in this checkout is Windows PowerShell scoped. Use `npm run abstraction:loop:windows` for the local loop, `powershell -ExecutionPolicy Bypass -File scripts/run-abstraction-loop.ps1 -MaxLoopsThisRun 1` for an attended one-loop smoke run, or `npm run missions:plan` / `npm run missions:run` for the mission queue. Do not run those loop commands in public CI; macOS/Linux contributors can use the Node-based core checks such as `npm run build`, `npm test`, `npm run atree:validate`, and `npm run diff:summary`.

`npm run self:loop` is experimental dogfooding. It remains useful for attended loop testing, but it is not the recommended default for broad strategic assessment; prefer assessment packs and human or ChatGPT mission design first.

1. Check `git diff`, committed loop policy in `.abstraction-tree/automation/loop-config.json`, ignored local counters in `.abstraction-tree/automation/loop-runtime.json`, and the latest files in `.abstraction-tree/runs/` and `.abstraction-tree/lessons/`.
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
