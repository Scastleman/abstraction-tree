export interface MixedModuleNode {
  id: string;
  importers: string[];
}

export class MixedModuleGraph {
  private readonly modules = new Map<string, MixedModuleNode>();

  registerResolvedModule(id: string, importer: string): MixedModuleNode {
    const existing = this.modules.get(id) ?? { id, importers: [] };
    existing.importers.push(importer);
    this.modules.set(id, existing);
    return existing;
  }
}
