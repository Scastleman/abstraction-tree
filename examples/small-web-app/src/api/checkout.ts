import { validateCart } from "../services/cart";
import { authorizePayment } from "../services/payment";
import { createOrder } from "../services/orders";

export async function checkout(request: { userId: string; cartId: string; paymentToken: string }) {
  const cart = await validateCart(request.userId, request.cartId);
  const payment = await authorizePayment(cart.total, request.paymentToken);
  return createOrder({ userId: request.userId, cart, paymentId: payment.id });
}
