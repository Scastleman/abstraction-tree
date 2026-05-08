# Mission Runner

`scripts/run-missions.mjs` turns a folder of Markdown mission files into an Abstraction Tree-aware work queue. It can print a JSON plan, dry-run the Codex CLI commands that would execute, or run each mission non-interactively through Codex CLI.

## Mission Folder

By default, the runner reads:

```text
.abstraction-tree/automation/missions/
```

It discovers Markdown files recursively, excludes `README.md`, and never deletes mission files after running them. By default, it also reads `.abstraction-tree/automation/mission-runtime.json` and skips missions already listed as completed or failed. You can point it at another folder:

```bash
node scripts/run-missions.mjs --missions ./some-folder --plan
```

Use `--ignore-runtime` to inspect or rerun every discovered mission regardless of local runtime state, and `--retry-failed` to include previously failed missions while still skipping completed ones.

## Frontmatter

Mission files may start with simple YAML-like frontmatter:

```md
---
id: mission-001-localhost-serve-security
title: Bind atree serve to localhost by default
priority: P0
risk: medium
affectedFiles:
  - packages/cli/src/index.ts
  - packages/cli/src/index.test.ts
affectedNodes:
  - file.packages.cli.src.index.ts
dependsOn: []
parallelGroup: cli-security
---

## Goal

Change `atree serve` so it binds to localhost by default.
```

Supported fields are string scalars, empty arrays, and block arrays. When fields are missing, the runner infers:

- `id` from the filename stem.
- `title` from the first Markdown heading.
- `affectedFiles` from path-like mentions that match repo files or `.abstraction-tree/files.json`.
- `affectedNodes` from mentioned node ids plus owners of inferred files.
- `risk: medium`, `priority: P2`, and `dependsOn: []`.

## Planning

`npm run missions:plan` prints a JSON plan and writes it to:

```text
.abstraction-tree/mission-runs/<timestamp>/plan.json
```

The planner reads `.abstraction-tree/tree.json`, `files.json`, `concepts.json`, and `invariants.json` when present. Missing or invalid memory files become warnings instead of hard failures during planning.

Missions are batched only when they are safe to run together. Writable missions are separated when they overlap on files, nodes, parent/child node neighborhoods, high-risk metadata, dependencies, high-severity invariant files, or shared global files such as `package.json`, CI workflows, `scripts/run-missions.mjs`, and core schema/validator/workspace files.

## Execution

Run the default queue:

```bash
npm run missions:run
```

Useful variants:

```bash
node scripts/run-missions.mjs --dry-run
node scripts/run-missions.mjs --ignore-runtime --plan
node scripts/run-missions.mjs --missions ./some-folder --only mission-001
node scripts/run-missions.mjs --missions ./some-folder --sandbox read-only --concurrency 3
node scripts/run-missions.mjs --missions ./some-folder --worktrees --concurrency 3
node scripts/run-missions.mjs --missions ./some-folder --codex-bin codex
```

After a live run, successful mission filenames are recorded in `mission-runtime.json` under `completed`, failed mission filenames are recorded under `failed`, and `current` is cleared. The runtime file is local-only and ignored by git.

For each mission, the runner creates:

```text
.abstraction-tree/mission-runs/<timestamp>/<mission-id>/
  prompt.md
  codex.jsonl
  stderr.log
  final.md
  status.json
```

The generated prompt wraps the mission with repo-specific rules, affected files/nodes, and check expectations. Codex is invoked as:

```bash
codex exec --json --sandbox <sandbox> -
```

The mission prompt is sent on stdin. JSONL stdout is captured to `codex.jsonl`, stderr is captured to `stderr.log`, and the last parsed agent message is written to `final.md`.

## Writable Parallelism

The runner does not run multiple writable Codex processes in the same checkout by default.

- `--concurrency > 1 --sandbox read-only` can run in the same worktree.
- `--concurrency > 1 --sandbox workspace-write` requires `--worktrees`.
- `--sandbox danger-full-access` requires `--allow-danger-full-access`.

When `--worktrees` is passed, each writable mission receives a separate git worktree under:

```text
.abstraction-tree/worktrees/<timestamp>/<mission-id>/
```

Branches use:

```text
atree/mission/<timestamp>/<mission-id>
```

The runner does not merge, delete, commit, push, or open pull requests. Worktree results are left for human review.

## Git Ignore

Local run artifacts are ignored by git:

```text
.abstraction-tree/mission-runs/
.abstraction-tree/worktrees/
```

## Abstraction Tree Memory

The runner uses Abstraction Tree memory as planning context rather than as an execution authority. `files.json` maps touched files to owning nodes, `tree.json` supplies parent/child neighborhoods, `concepts.json` helps infer related ownership from mission text, and `invariants.json` keeps high-severity invariant files out of writable parallel batches.
