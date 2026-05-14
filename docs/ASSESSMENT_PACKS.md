# Assessment Packs

> Audience: Humans and ChatGPT doing strategic review
> Status: Beta planning workflow
> Read after: STABLE_VS_EXPERIMENTAL.md.

Assessment packs are the strategic review path for broad repository questions. They gather local evidence for ChatGPT or a human reviewer without asking Codex to invent a strategy and execute it in one pass.

Use assessment packs when the prompt is about roadmap, critique, architecture review, or broad improvement planning rather than a specific implementation goal.

## Create A Pack

```bash
npm run assessment:pack
```

This writes an ignored local pack under:

```text
.abstraction-tree/assessment-packs/<timestamp>/
```

The pack can include Git status, diff summary, the latest evaluation, recent run reports, recent lessons, mission runtime state, change-record review, and abstraction memory summaries.

## Safety Controls

The pack includes `pack-safety.json` with redaction, omission, truncation, and approximate byte-size metadata. Inspect it before pasting any evidence into ChatGPT or sharing it externally.

Useful variants:

```bash
npm run assessment:pack -- --max-bytes-per-artifact 50000 --max-total-bytes 250000
npm run assessment:pack -- --redact "internal-[A-Za-z0-9_-]+" --redact-file ./redactions.txt
npm run assessment:pack -- --no-diff --no-runs --no-lessons --no-mission-runtime
```

## Import Reviewer Missions

After ChatGPT or a human reviewer creates a mission folder:

```bash
npm run assessment:import -- --from ./chatgpt-missions --name review-2026-05-10 --dry-run
npm run assessment:import -- --from ./chatgpt-missions --name review-2026-05-10
npm run missions:plan:manual -- --missions .abstraction-tree/missions/review-2026-05-10
npm run missions:run:manual -- --missions .abstraction-tree/missions/review-2026-05-10
```

Mission files remain proposals until they pass planning, checks, and diff review.
