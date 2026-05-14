# Release Runbook

> Audience: Maintainers preparing a public prerelease or v1 release
> Status: Manual maintainer checklist
> Read after: PACKAGING.md and V1_RELEASE_GATE.md.

This runbook helps a human maintainer publish a public beta safely. Agents may prepare this checklist, update docs, and run local dry runs, but must not publish packages, move dist-tags, create npm tokens, handle 2FA prompts, or store credentials.

## Current Candidate

The current public beta is `0.2.0-beta.1` on the npm `beta` dist-tag. It was published and verified from clean external directories on 2026-05-14.

The npm registry currently also lists `0.2.0-beta.1` as `latest` because it is the only published version. Continue to document beta installs with `@beta`; move `latest` intentionally when a stable v1 release passes [V1_RELEASE_GATE.md](V1_RELEASE_GATE.md).

Do not call the project v1-ready after this publish. A beta can prove external installability, but v1 still requires the full gate in [V1_RELEASE_GATE.md](V1_RELEASE_GATE.md).

## Preflight

Start from an up-to-date clean checkout on the release branch.

```bash
npm install
npm run format:check
npm run check:unicode
npm run docs:commands
npm run lint
npm run typecheck
npm run build
npm run coverage
npm test
npm run pack:smoke
npm run release:changelog -- --version 0.2.0-beta.1
npm run release:dry-run -- --version 0.2.0-beta.1
npm run atree:validate
npm run atree:evaluate
npm run atree -- doctor --project . --strict
npm run diff:summary
```

Review the dry-run output and confirm:

- package versions are synchronized;
- package tarballs exclude root `.abstraction-tree/` dogfooding memory;
- the installed tarball smoke project starts with blank memory;
- `init`, `scan`, `doctor`, `validate`, `context`, `export`, and `serve` work from installed tarballs;
- no automated test launches a browser.

## Screenshot Freshness

Refresh visual-demo screenshots before the beta if any visual app layout, `/api/state` payload, node detail content, or visual demo docs changed.

```bash
npm install
npm run build
npm run atree -- init --with-app --project examples/small-web-app
npm run atree -- scan --project examples/small-web-app
npm run atree -- serve --project examples/small-web-app --host 127.0.0.1 --port 4327
```

Open the printed URL, capture the screenshots listed in [VISUAL_DEMO.md](VISUAL_DEMO.md), replace the files under `docs/assets/visual-demo/`, then run:

```bash
npm run docs:commands
```

The docs command check verifies that referenced screenshot files exist. It does not perform pixel comparison.

## Manual Publish

Only a human maintainer should run this section. Confirm `npm whoami`, account access, and 2FA readiness first. Do not paste npm tokens into issues, docs, logs, prompts, or agent sessions.

Publish in dependency order:

```bash
npm publish --workspace @abstraction-tree/core --access public --tag beta
npm publish --workspace @abstraction-tree/cli --access public --tag beta
npm publish --workspace @abstraction-tree/app --access public --tag beta
npm publish --workspace abstraction-tree --tag beta
```

If npm asks for 2FA, the maintainer should complete it directly in their terminal. Agents must stop at the checklist boundary.

## Post-Publish Verification

Create a brand-new directory outside this repository and verify the public registry packages, not local tarballs.

```bash
mkdir atree-beta-verification
cd atree-beta-verification
npm init -y
npm install -D abstraction-tree@beta
npx atree init --with-app
npx atree scan
npx atree doctor
npx atree validate
npx atree context --target checkout
npx atree export --format mermaid
npx atree serve
```

Also verify core-only installation in a second clean directory:

```bash
mkdir atree-cli-beta-verification
cd atree-cli-beta-verification
npm init -y
npm install -D @abstraction-tree/cli@beta
npx atree init --core
npx atree scan
npx atree doctor
npx atree validate
```

Record results in [release-evidence/beta-verification-template.md](release-evidence/beta-verification-template.md) or a copy of that template. Redact private paths, source code, tokens, and project-specific secrets. The completed `0.2.0-beta.1` evidence is [release-evidence/2026-05-14-0.2.0-beta.1-verification.md](release-evidence/2026-05-14-0.2.0-beta.1-verification.md).

## Broken Beta Response

If the beta is broken:

1. Do not intentionally promote `latest` to a stable release.
2. Open or update a beta issue with redacted logs and the exact failing command.
3. Mark the candidate review as blocked.
4. Deprecate the broken beta version with a clear message after confirming the package names and version:

```bash
npm deprecate @abstraction-tree/core@0.2.0-beta.1 "Broken beta; use a later beta."
npm deprecate @abstraction-tree/cli@0.2.0-beta.1 "Broken beta; use a later beta."
npm deprecate @abstraction-tree/app@0.2.0-beta.1 "Broken beta; use a later beta."
npm deprecate abstraction-tree@0.2.0-beta.1 "Broken beta; use a later beta."
```

5. Fix the issue, cut a later beta such as `0.2.0-beta.2`, and repeat this runbook.

## Beta Feedback Triage

Use the GitHub issue templates for beta feedback. Suggested labels:

- `beta-blocker`: prevents beta users from completing the stable install path.
- `v1-blocker`: must be fixed before a v1 label.
- `docs`: documentation confusion or stale commands.
- `packaging`: install, tarball, npm, or binary-linking issue.
- `scanner`: scan, generated memory, or tree quality issue.
- `visual-app`: serve, app rendering, or screenshot issue.
- `agent-workflow`: route, goal, scope, assessment-pack, or mission-runner issue.

Classify feedback as a v1 blocker when it affects the stable path: install, init, scan, doctor, validate, context, export, serve, visual inspection, dogfooding-memory isolation, or clear release documentation. Keep goal execution, mission execution, provider proposals, and dogfooding automation out of the v1 blocker set unless docs accidentally present them as stable.
