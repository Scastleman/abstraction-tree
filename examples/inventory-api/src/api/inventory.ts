import { recordAudit } from "../services/audit";
import { loadCatalog } from "../services/catalog";
import { reserveStock } from "../services/stock";

export async function getInventory(sku: string, quantity: number) {
  const catalog = await loadCatalog(sku);
  const stock = await reserveStock(sku, quantity);
  await recordAudit({ sku, quantity, catalogId: catalog.id, stockId: stock.id });
  return { sku, quantity, catalog, stock };
}
