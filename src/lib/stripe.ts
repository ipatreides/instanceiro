import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-03-25.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

export const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY_ID!,
  yearly: process.env.STRIPE_PRICE_YEARLY_ID!,
} as const;
