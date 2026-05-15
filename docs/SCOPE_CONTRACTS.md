# Scope Contracts

> Audience: Users and agents checking prompt overreach
> Status: Beta review workflow
> Read after: STABLE_VS_EXPERIMENTAL.md.

Scope contracts are Abstraction Tree's pre-change reliability guard. They turn a prompt into a small, reviewable boundary before an agent edits files, then compare the actual Git diff against that boundary after the edit.

## Create a Contract

```bash
atree scope --prompt "make the tree UI collapsible"
```

The command writes:

- `.abstraction-tree/scopes/YYYY-MM-DD-HHMM-scope.json`
- `.abstraction-tree/scopes/YYYY-MM-DD-HHMM-scope.md`

The contract records:

- intended change;
- affected tree nodes;
- allowed files grounded in node ownership, prompt matches, route estimates, concept evidence, local imports, and nearby source/test companions;
- allowed and forbidden areas;
- ambiguity warnings;
- max file and line counts;
- required checks.

If a prompt is ambiguous, the contract status becomes `needs-clarification`. For example, "dropdown" near "tree" is flagged because it may mean either a separate select menu or an in-tree disclosure control.

## Check the Current Diff

```bash
atree scope check --scope latest
```

or through npm:

```bash
npm run atree:scope:check
```

The check writes:

- `.abstraction-tree/scopes/<scope-id>-check.json`
- `.abstraction-tree/scopes/<scope-id>-check.md`

The check blocks when changed source files fall outside the allowed file list or when dangerous file categories are touched. It warns when the diff exceeds the contract's size limits, when clarification was requested, or when only generated memory changed.

Generated `.abstraction-tree/` memory refreshes are allowed by default, because normal implementation work often ends with `atree scan`. Automation config under `.abstraction-tree/automation/` is not treated as generated memory.

Scope checks also report review-oriented categories without adding new automatic blocking rules:

- generated-only changes;
- docs-only changes;
- package metadata or lockfile changes;
- implementation changes without tests;
- source changes without test or generated-memory refresh evidence;
- implementation changes spanning multiple subsystems.

The Markdown check report includes `Risky Areas` and `Recommended Reviewer Checks` sections so reviewers can distinguish source, test, docs, package, and generated-memory changes before accepting the diff.

## Goal Workspaces

`atree goal` also writes a goal-local scope contract:

```text
.abstraction-tree/goals/<goal-id>/scope-contract.json
.abstraction-tree/goals/<goal-id>/scope-contract.md
```

That contract combines the prompt, affected-tree mapping, and mission plan. After manually running a goal mission folder, check that exact contract:

```bash
npm run atree -- scope check --project . --scope .abstraction-tree/goals/<goal-id>/scope-contract.json
```

## App Visibility

The visual app surfaces the latest scope contract in the Agent health panel. It shows the contract status, clarification state, violation count, and allowed file count so reviewers can see whether the current work stayed inside the intended boundary.

## Intended Workflow

1. Run `atree scope --prompt "...user request..."`.
2. If the contract says `needs-clarification`, clarify before editing.
3. Edit only files listed in the contract unless the user expands scope.
4. Run checks.
5. Run `atree scope check --scope latest`.
6. Review any `blocked` or `warning` result before accepting the diff.
