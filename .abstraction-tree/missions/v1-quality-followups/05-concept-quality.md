---
id: mission-05-concept-quality
title: Add concept-quality pruning and warnings
priority: P1
risk: medium
category: quality
affectedFiles:
  - packages/core/src/treeBuilder.ts
  - packages/core/src/treeBuilder.test.ts
  - packages/core/src/evaluator.ts
  - packages/core/src/validator.ts
  - docs/DATA_MODEL.md
affectedNodes:
  - subsystem.core.engine
  - subsystem.tests.quality
  - subsystem.docs.examples
dependsOn:
  - mission-04-context-fallback
parallelGroup: v1-quality-followups
parallelGroupSafe: false
---

# Mission

Add concept-quality pruning and warnings

## Goal

Prevent stopword and filler concepts such as `the` and `and` from entering generated memory and context scoring.

## Abstraction Tree Position

This mission belongs to the Abstraction Tree v1-quality-followups queue. It targets the affected files and nodes listed in frontmatter and should be executed through the repository mission runner as a bounded Codex CLI task.

## Why This Matters

Diverse testing found concepts such as `concept-node.the` and `concept-node.and` in Python and Rust projects. Noisy concepts can displace domain-relevant terms in context scoring.

## Scope

- Improve concept extraction stopwords.
- Add concept quality validation/evaluation.
- Allow explicit config to preserve unusual domain vocabulary if needed.

## Out of Scope

No removal of concept extraction or evidence trail.

## Required Checks

- Tree builder concept tests.
- Validator/evaluator tests for noisy concepts.
- Config override tests for domain vocabulary.
- `npm test`, `npm run coverage`.

## Success Criteria

- `concept-node.the` and `concept-node.and` are pruned or flagged.
- Evaluation surfaces noisy concepts.
- Domain vocabulary still works for legitimate project-specific terms.
- Context ranking no longer receives filler concepts.

## Additional Detail

The original planning detail follows. Treat it as implementation guidance, but obey the frontmatter, required checks, success criteria, and human-checkpoint boundaries above.

# Mission 05: Add concept-quality pruning and warnings

## Mission metadata

- **Mission file:** `05-concept-quality.md`
- **Priority:** P1
- **Executor:** Codex or another bounded coding agent
- **Primary mode:** implement, test, document, and report

## Summary

Prevent stopword and filler concepts such as `the` and `and` from entering generated memory and context scoring.

## Evidence and problem statement

Diverse testing found concepts such as `concept-node.the` and `concept-node.and` in Python and Rust projects. Noisy concepts can displace domain-relevant terms in context scoring.

## Scope Codex may change

- Improve concept extraction stopwords.
- Add concept quality validation/evaluation.
- Allow explicit config to preserve unusual domain vocabulary if needed.

## Likely files or modules

Likely files: `packages/core/src/treeBuilder.ts`, `packages/core/src/validator.ts`, `packages/core/src/evaluator.ts`, config docs and tests.

## Implementation plan

1. Expand stopword/filler concept filtering for single-word terms.
2. Add a concept quality validator that warns or fails on single-word filler concepts, concepts with no meaningful evidence, and concepts related only to broad docs filler.
3. Add evaluator metrics: noisy concept count, concepts without evidence, concepts without related files, and filler-only evidence.
4. Ensure `domainVocabulary` can intentionally map or boost domain terms without reopening generic stopwords by accident.
5. Add fixtures from Python/Rust/docs-style headings.

## Required tests and validation

- Tree builder concept tests.
- Validator/evaluator tests for noisy concepts.
- Config override tests for domain vocabulary.
- `npm test`, `npm run coverage`.

## Acceptance criteria

- `concept-node.the` and `concept-node.and` are pruned or flagged.
- Evaluation surfaces noisy concepts.
- Domain vocabulary still works for legitimate project-specific terms.
- Context ranking no longer receives filler concepts.

## Risks and review notes

Risk: over-pruning meaningful short terms. Keep allowlist/config override path.

## Out of scope

No removal of concept extraction or evidence trail.
