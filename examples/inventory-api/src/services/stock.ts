export interface StockReservation {
  id: string;
  sku: string;
  quantity: number;
}

export async function reserveStock(sku: string, quantity: number): Promise<StockReservation> {
  if (!sku) throw new Error("Missing stock SKU");
  if (quantity <= 0) throw new Error("Cannot reserve empty stock");
  return { id: `stock_${sku}`, sku, quantity };
}
