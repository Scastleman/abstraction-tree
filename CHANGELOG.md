# Changelog

All notable changes to this project are documented in this file.

This repository uses synchronized SemVer versions across the publishable package set:
`@abstraction-tree/core`, `@abstraction-tree/cli`, `@abstraction-tree/app`, and
`abstraction-tree`.

## [Unreleased]

- Documented that `0.2.0-beta.1` is now published on npm and verified from
  clean external projects using both the full package and core-only CLI package.
- Added completed public beta verification evidence and updated v1 release
  review docs to distinguish "public beta verified" from "v1-ready."

## [0.2.0-beta.1] - 2026-05-14

- Added a v1 release gate and release-candidate review doc so maintainers have
  an explicit pass/fail bar before labeling the project v1-ready.
- Added `atree export` for Mermaid and Graphviz DOT diagrams generated from
  `.abstraction-tree/tree.json`.
- Added `atree serve` startup diagnostics that print the resolved project,
  memory counts, and dogfooding-memory adoption warnings.
- Added `atree changes prune-generated` to remove superseded generated scan
  records while retaining semantic history and the latest generated scan.
- Added documentation command-reference checking for stale npm scripts, stale
  `atree` commands, and missing Markdown doc links.
- Added public beta issue templates for install, scan, app, docs, and agent
  workflow feedback.
- Added README guidance for Codex and other agents adopting Abstraction Tree into
  a separate target project without copying dogfooding memory or serving the
  wrong workspace.
- Prepared synchronized `0.2.0-beta.1` package metadata and internal package
  dependency pins for a public beta candidate.
- Added a manual release runbook and external npm beta verification evidence
  template.
- Added screenshot freshness guidance and image-link validation in
  `docs:commands`.
- Documented that `goal --review-required` remains beta through first v1 unless
  external feedback justifies graduating planning-only behavior.

## [0.1.0] - 2026-05-08

- Established the initial CLI, core library, optional visual app, and full install
  package set for the deterministic Abstraction Tree MVP.
- Added package smoke tests that verify packed contents, local tarball installs,
  linked CLI binaries, and installed CLI/app commands before publication.
- Added release documentation, changelog validation, and dry-run publish
  automation for maintainers.
