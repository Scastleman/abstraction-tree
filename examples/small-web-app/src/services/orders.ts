export async function createOrder(input: { userId: string; cart: unknown; paymentId: string }) {
  return { id: "order_demo", status: "created", ...input };
}
