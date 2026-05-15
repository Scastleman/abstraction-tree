# Project Configuration

> Audience: users who need repository-specific subsystem and vocabulary rules
> Status: Beta config surface

Abstraction Tree always keeps committed project memory in `.abstraction-tree/config.json`. For scanner customization, add JSON overrides outside generated memory:

- project override: `atree.config.json` at the project root;
- global override: `~/.abstraction-tree/config.json`;
- one-off override: `atree scan --config path/to/atree.config.json`;
- debugging without overrides: `atree scan --no-custom-config`.

The scanner merges settings in this order: `.abstraction-tree/config.json`, global override, then project or explicit override. Custom array settings are additive unless two subsystem patterns use the same `id`; in that case the later override wins for that pattern.

## Example

```json
{
  "subsystemPatterns": [
    {
      "id": "subsystem.api.routes",
      "title": "API Routes",
      "summary": "HTTP route handlers and request boundary code.",
      "paths": ["src/routes/**", "src/api/**"],
      "fileNames": ["*.route.ts"],
      "imports": ["hono", "express"],
      "priority": 50,
      "weight": 0.2,
      "responsibilities": [
        "Own request parsing, route handlers, and response shaping."
      ]
    },
    {
      "id": "subsystem.domain.logic",
      "title": "Domain Logic",
      "paths": ["src/domain/**", "src/usecases/**"],
      "priority": 40
    }
  ],
  "domainVocabulary": [
    {
      "concept": "inventory",
      "synonyms": ["sku", "stock unit", "catalog item"],
      "weight": 6
    }
  ],
  "conceptSignalWeights": {
    "path": 2,
    "symbol": 4,
    "export": 5,
    "doc": 1
  }
}
```

`subsystemPatterns` create or override first-level human subsystem nodes. A file matches when any configured selector matches its project-relative path, basename, imports, symbols, or extension. `paths` and `fileNames` use `*`, `**`, and `?` globs. `priority` controls subsystem ordering when configured priorities are present. `weight` increases confidence for matched custom subsystems.

`domainVocabulary` maps project terms to canonical concepts. In the example, scanner evidence for `sku` is ranked as `inventory`, and the synonym remains in the concept tags and evidence trail. `conceptSignalWeights` lets a project emphasize path, symbol, export, or documentation signals.

## Type Shape

```ts
interface SubsystemPatternConfig {
  id: string;
  title: string;
  summary?: string;
  paths?: string[];
  fileNames?: string[];
  imports?: string[];
  symbols?: string[];
  extensions?: string[];
  responsibilities?: string[];
  priority?: number;
  weight?: number;
  minimumMatches?: number;
}

interface DomainVocabularyMapping {
  concept: string;
  synonyms: string[];
  weight?: number;
}

type ConceptSignalWeightsConfig = Partial<Record<"path" | "symbol" | "export" | "doc", number>>;
```

These types are exported from `@abstraction-tree/core`.
