import type { Plugin } from "../plugin";
import { MixedModuleGraph } from "./mixedModuleGraph";

export class PluginContainer {
  constructor(
    private readonly plugins: Plugin[],
    private readonly graph = new MixedModuleGraph()
  ) {}

  async resolveId(id: string, importer: string): Promise<string> {
    for (const plugin of this.plugins) {
      const resolved = await plugin.resolveId?.(id, importer);
      if (resolved) {
        this.graph.registerResolvedModule(resolved, importer);
        return resolved;
      }
    }
    return id;
  }
}
