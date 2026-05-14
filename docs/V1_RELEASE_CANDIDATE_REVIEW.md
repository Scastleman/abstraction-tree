# V1 Release Candidate Review

> Audience: Maintainers
> Status: Current candidate assessment
> Read after: V1_RELEASE_GATE.md

This review checks the current repository against the v1 release gate. It is intentionally conservative: failing a gate does not mean the project is broken, only that it should not yet be called v1-ready.

## Summary

Current verdict: not v1-ready yet.

The current public beta version is `0.2.0-beta.1`. The stable local path is strong in the monorepo, local tarball smoke tests pass, and clean external npm installs have verified the published beta. The project is still not v1-ready because it needs public beta feedback, fresh release-gate evidence from a clean checkout, and a deliberate stable dist-tag/version decision before v1.

## Gate Results

| Gate | Status | Evidence |
| --- | --- | --- |
| Stable user path | Pass for public beta | Repo-local commands, `pack:smoke`, and public npm install verification exercise init, scan, doctor, validate, context, export, and serve. |
| Install/package proof | Pass for public beta | `pack:smoke` installs local tarballs into an external temp project, verifies dogfooding-memory exclusion, and public registry verification passed for `abstraction-tree@beta` and `@abstraction-tree/cli@beta`. |
| Schema/migration policy | Pass for pre-v1 | `DATA_MODEL.md` documents `0.1.0`, future-version rejection, dry-run behavior, and backup expectations for future write migrations. |
| Visual proof | Pass | `docs/VISUAL_DEMO.md` and README embed real screenshots captured from `examples/small-web-app`. Refresh them when UI layout, `/api/state`, node detail content, or visual-demo docs change. |
| Docs/changelog alignment | Pass with ongoing maintenance | README is concise, docs are split by ownership, command docs have a local checker, and changelog has a `0.2.0-beta.1` candidate section plus `Unreleased`. |
| CI/release preflight | Pass for beta, repeat before v1 | CI runs deterministic checks and `0.2.0-beta.1` was published after release dry-run and pack-smoke preparation. Repeat the full gate from a clean checkout before v1. |
| Memory hygiene | Pass when current scan pruning is applied | `changes prune-generated --apply` keeps semantic history and latest generated scan while removing superseded generated scan noise. |
| Beta/experimental boundaries | Pass | Stable vs Experimental keeps route/goal/scope/evaluate as beta where appropriate and mission execution/dogfooding as experimental. `goal --review-required` remains beta through first v1 unless external feedback justifies graduating only planning. |

## Public Beta Evidence

Public registry evidence has been collected for `0.2.0-beta.1`. The registry currently exposes both `beta` and `latest` dist-tags for this version because it is the only published version; docs continue to recommend `@beta` until stable v1.

| Evidence Item | Status | Link |
| --- | --- | --- |
| Full package `abstraction-tree@beta` external install | Pass | [2026-05-14 evidence](release-evidence/2026-05-14-0.2.0-beta.1-verification.md) |
| Core-only `@abstraction-tree/cli@beta` external install | Pass | [2026-05-14 evidence](release-evidence/2026-05-14-0.2.0-beta.1-verification.md) |
| Dogfooding-memory isolation from npm install | Pass | [2026-05-14 evidence](release-evidence/2026-05-14-0.2.0-beta.1-verification.md) |

## Blockers Before V1

- Collect external beta feedback and fix install, scan, validate, export, serve, or dogfooding-memory issues that block the stable path.
- Keep real visual screenshots current in `docs/assets/visual-demo/` whenever the app UI changes.
- Run the full release gate command list from `docs/V1_RELEASE_GATE.md` on a clean checkout.
- Decide and document stable v1 package/tag handling so `latest` intentionally points at a stable release when v1 is ready.
- Keep `goal --review-required` beta at v1 unless public beta feedback provides evidence that the planning surface is stable enough to graduate.

## Beta Feedback Triage

Use the GitHub issue templates for beta feedback. Mark an issue as a `v1-blocker` when it affects install, init, scan, doctor, validate, context, export, serve, visual inspection, dogfooding-memory isolation, or release documentation. Use `beta-blocker` for issues that prevent beta users from completing public prerelease verification. Goal execution, mission execution, provider proposals, and dogfooding automation should not block v1 unless docs accidentally present them as stable.

## Non-Blockers For V1

- `goal --run`, `goal --full-auto`, mission execution, provider proposals, and the dogfooding loop can remain experimental.
- Visual goal workspace panels can remain post-v1 as long as docs do not imply they are stable.
- Deterministic tree generation can remain evidence-based rather than LLM-inferred.

## Latest Required Local Evidence

Before turning this review into a release candidate signoff, paste the exact results of:

```bash
npm run format:check
npm run check:unicode
npm run docs:commands
npm run lint
npm run typecheck
npm run build
npm run coverage
npm test
npm run pack:smoke
npm run release:dry-run -- --version 0.2.0-beta.1
npm run atree:validate
npm run atree:evaluate
npm run atree -- doctor --project . --strict
npm run diff:summary
```

If any command fails, keep this document in blocker status instead of marking v1 ready.
