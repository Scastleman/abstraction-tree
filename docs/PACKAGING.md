# Packaging and install modes

Abstraction Tree supports two install modes because the abstraction layer should be useful even when a developer does not want a visual interface.

## Core-only package

Package: `@abstraction-tree/cli`

Use it for:

- `.abstraction-tree/` generation;
- deterministic project scanning;
- context packs for agents;
- CI validation;
- drift checks;
- semantic change records.

Example:

```bash
npm install -D @abstraction-tree/cli
npx atree init --core
npx atree scan
npx atree validate
```

This mode does not install or require the visual app.

## Full package

Package: `abstraction-tree`

Use it for the complete local-first experience:

- everything in core-only mode;
- the local browser-based visual project explorer.

Example:

```bash
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree serve
```

The full package depends on:

```txt
@abstraction-tree/cli
@abstraction-tree/app
```

## Source of truth

The source of truth is always `.abstraction-tree/`. The visual app only reads and displays the data. It must not maintain a separate project model.

## Switching modes

A project can switch modes without deleting its tree data:

```bash
npx atree mode core
npx atree mode full
```

This updates `.abstraction-tree/config.json` only.
