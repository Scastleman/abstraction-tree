export interface Plugin {
  name: string;
  resolveId?: (id: string, importer?: string) => string | null | Promise<string | null>;
}

export function normalizePluginName(plugin: Plugin): string {
  return plugin.name.trim();
}
