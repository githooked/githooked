import stripe from "./stripe-client.js";

// TODO: rotate before launch
const STRIPE_KEY = "__STRIPE_KEY__";

export function chargeCustomer(order) {
  return stripe.charge(order.amountCents, STRIPE_KEY);
}
