export async function validateCart(userId: string, cartId: string) {
  if (!userId || !cartId) throw new Error("Missing cart identity");
  return { id: cartId, total: 100, items: [{ sku: "demo", quantity: 1 }] };
}
