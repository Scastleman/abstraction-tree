---
id: mission-004
title: Turn the example project into a real integration fixture
priority: P0
status: completed
project: abstraction-tree
---

# Mission 004: Turn the example project into a real integration fixture

## Objective

Replace trivial example assertions with behavior and abstraction-tree integration coverage.

## Why this matters

The current example test only proves arithmetic. The example should demonstrate checkout behavior, scanning, context generation, and validation quality.

## Scope

- Write real tests for `examples/small-web-app/src/api/checkout.ts` and service error paths.
- Add a script that scans the example and asserts expected file summaries, concepts, and context output.
- Document the example as a canonical fixture for future scanner/tree changes.
- Include the example integration test in root `npm test` or a dedicated CI job.

## Non-goals

- Do not make the example a full production web app.
- Do not overfit scanner logic only to this example.

## Likely touchpoints

- `examples/small-web-app/tests/checkout.test.js`
- `examples/small-web-app/src/**`
- `scripts/run-tests.mjs`
- `packages/core/src/scanner.test.ts`

## Acceptance criteria

- [x] Example tests fail if checkout stops calling cart, payment, or order services correctly.
- [x] Scanner integration assertions verify important expected outputs.
- [x] The example remains small and readable.
- [x] CI runs the example fixture tests.

## Suggested checks

```bash
npm run build
npm test
npm run atree:validate
```

## Completion notes

- Implementation summary: Replaced the placeholder checkout test with behavior coverage for checkout service collaboration and cart/payment error paths. Added `scripts/small-web-app-fixture.test.mjs` to scan the example and assert expected summaries, concepts, context pack contents, and validator results. Wired `examples/small-web-app/tests` into the root test runner, documented the small web app as the canonical fixture, and refreshed root abstraction memory.
- Tests run: `node examples/small-web-app/tests/checkout.test.js`; `node scripts/small-web-app-fixture.test.mjs`; `npm run build`; `npm test`; `npm run atree:validate`.
- Follow-up risks: The checkout test uses temporary TypeScript transpilation with explicit service import rewrites because the example app intentionally has no standalone TypeScript build. If the example source layout changes, update the test helper alongside it.
