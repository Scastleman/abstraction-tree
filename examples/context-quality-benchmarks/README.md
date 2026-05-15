# Context Quality Benchmarks

These fixtures are small, local-only projects that preserve the diverse-repository
context expectations from the 2026-05-15 beta evaluation without cloning external
repositories during tests.

Each fixture contains an `.abstraction-tree/evaluation-fixture.json` file with at
least one prompt and expected file inclusions for both context-pack selection and
prompt routing. The source projects are intentionally reduced, but their folder
shapes mirror the evaluated categories:

- `vite-lite`: JS/TS pnpm monorepo with plugin-container internals and docs.
- `click-lite`: Python package with parser source, option tests, and docs.
- `fd-lite`: Rust CLI with traversal source, CLI flags, tests, and README docs.
- `rust-book-lite`: mdBook-style documentation tree with chapters and listings.
- `mern-lite`: mixed React/Express app with protected route and dashboard flow.
