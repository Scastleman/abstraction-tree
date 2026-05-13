# abstraction-tree

Full install package for Abstraction Tree. It includes:

- `@abstraction-tree/cli` for core abstraction-tree commands
- `@abstraction-tree/app` for the optional local visual project explorer

Use it in an existing project:

```bash
npm install -D abstraction-tree
npx atree init --with-app
npx atree scan
npx atree serve
```

`atree init` creates a blank project-local `.abstraction-tree/` workspace. It does not copy Abstraction Tree's own repository memory into your project; `atree scan` generates memory from your files.
