# Small Web App Example

This compact fixture demonstrates the stable Abstraction Tree workflow without requiring a large real project.

It contains:

- a checkout API coordinator;
- cart, payment, and order service modules;
- a small checkout UI component;
- tests that exercise the checkout flow.

Use it for the beginner walkthrough:

```bash
npm run atree -- init --with-app --project examples/small-web-app
npm run atree -- scan --project examples/small-web-app
npm run atree -- doctor --project examples/small-web-app
npm run atree -- context --project examples/small-web-app --target checkout --format markdown
npm run atree -- export --project examples/small-web-app --format mermaid
npm run atree -- serve --project examples/small-web-app --open
```

The generated tree should surface checkout, cart, payment, and order concepts, then connect those concepts back to concrete files.
