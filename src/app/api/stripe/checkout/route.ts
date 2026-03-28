import { NextResponse } from "next/server";
import { stripe, PRICES } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plan } = (await request.json()) as { plan: "monthly" | "yearly" };
  if (!plan || !PRICES[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get or create Stripe customer
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, tier")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // Check if user ever had a subscription (for trial eligibility)
  const { count } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["active", "canceled", "past_due"]);

  const isFirstSubscription = (count ?? 0) === 0;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    currency: "brl",
    line_items: [{ price: PRICES[plan], quantity: 1 }],
    subscription_data: isFirstSubscription
      ? { trial_period_days: 7 }
      : undefined,
    success_url: `${request.headers.get("origin")}/profile?upgraded=true`,
    cancel_url: `${request.headers.get("origin")}/premium`,
    metadata: { supabase_user_id: user.id },
  });

  return NextResponse.json({ url: session.url });
}
