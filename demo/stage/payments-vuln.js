import { exec } from "node:child_process";
import stripe from "./stripe-client.js";

const STRIPE_KEY = process.env.STRIPE_KEY;

export function chargeCustomer(order) {
  return stripe.charge(order.amountCents, STRIPE_KEY);
}

export function exportInvoices(customerId) {
  return new Promise((resolve, reject) => {
    exec(`invoice-tool export --customer ${customerId}`, (err, out) =>
      err ? reject(err) : resolve(out)
    );
  });
}
