# Visual Demo

> Audience: New users and evaluators
> Status: Stable app workflow with real local screenshots
> Read after: GETTING_STARTED.md

The visual app shows the target project's generated `.abstraction-tree/` memory. It should show this repository's dogfooding memory only when this repository is the target project.

## Launch the Demo

```bash
npm install
npm run build
npm run atree -- init --with-app --project examples/small-web-app
npm run atree -- scan --project examples/small-web-app
npm run atree -- serve --project examples/small-web-app --open
```

## What the App Shows

- The abstraction hierarchy as an expandable tree.
- A selected node summary, explanation, reason for existence, and separation logic.
- Files owned by the selected node.
- Concepts and invariants inferred from the target project.
- Recent semantic changes and validation/evaluation health.
- Goal workspaces, mission-plan stages, scope selections, coherence reviews, and context packs when those workflow artifacts exist.

## Walkthrough

1. Open the root project node and read its explanation.
2. Expand the architecture branch to see the generated API, UI, dataflow, and package-distribution surfaces.
3. Select a checkout-related node and compare its owned files with the checkout source files.
4. Review concepts such as checkout, cart, payment, and order.
5. Run `atree validate` after changing the example and refresh the app to see drift or health updates.
6. Create a goal workspace and refresh the app to inspect the goal workflow view:

```bash
node -e "require('node:fs').writeFileSync('examples/small-web-app/demo-goal.md', 'Add visual support for checkout mission planning.\n')"
npm run atree -- goal --project examples/small-web-app --file demo-goal.md --review-required
npm run atree -- serve --project examples/small-web-app --host 127.0.0.1 --port 4327
```

## Goal Workflow Views

The **Goal workflow views** panel appears when `/api/state` can derive workflow artifacts from `.abstraction-tree/goals/`, `.abstraction-tree/scopes/`, or `.abstraction-tree/context-packs/`.

- **Goal Workspaces** lists active and historical goal workspaces with status, mode, affected-file count, planned task count, unresolved-item count, and links to generated reports.
- **Mission Plan** renders the plan as analysis, planning, execution, and review stages. Each stage exposes its actions, evidence files, and matching context packs.
- **Scope Review** shows selected, excluded, and questionable files, concepts, invariants, nodes, areas, and checks. Use the built-in filters to focus on high-impact or questionable selections.
- **Coherence Review** summarizes the final verdict, remaining work, validation status, scope result, and evidence links.

Report links open through `GET /api/artifact?path=...`, which only serves text artifacts from `.abstraction-tree/` and redacts obvious token/password-style values before display.

## Screenshots

The screenshots below were captured from the local app against `examples/small-web-app`.

### Tree Hierarchy

The left panel shows an expandable abstraction tree generated from the target project's own `.abstraction-tree/` memory.

![Abstraction tree hierarchy](assets/visual-demo/tree-hierarchy.png)

### Selected Node Explanation

The selected-node panel starts with what the node represents, then shows the richer explanation, reason for existence, and child separation logic.

![Selected node explanation](assets/visual-demo/selected-node-explanation.png)

### File Ownership

Folder and file nodes connect the abstraction tree back to concrete source files so agents can pick a smaller edit boundary.

![File ownership](assets/visual-demo/file-ownership.png)

### Concepts And Invariants

The app exposes inferred concepts and invariants alongside the tree so humans can see cross-cutting project ideas and drift risks.

![Concepts and invariants](assets/visual-demo/concepts-invariants.png)

### Health, Context, And Drift

The app shows validation health and available agent-facing memory signals. This is evidence for review, not a guarantee that a change is correct.

![Context and drift health](assets/visual-demo/context-or-drift.png)

If the UI changes, refresh screenshots intentionally from a real `atree serve` session. Do not commit mock or generated marketing screenshots.

## Screenshot Refresh Checklist

Refresh these screenshots before a beta or release candidate when any of these change:

- visual app layout, styling, or selected-node panel content;
- `/api/state` shape or app memory loading behavior;
- generated node summary, explanation, reason-for-existence, or separation-logic fields;
- `examples/small-web-app` fixture memory;
- this visual demo page or README screenshot references.

Use a real local app session against `examples/small-web-app`:

```bash
npm install
npm run build
npm run atree -- init --with-app --project examples/small-web-app
npm run atree -- scan --project examples/small-web-app
npm run atree -- serve --project examples/small-web-app --host 127.0.0.1 --port 4327
```

Open the printed URL and replace the files in `docs/assets/visual-demo/`:

- `tree-hierarchy.png`
- `selected-node-explanation.png`
- `file-ownership.png`
- `concepts-invariants.png`
- `context-or-drift.png`

When goal workflow views change, also capture a workflow screenshot from a project that has at least one generated goal workspace and review:

- `goal-workflow.png`

Then run:

```bash
npm run docs:commands
```

The docs command check verifies that referenced screenshot files exist. It does not prove that screenshots are visually current, so review the images manually before a beta or v1 candidate.
