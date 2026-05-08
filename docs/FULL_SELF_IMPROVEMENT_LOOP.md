# Full Self-Improvement Loop

`npm run self:loop` runs the top-level Abstraction Tree dogfood loop:

1. Collect current repo context, including Git status, diff summary, latest evaluation, recent run reports, lessons, mission runtime, and change-record review.
2. Ask Codex to write a full project assessment and a fresh mission folder.
3. Plan the generated missions with `scripts/run-missions.mjs`.
4. Run selected mission prompts through the mission runner.
5. Ask Codex for a read-only coherence review of the assessment, mission results, and current diff.
6. Review `.abstraction-tree/changes/` for generated scan-record buildup and further improvement using the compact change-review summary.
7. Write a stop/repeat decision.

Detailed per-run artifacts are written under ignored local runtime state:

```text
.abstraction-tree/automation/full-loop-runs/<timestamp>/
```

Each completed live run also writes a concise durable report that can be committed:

```text
.abstraction-tree/runs/YYYY-MM-DD-HHMM-full-loop-run.md
```

The generated mission folder lives at:

```text
.abstraction-tree/automation/full-loop-runs/<timestamp>/missions/
```

## Safety

The runner refuses to start on a dirty working tree unless `--allow-dirty` is passed. Use that flag only for attended runs where you intentionally want the assessment to include existing uncommitted work.

By default the runner selects up to four generated missions and executes them serially in the current checkout:

```bash
npm run self:loop
```

For a cautious first run:

```bash
npm run self:loop -- --max-missions 2 --concurrency 1 --allow-dirty
```

For writable parallel execution, pass `--concurrency <n>`. The runner automatically enables mission worktrees when concurrency is greater than one with `workspace-write` sandboxing:

```bash
npm run self:loop -- --max-missions 4 --concurrency 2 --allow-dirty
```

Worktree mission results are left for human review; they are not merged automatically.

The full-loop run directory is intentionally ignored by git because it contains generated prompts, Codex JSONL logs, stderr logs, copied mission prompts, and other high-volume execution evidence. Preserve project memory through `.abstraction-tree/runs/`, `.abstraction-tree/lessons/`, semantic change records, and refreshed abstraction tree files instead.

## Dry Run

To inspect the generated assessment prompt without invoking Codex:

```bash
npm run self:loop -- --dry-run --allow-dirty
```
