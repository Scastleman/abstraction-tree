export interface CatalogItem {
  id: string;
  sku: string;
  active: boolean;
}

export async function loadCatalog(sku: string): Promise<CatalogItem> {
  if (!sku) throw new Error("Missing catalog SKU");
  return { id: `catalog_${sku}`, sku, active: true };
}
