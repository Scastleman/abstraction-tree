export interface AuditEntry {
  sku: string;
  quantity: number;
  catalogId: string;
  stockId: string;
}

export async function recordAudit(entry: AuditEntry) {
  if (!entry.sku) throw new Error("Missing audit SKU");
  return { id: `audit_${entry.sku}`, entry };
}
