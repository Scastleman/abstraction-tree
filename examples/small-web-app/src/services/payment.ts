export async function authorizePayment(total: number, paymentToken: string) {
  if (total <= 0) throw new Error("Cannot authorize an empty cart");
  if (!paymentToken) throw new Error("Missing payment token");
  return { id: "payment_demo", authorized: true };
}
