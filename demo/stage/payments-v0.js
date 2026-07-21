import stripe from "./stripe-client.js";

const STRIPE_KEY = process.env.STRIPE_KEY;

export function chargeCustomer(order) {
  return stripe.charge(order.amountCents, STRIPE_KEY);
}
