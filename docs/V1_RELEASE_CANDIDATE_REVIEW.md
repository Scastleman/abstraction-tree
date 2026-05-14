# V1 Release Candidate Review

> Audience: Maintainers
> Status: Current candidate assessment
> Read after: V1_RELEASE_GATE.md

This review checks the current repository against the v1 release gate. It is intentionally conservative: failing a gate does not mean the project is broken, only that it should not yet be called v1-ready.

## Summary

Current verdict: not v1-ready yet.

The stable local path is strong in the monorepo and local tarball smoke tests, but public npm packages are not published and prerelease verification has not happened from the public registry.

## Gate Results

| Gate | Status | Evidence |
| --- | --- | --- |
| Stable user path | Partial | Repo-local commands and `pack:smoke` exercise init, scan, doctor, validate, context, export, and serve. Public npm install is still future work. |
| Install/package proof | Partial | `pack:smoke` installs local tarballs into an external temp project and verifies dogfooding-memory exclusion. Public registry prerelease remains undone. |
| Schema/migration policy | Pass for pre-v1 | `DATA_MODEL.md` documents `0.1.0`, future-version rejection, dry-run behavior, and backup expectations for future write migrations. |
| Visual proof | Pass | `docs/VISUAL_DEMO.md` and README embed real screenshots captured from `examples/small-web-app`. Refresh them when UI changes. |
| Docs/changelog alignment | Pass with ongoing maintenance | README is concise, docs are split by ownership, command docs have a local checker, and changelog records productization work under Unreleased. |
| CI/release preflight | Partial | CI runs deterministic checks. A full `release:dry-run -- --version <candidate-version>` must pass immediately before prerelease. |
| Memory hygiene | Pass when current scan pruning is applied | `changes prune-generated --apply` keeps semantic history and latest generated scan while removing superseded generated scan noise. |
| Beta/experimental boundaries | Pass | Stable vs Experimental keeps route/goal/scope/evaluate as beta where appropriate and mission execution/dogfooding as experimental. |

## Blockers Before V1

- Publish and verify a public prerelease such as `0.2.0-beta.1` or a later release candidate.
- Run post-publish verification in a brand-new directory using the public npm package, not local tarballs.
- Keep real visual screenshots current in `docs/assets/visual-demo/` whenever the app UI changes.
- Run the full release gate command list from `docs/V1_RELEASE_GATE.md` on a clean checkout.
- Decide whether `goal --review-required` remains beta at v1 or graduates only after more external feedback.

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
npm run release:dry-run -- --version <candidate-version>
npm run atree:validate
npm run atree:evaluate
npm run atree -- doctor --project . --strict
npm run diff:summary
```

If any command fails, keep this document in blocker status instead of marking v1 ready.
