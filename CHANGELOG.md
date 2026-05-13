# Changelog

All notable changes to this project are documented in this file.

This repository uses synchronized SemVer versions across the publishable package set:
`@abstraction-tree/core`, `@abstraction-tree/cli`, `@abstraction-tree/app`, and
`abstraction-tree`.

## [Unreleased]

- Added `atree export` for Mermaid and Graphviz DOT diagrams generated from
  `.abstraction-tree/tree.json`.
- Added `atree serve` startup diagnostics that print the resolved project,
  memory counts, and dogfooding-memory adoption warnings.
- Added README guidance for Codex and other agents adopting Abstraction Tree into
  a separate target project without copying dogfooding memory or serving the
  wrong workspace.

## [0.1.0] - 2026-05-08

- Established the initial CLI, core library, optional visual app, and full install
  package set for the deterministic Abstraction Tree MVP.
- Added package smoke tests that verify packed contents, local tarball installs,
  linked CLI binaries, and installed CLI/app commands before publication.
- Added release documentation, changelog validation, and dry-run publish
  automation for maintainers.
