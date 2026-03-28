import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
  typescript: true,
});

export const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY_ID!,
  yearly: process.env.STRIPE_PRICE_YEARLY_ID!,
} as const;
