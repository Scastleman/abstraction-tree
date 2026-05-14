# Beta Verification Evidence Template

> Copy this file before filling it in. Do not paste secrets, private source code, npm tokens, or full private `.abstraction-tree/` memory.

## Candidate

- Package version: `0.2.0-beta.1`
- npm dist-tag: `beta`
- Verification date: `[YYYY-MM-DD]`
- Reviewer: `[name or handle]`
- Result: `[pass/fail/partial]`

## Environment

- OS: `[paste OS and version]`
- Shell: `[PowerShell, bash, zsh, etc.]`
- Node version: `[paste node --version]`
- npm version: `[paste npm --version]`
- Clean directory path: `[redacted path is fine]`

## Full Package Verification

Install from the public registry:

```bash
npm init -y
npm install -D abstraction-tree@beta
```

Output:

```text
[paste redacted output here]
```

Run the stable path:

```bash
npx atree init --with-app
npx atree scan
npx atree doctor
npx atree validate
npx atree context --target checkout
npx atree export --format mermaid
npx atree serve
```

Results:

| Command | Result | Notes |
| --- | --- | --- |
| `npx atree init --with-app` | `[pass/fail]` | `[notes]` |
| `npx atree scan` | `[pass/fail]` | `[notes]` |
| `npx atree doctor` | `[pass/fail]` | `[notes]` |
| `npx atree validate` | `[pass/fail]` | `[notes]` |
| `npx atree context --target checkout` | `[pass/fail]` | `[notes]` |
| `npx atree export --format mermaid` | `[pass/fail]` | `[notes]` |
| `npx atree serve` | `[pass/fail]` | `[notes]` |

Selected output:

```text
[paste redacted output here]
```

Screenshots, if relevant:

- `[link or path to redacted screenshot]`

## Core-Only Package Verification

Use a second clean directory:

```bash
npm init -y
npm install -D @abstraction-tree/cli@beta
npx atree init --core
npx atree scan
npx atree doctor
npx atree validate
```

Results:

| Command | Result | Notes |
| --- | --- | --- |
| `npm install -D @abstraction-tree/cli@beta` | `[pass/fail]` | `[notes]` |
| `npx atree init --core` | `[pass/fail]` | `[notes]` |
| `npx atree scan` | `[pass/fail]` | `[notes]` |
| `npx atree doctor` | `[pass/fail]` | `[notes]` |
| `npx atree validate` | `[pass/fail]` | `[notes]` |

Selected output:

```text
[paste redacted output here]
```

## Dogfooding-Memory Isolation

- Did the new project start with blank local memory after `init`? `[yes/no]`
- Did `scan` generate memory from the external project rather than this repository? `[yes/no]`
- Were `runs/`, `lessons/`, `evaluations/`, `goals/`, or `automation/` copied from this repository? `[yes/no]`

Evidence:

```text
[paste redacted file listing or doctor output here]
```

## Issues Found

- `[issue or none]`

## Candidate Review Update

- Link this completed evidence from `docs/V1_RELEASE_CANDIDATE_REVIEW.md`.
- Mark only evidence-backed gates as Pass.
- Keep v1 blocked if any required gate lacks evidence.
