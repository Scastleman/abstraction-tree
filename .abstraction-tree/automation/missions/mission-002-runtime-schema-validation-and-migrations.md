---
id: mission-002
title: Add runtime schema validation and migrations for `.abstraction-tree` memory
priority: P0
status: completed
project: abstraction-tree
---

# Mission 002: Add runtime schema validation and migrations for `.abstraction-tree` memory

## Objective

Protect persisted project memory with runtime validation, clear errors, version checks, and a migration path.

## Why this matters

TypeScript interfaces do not validate JSON on disk. Users and agents can edit `.abstraction-tree/*`, so the CLI should reject malformed memory predictably and offer migration guidance as schemas evolve.

## Scope

- Create runtime validators for config, files, ontology, tree, concepts, invariants, changes, context packs, and evaluations.
- Introduce a schema version check tied to `.abstraction-tree/config.json`.
- Add migration helpers for future versions, even if v0.1 only has identity migrations.
- Update `readJson` call sites or add safe typed loader functions.
- Make validation errors include file path, field path, severity, and recovery hint.

## Non-goals

- Do not replace existing semantic validators; layer runtime shape validation underneath them.

## Likely touchpoints

- `packages/core/src/schema.ts`
- `packages/core/src/workspace.ts`
- `packages/core/src/validator.ts`
- `packages/core/src/*schema*.test.ts`

## Acceptance criteria

- [x] Malformed JSON memory produces actionable validation errors instead of misleading downstream errors.
- [x] Config version is checked and unsupported versions produce a clear message.
- [x] Unit tests cover valid, missing, malformed, and future-version memory files.
- [x] Existing repo memory validates without migration.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: Added runtime schema validators for config, files, ontology, tree, concepts, invariants, change records, context packs, and evaluation reports; added config schema-version checks plus v0.1 identity migration scaffolding; added typed memory loaders that return structured validation issues with file path, field path, severity, and recovery hints; wired CLI validation, context generation, app state loading, and evaluation reporting through the runtime layer.
- Tests run: `npm run build`; `npm test`; `npm run atree:scan`; `npm run atree:validate`.
- Follow-up risks: Evaluation report validation accepts legacy v0.1 reports without the newer `changes` section so existing memory remains valid; a future schema version should add an explicit migration before making that field mandatory.
