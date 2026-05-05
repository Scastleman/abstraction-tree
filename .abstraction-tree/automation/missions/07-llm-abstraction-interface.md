# Mission 7 — Add LLM Abstraction Interface Without Hardcoding a Provider

You are working on the `Scastleman/abstraction-tree` repository.

Global objective:
Make this repo a cleaner, safer, measurable, self-dogfooding abstraction-memory system for coding agents.

This mission prepares the repo for future LLM-assisted abstraction without making the current deterministic MVP depend on an LLM.

## Rules

- Do one bounded improvement.
- Do not hardcode OpenAI, Anthropic, Grok, or any provider.
- Do not add API keys.
- Do not require network access.
- Do not change default deterministic behavior.
- Do not push to remote.
- Stop after this mission.

## Task

Add a clean LLM abstraction interface.

Suggested files:

```txt
packages/core/src/llm/types.ts
packages/core/src/llm/abstractionBuilder.ts
```

The interface should express something like:

```ts
export interface LlmAbstractionBuilder {
  proposeOntology(input: AbstractionBuilderInput): Promise<OntologyProposal>;
  proposeTree(input: AbstractionBuilderInput): Promise<TreeProposal>;
  classifyChange(input: ChangeClassificationInput): Promise<ChangeClassification>;
}
```

Add clear input/output types.

Include concepts such as:

- scanner output
- existing ontology
- existing tree
- docs summaries
- prior run reports
- detected changes
- proposed ontology changes
- proposed tree changes
- confidence
- rationale
- warnings
- affected abstraction layer

Add a deterministic placeholder implementation that either:

- returns a no-op proposal, or
- throws a clear “LLM provider not configured” error

Do not make the CLI call it by default.

## Documentation

Update:

- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/AGENT_PROTOCOL.md` if present

Make clear:

- current system remains deterministic by default
- LLM support is future/adapter-based
- provider adapters should live outside the core deterministic pipeline
- LLM proposals should be validated before becoming tree memory

## Tests

Add compile-level or unit tests to ensure the interface exports correctly.

Do not require an actual LLM.

## Run Checks

Run:

```bash
npm run build
npm test
npm run atree:validate
```

If available, also run:

```bash
npm run atree:evaluate
npm run diff:summary
```

If a command fails, record it honestly.

## Update Abstraction Memory

Update `.abstraction-tree/` memory if needed.

Write:

`.abstraction-tree/runs/YYYY-MM-DD-HHMM-agent-run.md`

Report format:

```md
# Agent Run Report

## Task Chosen

Add LLM abstraction interface without hardcoding a provider.

## Hypothesis

The repo moves closer to the original vision when it exposes a provider-neutral interface for LLM-inferred abstraction while preserving deterministic default behavior.

## Files Changed

## Abstraction Layer Affected

## Result

success / partial / failed

## Checks Run

## What Improved

## What Did Not Improve

## Mistakes / Risks

## Missing Context Discovered

## Tree Updates Needed

## Reusable Lesson

## Recommended Next Loop
```

Also write:

`.abstraction-tree/lessons/YYYY-MM-DD-HHMM-lesson.md`

Stop after this mission.
