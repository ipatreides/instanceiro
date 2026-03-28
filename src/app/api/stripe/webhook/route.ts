import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    start: item ? new Date(item.current_period_start * 1000).toISOString() : null,
    end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
  };
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency check
  const { data: existing } = await admin
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .single();

  if (existing) {
    return NextResponse.json({ received: true });
  }

  await admin.from("stripe_events").insert({ id: event.id });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      if (!userId || !session.subscription) break;

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );

      const period = getSubscriptionPeriod(subscription);
      await admin.from("subscriptions").insert({
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: subscription.items.data[0]?.price.id,
        status: subscription.status === "trialing" ? "trialing" : "active",
        current_period_start: period.start,
        current_period_end: period.end,
      });

      // Sync JWT claim
      await syncJwtTier(admin, userId);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId || typeof subscriptionId !== "string") break;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const paidPeriod = getSubscriptionPeriod(subscription);
      await admin
        .from("subscriptions")
        .update({
          status: "active",
          current_period_start: paidPeriod.start,
          current_period_end: paidPeriod.end,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscriptionId);

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      if (!subscriptionId || typeof subscriptionId !== "string") break;

      const { data: sub } = await admin
        .from("subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscriptionId)
        .select("user_id")
        .single();

      if (sub) await syncJwtTier(admin, sub.user_id);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      const updatedPeriod = getSubscriptionPeriod(subscription);
      const updateData: Record<string, unknown> = {
        status: subscription.status === "trialing" ? "trialing" : subscription.status,
        stripe_price_id: subscription.items.data[0]?.price.id,
        current_period_start: updatedPeriod.start,
        current_period_end: updatedPeriod.end,
        cancel_at: subscription.cancel_at
          ? new Date(subscription.cancel_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      };

      const { data: sub } = await admin
        .from("subscriptions")
        .update(updateData)
        .eq("stripe_subscription_id", subscription.id)
        .select("user_id")
        .single();

      if (sub) await syncJwtTier(admin, sub.user_id);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      const { data: sub } = await admin
        .from("subscriptions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscription.id)
        .select("user_id")
        .single();

      if (sub) await syncJwtTier(admin, sub.user_id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function syncJwtTier(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("tier")
    .eq("id", userId)
    .single();

  if (profile) {
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { tier: profile.tier },
    });
  }
}
