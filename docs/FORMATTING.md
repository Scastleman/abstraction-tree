# Formatting

This repository uses local, dependency-free formatting hygiene scripts:

```bash
npm run format
npm run format:check
```

The formatter normalizes line endings, trims trailing whitespace, ensures final newlines, and pretty-prints JSON. It covers TypeScript, TSX, JavaScript, JSON, Markdown, YAML, HTML, CSS, and PowerShell script files by extension.

PowerShell formatting is limited to text hygiene because the repo does not currently include a structural PowerShell formatter. Prettier would be appropriate for broader TypeScript, TSX, Markdown, and YAML formatting, but it is not added here because the dependency could not be installed and verified in the current offline sandbox.
