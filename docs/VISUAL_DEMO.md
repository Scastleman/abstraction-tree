# Visual Demo

> Audience: New users and evaluators
> Status: Stable app workflow with screenshot placeholders
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

## Walkthrough

1. Open the root project node and read its explanation.
2. Expand the architecture branch to see the generated API, UI, dataflow, and package-distribution surfaces.
3. Select a checkout-related node and compare its owned files with the checkout source files.
4. Review concepts such as checkout, cart, payment, and order.
5. Run `atree validate` after changing the example and refresh the app to see drift or health updates.

## Screenshot Placeholders

Screenshots are not generated automatically in this repository. Capture them manually from the local app and place them under `docs/assets/visual-demo/` using these names:

```text
docs/assets/visual-demo/tree-hierarchy.png
docs/assets/visual-demo/selected-node-explanation.png
docs/assets/visual-demo/file-ownership.png
docs/assets/visual-demo/concepts-invariants.png
docs/assets/visual-demo/context-or-drift.png
```

Each screenshot should prove a specific product claim:

- `tree-hierarchy.png`: the app shows a project-level abstraction tree.
- `selected-node-explanation.png`: node details are readable by humans.
- `file-ownership.png`: tree nodes connect back to concrete files.
- `concepts-invariants.png`: concepts and invariants are visible.
- `context-or-drift.png`: the app surfaces context, validation, or drift health.

Do not commit fake screenshots. If the UI changes, refresh screenshots intentionally.
