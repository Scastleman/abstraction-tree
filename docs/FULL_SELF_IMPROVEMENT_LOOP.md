# Full Self-Improvement Loop

This page documents the recommended ChatGPT/human assessment workflow and the experimental full self-improvement loop. For broad repository strategy, prefer assessment packs first and use Codex only after missions are bounded.

## Recommended Workflow

Run an assessment pack:

```bash
npm run assessment:pack
```

This writes a local, ignored pack under:

```text
.abstraction-tree/assessment-packs/<timestamp>/
```

Treat assessment packs as local runtime evidence. They can include Git status, diffs, generated prompts, recent run summaries, mission state, and other review inputs, so they should stay out of durable project memory unless a maintainer intentionally promotes a curated summary:

```text
Local evidence: .abstraction-tree/assessment-packs/
Durable summary: .abstraction-tree/runs/ or .abstraction-tree/lessons/
```

Use the generated `assessment-prompt.md` in ChatGPT or with a human reviewer, then stage the work:

1. Run `npm run assessment:pack`.
2. Review `assessment-prompt.md` in ChatGPT or with a human reviewer.
3. Generate a mission folder from the assessment.
4. Import it with `npm run assessment:import -- --from <folder> --name <name>`.
5. Run `npm run missions:plan:manual -- --missions .abstraction-tree/missions/<name>` to inspect scope, dependencies, and execution blockers.
6. Run `npm run missions:run:manual -- --missions .abstraction-tree/missions/<name>` to execute scoped missions through Codex.
7. Run `npm run atree:evaluate` and review the objective results.

The pack includes Git status, diff summary, the latest deterministic evaluation, recent run reports, recent lessons, mission runtime, change-record review, and abstraction memory summaries. Its prompt asks ChatGPT or a human to produce the repository assessment, prioritized recommendations, and a mission folder using the mission frontmatter schema.

Codex is the bounded executor. ChatGPT and humans are the preferred strategic assessment layer. Abstraction Tree is the memory, evidence, validation, and scope boundary. Do not trust generated assessment or mission output by default: validate and plan the mission folder, run checks, and review diffs before accepting changes.

To create the assessment evidence pack through the full-loop wrapper and stop before any Codex assessment or mission execution, use:

```bash
npm run self:loop -- --assessment-pack-only
```

This creates a normal full-loop run directory, writes the assessment pack under `assessment-pack/`, prints the pack and prompt paths, and exits successfully. It does not spawn Codex, plan missions, run missions, collect post-run context, run coherence review, or write a durable loop report. This is the preferred full-loop starting point when you want strategic review context without invoking Codex.

## Experimental Dogfooding Loop

`npm run self:loop` runs the top-level Abstraction Tree dogfood loop. It remains experimental local dogfooding, not the recommended strategic default.

1. Collect current repo context, including Git status, diff summary, latest evaluation, recent run reports, lessons, mission runtime, and change-record review.
2. Ask Codex to write a full project assessment and a fresh mission folder.
3. Plan the generated missions with `scripts/run-missions.mjs`.
4. Run selected mission prompts through the mission runner.
5. Ask Codex for a read-only coherence review of the assessment, mission results, and current diff, unless the run is configured to externalize that judgment.
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

To run the full loop against an existing ChatGPT or human-authored mission folder, skip Codex assessment and pass the mission folder explicitly:

```bash
npm run self:loop -- --skip-codex-assessment --missions .abstraction-tree/missions/review-2026-05-10 --allow-dirty
```

In this mode the loop does not build `assessment-prompt.md` and does not spawn Codex for assessment or mission authoring. It discovers the provided folder, runs the usual mission planning and execution stages against that folder, then still collects post-run context, runs the read-only coherence review, reviews change records, writes the stop/repeat decision, and writes the durable report. The run artifacts include `strategy-source.json` and `external-missions.json`, and the durable report labels the strategy source as externally authored.

To create a post-run coherence evidence pack for ChatGPT or human review instead of asking Codex for the final judgment, pass:

```bash
npm run self:loop -- --external-coherence-review --allow-dirty
```

This still runs the loop through mission planning, mission execution, post-run context collection, change-record review, decision writing, and the durable report. At the coherence step it writes `coherence-prompt.md` and `coherence-inputs.json` in the full-loop run directory, then skips the read-only Codex coherence spawn. The durable run report marks coherence review as pending external ChatGPT/human review.

Use `coherence-prompt.md` as the review prompt in ChatGPT or with a human reviewer. `coherence-inputs.json` is the compact evidence payload: run directory, mission directory, strategy source, selected mission ids, and post-run context. Treat those files as evidence, not the judgment. The external reviewer should produce the coherence assessment and recommended stop/repeat decision; the loop does not auto-apply recommendations.

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
