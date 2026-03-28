# Productization Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free/premium tier system with Stripe billing, gift codes, offline tracker landing page, and grandfathered legacy users.

**Architecture:** Supabase-centric tier enforcement via RLS + JWT custom claims, Stripe Checkout/Portal for billing, dual-write tier (profiles column + JWT claim) for instant UI updates. Offline tracker at `/` uses localStorage with public API for static data. Dashboard remains unchanged for logged-in users.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL + Auth + Realtime), Stripe (Checkout, Customer Portal, Webhooks), React 19, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-03-28-productization-tiers-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260328000000_productization_tiers.sql` | Schema: subscriptions, gift_codes, app_config, stripe_events tables + profiles alterations + mvp_kills verified column + get_user_tier function + tier sync trigger + updated RLS policies |
| `src/lib/stripe.ts` | Stripe client initialization (server-side) |
| `src/lib/rate-limit.ts` | IP-based rate limiting for API routes |
| `src/lib/local-tracker.ts` | localStorage read/write/validate for offline tracker |
| `src/hooks/use-tier.ts` | Tier state hook: reads profiles.tier + Realtime subscription + token refresh |
| `src/hooks/use-local-tracker.ts` | Hook wrapping local-tracker.ts for React components |
| `src/app/api/stripe/checkout/route.ts` | POST: create Stripe Checkout session |
| `src/app/api/stripe/portal/route.ts` | POST: create Stripe Customer Portal session |
| `src/app/api/stripe/webhook/route.ts` | POST: handle Stripe webhook events |
| `src/app/api/mvp-kills/route.ts` | POST: public MVP kill reporting (rate limited by IP) |
| `src/app/api/gift/redeem/route.ts` | POST: gift code redemption (rate limited by IP) |
| `src/app/api/instances/route.ts` | GET: public instance list (no auth) |
| `src/app/api/mvps/route.ts` | GET: public MVP list (no auth) |
| `src/app/premium/page.tsx` | Premium pricing page with toggle + gift code input |
| `src/components/tier/premium-badge.tsx` | Small "Premium" badge for gated elements |
| `src/components/tier/premium-gate.tsx` | Wrapper that disables children + shows badge for free users |
| `src/components/tier/founder-banner.tsx` | Membro Fundador banner for profile page |
| `src/components/tier/tier-indicator.tsx` | Nav tier indicator (gold icon / "Upgrade" link / founder badge) |
| `src/components/tracker/hero-section.tsx` | Landing hero: logo + tagline + CTAs |
| `src/components/tracker/instance-checklist.tsx` | Instance checklist for offline tracker |
| `src/components/tracker/mvp-tracker.tsx` | MVP timer for offline tracker |
| `src/components/tracker/server-selector.tsx` | Server selector (Freya/Nidhogg) for tracker |
| `src/components/profile/subscription-section.tsx` | Subscription management UI in profile |
| `src/components/profile/gift-code-section.tsx` | Gift code redemption UI in profile |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add Tier, Subscription, GiftCode, TrackerData types |
| `src/app/page.tsx` | Replace landing page with offline tracker |
| `src/app/layout.tsx` | Add TierProvider wrapping children |
| `package.json` | Add `stripe` dependency |
| `src/hooks/use-characters.ts` | Warn/block character creation when free tier at limit |
| `src/components/mvp/mvp-group-hub.tsx` | Add premium gate to "Criar Grupo" button |
| `src/app/dashboard/page.tsx` | Add tier indicator, downgrade export detection |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260328000000_productization_tiers.sql`

- [ ] **Step 1: Create the migration file with schema changes**

```sql
-- ============================================
-- Productization Tiers Migration
-- ============================================

-- 1. App config table
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config_public_read" ON app_config FOR SELECT USING (true);

INSERT INTO app_config (key, value) VALUES ('tier_launch_date', '2026-04-15T00:00:00Z');

-- 2. Profiles alterations
ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'premium', 'legacy_premium'));

-- 3. Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'gifted', 'gifted_lifetime')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_own_read" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- 4. Gift codes table
CREATE TABLE gift_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  duration INTERVAL,
  redeemed_by UUID REFERENCES profiles(id),
  redeemed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gift_codes_code ON gift_codes(code);

ALTER TABLE gift_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gift_codes_own_read" ON gift_codes FOR SELECT USING (auth.uid() = redeemed_by);

-- 5. Stripe events table (idempotency)
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
-- No public access — service role only

-- 6. MVP kills: add verified column
ALTER TABLE mvp_kills ADD COLUMN verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mvp_kills ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE mvp_kills ALTER COLUMN registered_by DROP NOT NULL;

-- 7. Tier calculation function
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id UUID) RETURNS TEXT AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_sub subscriptions%ROWTYPE;
  v_launch_date TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN 'free'; END IF;

  SELECT value::TIMESTAMPTZ INTO v_launch_date FROM app_config WHERE key = 'tier_launch_date';

  -- Check grandfathered
  IF v_launch_date IS NOT NULL AND v_profile.created_at < v_launch_date THEN
    SELECT * INTO v_sub FROM subscriptions
    WHERE user_id = p_user_id AND status IN ('active', 'trialing', 'gifted', 'gifted_lifetime')
    ORDER BY created_at DESC LIMIT 1;

    IF v_sub.id IS NOT NULL THEN
      RETURN 'premium';
    END IF;
    RETURN 'legacy_premium';
  END IF;

  -- Check active subscription
  SELECT * INTO v_sub FROM subscriptions
  WHERE user_id = p_user_id AND status IN ('active', 'trialing', 'past_due', 'gifted', 'gifted_lifetime')
  ORDER BY
    CASE status
      WHEN 'gifted_lifetime' THEN 0
      WHEN 'active' THEN 1
      WHEN 'trialing' THEN 2
      WHEN 'past_due' THEN 3
      WHEN 'gifted' THEN 4
    END
  LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    IF v_sub.status IN ('gifted', 'trialing') AND v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end < now() THEN
      RETURN 'free';
    END IF;
    RETURN 'premium';
  END IF;

  RETURN 'free';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger: sync tier on subscription changes
CREATE OR REPLACE FUNCTION sync_user_tier() RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_new_tier TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  v_new_tier := get_user_tier(v_user_id);

  UPDATE profiles SET tier = v_new_tier, updated_at = now()
  WHERE id = v_user_id AND tier IS DISTINCT FROM v_new_tier;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_tier
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_user_tier();

-- 9. Gift code redemption RPC
CREATE OR REPLACE FUNCTION redeem_gift_code(p_code TEXT) RETURNS JSONB AS $$
DECLARE
  v_gift gift_codes%ROWTYPE;
  v_sub_id UUID;
  v_status TEXT;
  v_period_end TIMESTAMPTZ;
  v_existing_sub subscriptions%ROWTYPE;
BEGIN
  -- Lock the gift code row
  SELECT * INTO v_gift FROM gift_codes WHERE code = upper(p_code) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_code');
  END IF;

  IF v_gift.redeemed_by IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'already_redeemed');
  END IF;

  IF v_gift.expires_at IS NOT NULL AND v_gift.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Determine subscription params
  IF v_gift.duration IS NULL THEN
    v_status := 'gifted_lifetime';
    v_period_end := NULL;
  ELSE
    v_status := 'gifted';
    -- Check for stacking: extend existing active subscription
    SELECT * INTO v_existing_sub FROM subscriptions
    WHERE user_id = auth.uid() AND status IN ('active', 'trialing', 'gifted')
    ORDER BY current_period_end DESC NULLS LAST LIMIT 1;

    IF v_existing_sub.id IS NOT NULL AND v_existing_sub.current_period_end IS NOT NULL AND v_existing_sub.current_period_end > now() THEN
      v_period_end := v_existing_sub.current_period_end + v_gift.duration;
    ELSE
      v_period_end := now() + v_gift.duration;
    END IF;
  END IF;

  -- Mark gift as redeemed
  UPDATE gift_codes SET redeemed_by = auth.uid(), redeemed_at = now() WHERE id = v_gift.id;

  -- Create subscription (lifetime overwrites existing)
  IF v_status = 'gifted_lifetime' THEN
    UPDATE subscriptions SET status = 'canceled', updated_at = now()
    WHERE user_id = auth.uid() AND status IN ('active', 'trialing', 'gifted');
  END IF;

  INSERT INTO subscriptions (user_id, status, current_period_start, current_period_end)
  VALUES (auth.uid(), v_status, now(), v_period_end)
  RETURNING id INTO v_sub_id;

  RETURN jsonb_build_object('success', true, 'status', v_status, 'period_end', v_period_end);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Backfill: set existing users to legacy_premium
-- (Runs once. All users created before tier_launch_date get legacy_premium)
UPDATE profiles SET tier = 'legacy_premium'
WHERE created_at < (SELECT value::TIMESTAMPTZ FROM app_config WHERE key = 'tier_launch_date');

-- 11. Updated RLS: characters insert (free = max 1)
-- First drop existing insert policy if any
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own characters" ON characters;
  DROP POLICY IF EXISTS "characters_insert" ON characters;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "characters_tier_insert" ON characters
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      (auth.jwt()->'app_metadata'->>'tier') IN ('premium', 'legacy_premium')
      OR (SELECT count(*) FROM characters WHERE user_id = auth.uid()) < 1
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd supabase && npx supabase db push` (or apply via Supabase dashboard)
Expected: Migration applies cleanly, all tables created.

- [ ] **Step 3: Verify migration**

Run: `npx supabase db reset` (or check via Supabase SQL editor)
Expected: Tables `app_config`, `subscriptions`, `gift_codes`, `stripe_events` exist. `profiles` has `tier` and `stripe_customer_id` columns. `mvp_kills` has `verified` column. Existing profiles have `tier = 'legacy_premium'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328000000_productization_tiers.sql
git commit -m "feat: add productization tiers database schema

Tables: subscriptions, gift_codes, app_config, stripe_events
Columns: profiles.tier, profiles.stripe_customer_id, mvp_kills.verified
Functions: get_user_tier, sync_user_tier trigger, redeem_gift_code RPC
RLS: tier-aware character insert policy"
```

---

## Task 2: Types & Stripe SDK Setup

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `package.json`
- Create: `src/lib/stripe.ts`

- [ ] **Step 1: Install Stripe SDK**

Run: `npm install stripe`
Expected: `stripe` added to `package.json` dependencies

- [ ] **Step 2: Add tier types to `src/lib/types.ts`**

Append to end of file:

```typescript
// Tier types

export type Tier = 'free' | 'premium' | 'legacy_premium';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'gifted' | 'gifted_lifetime';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiftCode {
  id: string;
  code: string;
  duration: string | null;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface TrackerInstanceData {
  completed_at: string;
}

export interface TrackerMvpKillData {
  killed_at: string;
}

export interface TrackerLocalData {
  server: string;
  instances: Record<string, TrackerInstanceData>;
  mvp_kills: Record<string, TrackerMvpKillData>;
}
```

- [ ] **Step 3: Update Profile type**

In `src/lib/types.ts`, update the `Profile` interface:

```typescript
export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string;
  username: string | null;
  onboarding_completed: boolean;
  tier: Tier;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Create Stripe server client**

Create `src/lib/stripe.ts`:

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
  typescript: true,
});

export const PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY_ID!,
  yearly: process.env.STRIPE_PRICE_YEARLY_ID!,
} as const;
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/types.ts src/lib/stripe.ts
git commit -m "feat: add tier types and Stripe SDK setup"
```

---

## Task 3: Rate Limiting Utility

**Files:**
- Create: `src/lib/rate-limit.ts`

- [ ] **Step 1: Create rate limit utility**

Create `src/lib/rate-limit.ts`:

```typescript
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore) {
    if (value.resetAt < now) rateLimitStore.delete(key);
  }
}, 60_000);

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: maxRequests - entry.count };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "feat: add IP-based rate limiting utility"
```

---

## Task 4: Tier Hook

**Files:**
- Create: `src/hooks/use-tier.ts`

- [ ] **Step 1: Create the tier hook**

Create `src/hooks/use-tier.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tier } from "@/lib/types";

interface TierContextValue {
  tier: Tier;
  loading: boolean;
  isPremium: boolean;
  isFounder: boolean;
  refreshTier: () => Promise<void>;
}

const TierContext = createContext<TierContextValue>({
  tier: "free",
  loading: true,
  isPremium: false,
  isFounder: false,
  refreshTier: async () => {},
});

export function useTier() {
  return useContext(TierContext);
}

export { TierContext };

export function useTierProvider(userId: string | null): TierContextValue {
  const [tier, setTier] = useState<Tier>("free");
  const [loading, setLoading] = useState(true);

  const fetchTier = useCallback(async () => {
    if (!userId) {
      setTier("free");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("tier")
      .eq("id", userId)
      .single();

    if (data?.tier) {
      setTier(data.tier as Tier);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchTier();
  }, [fetchTier]);

  // Realtime subscription on profiles.tier
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`tier:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newTier = payload.new.tier as Tier;
          if (newTier && newTier !== tier) {
            setTier(newTier);
            // Refresh JWT to sync RLS
            supabase.auth.refreshSession();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, tier]);

  return {
    tier,
    loading,
    isPremium: tier === "premium" || tier === "legacy_premium",
    isFounder: tier === "legacy_premium",
    refreshTier: fetchTier,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-tier.ts
git commit -m "feat: add tier hook with Realtime subscription"
```

---

## Task 5: TierProvider Integration

**Files:**
- Modify: `src/app/dashboard/page.tsx` (wrap with TierProvider)
- Modify: `src/app/layout.tsx` (no change needed — TierProvider is per-dashboard, not global)

This task integrates the tier hook into the dashboard. The TierProvider needs to wrap the dashboard where `userId` is available.

- [ ] **Step 1: Find where user is loaded in dashboard**

Read `src/app/dashboard/page.tsx` to find the user loading pattern. The dashboard loads user via `supabase.auth.getUser()` in a useEffect. Add TierContext.Provider there.

At the top of the dashboard component, after user is loaded, add:

```typescript
import { TierContext, useTierProvider } from "@/hooks/use-tier";
```

After `user` state is set, add:

```typescript
const tierValue = useTierProvider(user?.id ?? null);
```

Wrap the dashboard JSX return with:

```tsx
<TierContext.Provider value={tierValue}>
  {/* existing dashboard content */}
</TierContext.Provider>
```

- [ ] **Step 2: Verify dashboard still works**

Run: `npm run dev`
Expected: Dashboard loads normally. No visual changes yet.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: integrate TierProvider into dashboard"
```

---

## Task 6: Stripe Checkout API Route

**Files:**
- Create: `src/app/api/stripe/checkout/route.ts`

- [ ] **Step 1: Create the checkout route**

Create `src/app/api/stripe/checkout/route.ts`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/stripe/checkout/route.ts
git commit -m "feat: add Stripe Checkout API route"
```

---

## Task 7: Stripe Customer Portal API Route

**Files:**
- Create: `src/app/api/stripe/portal/route.ts`

- [ ] **Step 1: Create the portal route**

Create `src/app/api/stripe/portal/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${request.headers.get("origin")}/profile`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/stripe/portal/route.ts
git commit -m "feat: add Stripe Customer Portal API route"
```

---

## Task 8: Stripe Webhook Handler

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Create the webhook route**

Create `src/app/api/stripe/webhook/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

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

      await admin.from("subscriptions").insert({
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: subscription.items.data[0]?.price.id,
        status: subscription.status === "trialing" ? "trialing" : "active",
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      });

      // Sync JWT claim
      await syncJwtTier(admin, userId);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) break;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      await admin
        .from("subscriptions")
        .update({
          status: "active",
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscriptionId);

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;
      if (!subscriptionId) break;

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

      const updateData: Record<string, unknown> = {
        status: subscription.status === "trialing" ? "trialing" : subscription.status,
        stripe_price_id: subscription.items.data[0]?.price.id,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
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
  // profiles.tier is updated by the DB trigger on subscriptions.
  // Here we sync to JWT app_metadata for RLS.
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat: add Stripe webhook handler with idempotency"
```

---

## Task 9: Gift Code Redemption API Route

**Files:**
- Create: `src/app/api/gift/redeem/route.ts`

- [ ] **Step 1: Create the gift redemption route**

Create `src/app/api/gift/redeem/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Rate limit: 5 per minute per IP
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`gift:${ip}`, 5, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = (await request.json()) as { code: string };
  if (!code || typeof code !== "string" || code.length > 20) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("redeem_gift_code", {
    p_code: code.toUpperCase().trim(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: 400 });
  }

  // Sync JWT claim
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .single();

  if (profile) {
    await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { tier: profile.tier },
    });
  }

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/gift/redeem/route.ts
git commit -m "feat: add gift code redemption API route"
```

---

## Task 10: Public MVP Kills Endpoint

**Files:**
- Create: `src/app/api/mvp-kills/route.ts`

- [ ] **Step 1: Create the public MVP kills route**

Create `src/app/api/mvp-kills/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Rate limit: 10 per minute per IP
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`mvp-kills:${ip}`, 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { mvp_id, killed_at, server_id } = (await request.json()) as {
    mvp_id: number;
    killed_at: string;
    server_id: number;
  };

  // Validate input
  if (!mvp_id || !killed_at || !server_id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const killedAtDate = new Date(killed_at);
  if (isNaN(killedAtDate.getTime()) || killedAtDate.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "invalid_killed_at" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Validate mvp_id exists for this server
  const { data: mvp } = await admin
    .from("mvps")
    .select("id")
    .eq("id", mvp_id)
    .eq("server_id", server_id)
    .single();

  if (!mvp) {
    return NextResponse.json({ error: "invalid_mvp" }, { status: 400 });
  }

  // Check if authenticated (optional)
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not authenticated — that's fine
  }

  // Insert unverified kill
  const { error } = await admin.from("mvp_kills").insert({
    mvp_id,
    killed_at: killedAtDate.toISOString(),
    verified: false,
    group_id: null,
    registered_by: null,
    killer_character_id: null,
  });

  if (error) {
    console.error("Error inserting MVP kill:", error);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return new NextResponse(null, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/mvp-kills/route.ts
git commit -m "feat: add public MVP kills endpoint with rate limiting"
```

---

## Task 11: Public Instance & MVP Data APIs

**Files:**
- Create: `src/app/api/instances/route.ts`
- Create: `src/app/api/mvps/route.ts`

- [ ] **Step 1: Create public instances API**

Create `src/app/api/instances/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 3600; // ISR: revalidate every hour

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get("server_id");

  const admin = createAdminClient();

  const query = admin
    .from("instances")
    .select("id, name, level_required, party_min, cooldown_type, cooldown_hours, available_day, difficulty, reward, mutual_exclusion_group, level_max, wiki_url, start_map, liga_tier, liga_coins, is_solo, aliases")
    .order("name");

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
```

- [ ] **Step 2: Create public MVPs API**

Create `src/app/api/mvps/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get("server_id");

  const admin = createAdminClient();

  let query = admin
    .from("mvps")
    .select("id, server_id, monster_id, name, map_name, respawn_ms, delay_ms, level, hp")
    .order("name");

  if (serverId) {
    query = query.eq("server_id", parseInt(serverId, 10));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/instances/route.ts src/app/api/mvps/route.ts
git commit -m "feat: add public instance and MVP data APIs"
```

---

## Task 12: localStorage Tracker Utilities

**Files:**
- Create: `src/lib/local-tracker.ts`
- Create: `src/hooks/use-local-tracker.ts`

- [ ] **Step 1: Create localStorage utility**

Create `src/lib/local-tracker.ts`:

```typescript
import type { TrackerLocalData, TrackerInstanceData, TrackerMvpKillData } from "@/lib/types";

const STORAGE_KEY = "instanceiro_tracker";

function getTrackerData(): TrackerLocalData {
  if (typeof window === "undefined") {
    return { server: "freya", instances: {}, mvp_kills: {} };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { server: "freya", instances: {}, mvp_kills: {} };
    const parsed = JSON.parse(raw);
    return {
      server: parsed.server ?? "freya",
      instances: parsed.instances ?? {},
      mvp_kills: parsed.mvp_kills ?? {},
    };
  } catch {
    return { server: "freya", instances: {}, mvp_kills: {} };
  }
}

function saveTrackerData(data: TrackerLocalData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getServer(): string {
  return getTrackerData().server;
}

export function setServer(server: string): void {
  const data = getTrackerData();
  data.server = server;
  saveTrackerData(data);
}

export function getInstanceCompletions(): Record<string, TrackerInstanceData> {
  return getTrackerData().instances;
}

export function markInstanceComplete(instanceId: string): void {
  const data = getTrackerData();
  data.instances[instanceId] = { completed_at: new Date().toISOString() };
  saveTrackerData(data);
}

export function clearInstanceCompletion(instanceId: string): void {
  const data = getTrackerData();
  delete data.instances[instanceId];
  saveTrackerData(data);
}

export function getMvpKills(): Record<string, TrackerMvpKillData> {
  return getTrackerData().mvp_kills;
}

export function registerMvpKill(mvpId: string): void {
  const data = getTrackerData();
  data.mvp_kills[mvpId] = { killed_at: new Date().toISOString() };
  saveTrackerData(data);
}

export function getFullTrackerData(): TrackerLocalData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrackerLocalData;
  } catch {
    return null;
  }
}

export function clearTrackerData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasTrackerData(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function setDowngradeExported(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("instanceiro_downgrade_exported", "true");
}

export function wasDowngradeExported(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("instanceiro_downgrade_exported") === "true";
}

export function exportToLocalStorage(
  instances: Record<string, TrackerInstanceData>,
  mvpKills: Record<string, TrackerMvpKillData>,
  server: string
): void {
  const data: TrackerLocalData = { server, instances, mvp_kills: mvpKills };
  saveTrackerData(data);
  setDowngradeExported();
}
```

- [ ] **Step 2: Create the React hook**

Create `src/hooks/use-local-tracker.ts`:

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import {
  getServer,
  setServer as setServerStorage,
  getInstanceCompletions,
  markInstanceComplete as markComplete,
  clearInstanceCompletion,
  getMvpKills,
  registerMvpKill as registerKill,
} from "@/lib/local-tracker";
import type { TrackerInstanceData, TrackerMvpKillData } from "@/lib/types";

export function useLocalTracker() {
  const [server, setServerState] = useState("freya");
  const [instances, setInstances] = useState<Record<string, TrackerInstanceData>>({});
  const [mvpKills, setMvpKills] = useState<Record<string, TrackerMvpKillData>>({});

  useEffect(() => {
    setServerState(getServer());
    setInstances(getInstanceCompletions());
    setMvpKills(getMvpKills());
  }, []);

  const setServer = useCallback((s: string) => {
    setServerStorage(s);
    setServerState(s);
  }, []);

  const markInstanceDone = useCallback((instanceId: string) => {
    markComplete(instanceId);
    setInstances(getInstanceCompletions());
  }, []);

  const clearInstance = useCallback((instanceId: string) => {
    clearInstanceCompletion(instanceId);
    setInstances(getInstanceCompletions());
  }, []);

  const registerMvpKill = useCallback(
    async (mvpId: string, serverId: number) => {
      registerKill(mvpId);
      setMvpKills(getMvpKills());

      // Fire-and-forget POST to API
      try {
        await fetch("/api/mvp-kills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mvp_id: parseInt(mvpId, 10),
            killed_at: new Date().toISOString(),
            server_id: serverId,
          }),
        });
      } catch {
        // Silently fail — local data is source of truth
      }
    },
    []
  );

  return {
    server,
    setServer,
    instances,
    mvpKills,
    markInstanceDone,
    clearInstance,
    registerMvpKill,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/local-tracker.ts src/hooks/use-local-tracker.ts
git commit -m "feat: add localStorage tracker utilities and hook"
```

---

## Task 13: Tracker Landing Page (`/`)

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/tracker/hero-section.tsx`
- Create: `src/components/tracker/server-selector.tsx`
- Create: `src/components/tracker/instance-checklist.tsx`
- Create: `src/components/tracker/mvp-tracker.tsx`

- [ ] **Step 1: Create hero section**

Create `src/components/tracker/hero-section.tsx`:

```tsx
import { Logo } from "@/components/ui/logo";
import Link from "next/link";

export function HeroSection() {
  return (
    <section className="text-center py-8 px-4">
      <div className="flex justify-center mb-3">
        <Logo size="lg" />
      </div>
      <p className="text-text-secondary text-lg max-w-md mx-auto leading-relaxed mb-6">
        Rastreie instâncias e MVPs do Ragnarok Online — grátis, sem conta
      </p>
      <div className="flex items-center justify-center gap-3">
        <a
          href="#tracker"
          className="bg-primary text-white font-semibold px-5 py-2 rounded-md hover:bg-primary-hover transition-colors"
        >
          Começar ↓
        </a>
        <Link
          href="/login"
          className="text-text-secondary hover:text-text-primary font-medium px-5 py-2 transition-colors"
        >
          Entrar
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create server selector**

Create `src/components/tracker/server-selector.tsx`:

```tsx
"use client";

interface ServerSelectorProps {
  server: string;
  onServerChange: (server: string) => void;
}

const SERVERS = [
  { id: "freya", label: "Freya" },
  { id: "nidhogg", label: "Nidhogg" },
];

export function ServerSelector({ server, onServerChange }: ServerSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {SERVERS.map((s) => (
        <button
          key={s.id}
          onClick={() => onServerChange(s.id)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            server === s.id
              ? "bg-primary text-white"
              : "bg-surface text-text-secondary hover:text-text-primary border border-border"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create instance checklist**

Create `src/components/tracker/instance-checklist.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import type { Instance, TrackerInstanceData } from "@/lib/types";
import { calculateCooldownExpiry } from "@/lib/cooldown";

interface InstanceChecklistProps {
  instances: Instance[];
  completions: Record<string, TrackerInstanceData>;
  onMarkDone: (instanceId: string) => void;
  onClear: (instanceId: string) => void;
}

export function InstanceChecklist({
  instances,
  completions,
  onMarkDone,
  onClear,
}: InstanceChecklistProps) {
  const now = useMemo(() => new Date(), []);

  const states = useMemo(() => {
    return instances.map((inst) => {
      const completion = completions[String(inst.id)];
      let status: "available" | "cooldown" = "available";
      let cooldownExpiresAt: Date | null = null;

      if (completion) {
        const completedAt = new Date(completion.completed_at);
        cooldownExpiresAt = calculateCooldownExpiry(completedAt, inst.cooldown_type, inst.cooldown_hours);
        if (cooldownExpiresAt && cooldownExpiresAt > now) {
          status = "cooldown";
        }
      }

      return { instance: inst, status, cooldownExpiresAt, completion };
    });
  }, [instances, completions, now]);

  return (
    <div className="space-y-2">
      {states.map(({ instance, status, cooldownExpiresAt }) => (
        <div
          key={instance.id}
          className={`flex items-center justify-between p-3 rounded-md border ${
            status === "cooldown"
              ? "border-status-cooldown bg-surface/50"
              : "border-border bg-surface hover:bg-card-hover-bg"
          }`}
        >
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-text-primary truncate block">
              {instance.name}
            </span>
            {status === "cooldown" && cooldownExpiresAt && (
              <span className="text-xs text-status-cooldown-text">
                Disponível em {formatTimeRemaining(cooldownExpiresAt, now)}
              </span>
            )}
          </div>
          <button
            onClick={() =>
              status === "cooldown"
                ? onClear(String(instance.id))
                : onMarkDone(String(instance.id))
            }
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              status === "cooldown"
                ? "text-status-cooldown-text hover:bg-surface"
                : "bg-primary text-white hover:bg-primary-hover"
            }`}
          >
            {status === "cooldown" ? "Desfazer" : "Feito"}
          </button>
        </div>
      ))}
    </div>
  );
}

function formatTimeRemaining(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "agora";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
```

- [ ] **Step 4: Create MVP tracker**

Create `src/components/tracker/mvp-tracker.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import type { Mvp, TrackerMvpKillData } from "@/lib/types";

interface MvpTrackerProps {
  mvps: Mvp[];
  kills: Record<string, TrackerMvpKillData>;
  serverId: number;
  onRegisterKill: (mvpId: string, serverId: number) => void;
}

export function MvpTracker({ mvps, kills, serverId, onRegisterKill }: MvpTrackerProps) {
  const now = useMemo(() => new Date(), []);

  const states = useMemo(() => {
    return mvps.map((mvp) => {
      const kill = kills[String(mvp.id)];
      let status: "alive" | "cooldown" = "alive";
      let spawnAt: Date | null = null;

      if (kill) {
        const killedAt = new Date(kill.killed_at);
        spawnAt = new Date(killedAt.getTime() + mvp.respawn_ms);
        if (spawnAt > now) {
          status = "cooldown";
        }
      }

      return { mvp, status, spawnAt, kill };
    });
  }, [mvps, kills, now]);

  return (
    <div className="space-y-2">
      {states.map(({ mvp, status, spawnAt }) => (
        <div
          key={mvp.id}
          className={`flex items-center justify-between p-3 rounded-md border ${
            status === "cooldown"
              ? "border-status-cooldown bg-surface/50"
              : "border-border bg-surface hover:bg-card-hover-bg"
          }`}
        >
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-text-primary truncate block">
              {mvp.name}
            </span>
            <span className="text-xs text-text-secondary">{mvp.map_name}</span>
            {status === "cooldown" && spawnAt && (
              <span className="text-xs text-status-cooldown-text ml-2">
                Spawn ~{formatTime(spawnAt)}
              </span>
            )}
          </div>
          <button
            onClick={() => onRegisterKill(String(mvp.id), serverId)}
            className="px-3 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            Morreu
          </button>
        </div>
      ))}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
```

- [ ] **Step 5: Replace landing page with tracker**

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeroSection } from "@/components/tracker/hero-section";
import { ServerSelector } from "@/components/tracker/server-selector";
import { InstanceChecklist } from "@/components/tracker/instance-checklist";
import { MvpTracker } from "@/components/tracker/mvp-tracker";
import { useLocalTracker } from "@/hooks/use-local-tracker";
import type { Instance, Mvp } from "@/lib/types";

const SERVER_IDS: Record<string, number> = { freya: 1, nidhogg: 2 };

export default function TrackerPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"instances" | "mvps">("instances");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [mvps, setMvps] = useState<Mvp[]>([]);

  const tracker = useLocalTracker();

  // Redirect logged-in users to dashboard
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  // Fetch static data
  useEffect(() => {
    if (checking) return;
    Promise.all([
      fetch("/api/instances").then((r) => r.json()),
      fetch(`/api/mvps?server_id=${SERVER_IDS[tracker.server]}`).then((r) => r.json()),
    ]).then(([inst, mvpData]) => {
      setInstances(inst);
      setMvps(mvpData);
    });
  }, [checking, tracker.server]);

  if (checking) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <HeroSection />

      <main id="tracker" className="flex-1 max-w-2xl w-full mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-6">
          <ServerSelector server={tracker.server} onServerChange={tracker.setServer} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("instances")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === "instances" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Instâncias
            </button>
            <button
              onClick={() => setTab("mvps")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === "mvps" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              MVPs
            </button>
          </div>
        </div>

        {tab === "instances" ? (
          <InstanceChecklist
            instances={instances}
            completions={tracker.instances}
            onMarkDone={tracker.markInstanceDone}
            onClear={tracker.clearInstance}
          />
        ) : (
          <MvpTracker
            mvps={mvps}
            kills={tracker.mvpKills}
            serverId={SERVER_IDS[tracker.server]}
            onRegisterKill={tracker.registerMvpKill}
          />
        )}
      </main>

      <footer className="py-6 text-center">
        <p className="text-text-secondary text-sm">
          Feito para jogadores de Ragnarok Online LATAM
        </p>
      </footer>
    </div>
  );
}
```

- [ ] **Step 6: Verify tracker page works**

Run: `npm run dev`
Navigate to `http://localhost:3000` (logged out)
Expected: Hero section + server selector + instance checklist. Marking an instance as done persists in localStorage. Tab switching between Instâncias and MVPs works.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/components/tracker/
git commit -m "feat: replace landing page with offline tracker

Hero section + server selector + instance checklist + MVP tracker.
All data in localStorage, static data from public APIs."
```

---

## Task 14: Premium Pricing Page

**Files:**
- Create: `src/app/premium/page.tsx`

- [ ] **Step 1: Create the premium page**

Create `src/app/premium/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const BENEFITS = [
  "Personagens ilimitados",
  "Contas ilimitadas",
  "Grupos de MVP com amigos",
  "Alertas Discord de spawn",
  "Stats e histórico na nuvem",
  "Sync entre dispositivos",
  "Sugerir novas features",
];

export default function PremiumPage() {
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error === "Unauthorized") {
        router.push("/login?redirect=/premium");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="max-w-md w-full">
          <div className="flex justify-center mb-6">
            <Logo size="md" />
          </div>

          <h1 className="text-2xl font-bold text-text-primary text-center mb-2">
            Instanceiro Premium
          </h1>
          <p className="text-text-secondary text-center mb-8">
            Desbloqueie todas as features e apoie o projeto
          </p>

          {/* Plan toggle */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <button
              onClick={() => setPlan("monthly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                plan === "monthly"
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary border border-border"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setPlan("yearly")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                plan === "yearly"
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary border border-border"
              }`}
            >
              Anual
              <span className="absolute -top-2 -right-2 bg-status-available-text text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
                2 meses grátis
              </span>
            </button>
          </div>

          {/* Price card */}
          <div className="bg-surface border border-border rounded-lg p-6 mb-6">
            <div className="text-center mb-4">
              <span className="text-3xl font-bold text-text-primary">
                {plan === "monthly" ? "R$ 9,90" : "R$ 99,90"}
              </span>
              <span className="text-text-secondary text-sm ml-1">
                /{plan === "monthly" ? "mês" : "ano"}
              </span>
              {plan === "yearly" && (
                <p className="text-xs text-text-secondary mt-1">
                  Equivale a R$ 8,33/mês
                </p>
              )}
            </div>

            <ul className="space-y-2 mb-6">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-text-primary">
                  <svg className="w-4 h-4 text-status-available-text flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>

            <button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full bg-primary text-white font-semibold py-3 rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Redirecionando..." : "Começar trial de 7 dias"}
            </button>
          </div>

          <p className="text-xs text-text-secondary text-center">
            Cancele a qualquer momento. Sem compromisso.
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/premium/page.tsx
git commit -m "feat: add premium pricing page with plan toggle"
```

---

## Task 15: Premium Badge & Gate Components

**Files:**
- Create: `src/components/tier/premium-badge.tsx`
- Create: `src/components/tier/premium-gate.tsx`

- [ ] **Step 1: Create premium badge**

Create `src/components/tier/premium-badge.tsx`:

```tsx
import Link from "next/link";

interface PremiumBadgeProps {
  feature?: string;
}

export function PremiumBadge({ feature }: PremiumBadgeProps) {
  const href = feature ? `/premium?feature=${feature}` : "/premium";

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
    >
      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zm7-10a1 1 0 01.707.293l.828.828.828-.828a1 1 0 111.414 1.414l-.828.828.828.828a1 1 0 01-1.414 1.414l-.828-.828-.828.828a1 1 0 01-1.414-1.414l.828-.828-.828-.828A1 1 0 0112 2z" clipRule="evenodd" />
      </svg>
      Premium
    </Link>
  );
}
```

- [ ] **Step 2: Create premium gate wrapper**

Create `src/components/tier/premium-gate.tsx`:

```tsx
"use client";

import { useTier } from "@/hooks/use-tier";
import { PremiumBadge } from "./premium-badge";

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
  fallback?: React.ReactNode;
}

export function PremiumGate({ children, feature, fallback }: PremiumGateProps) {
  const { isPremium, loading } = useTier();

  if (loading) return <>{children}</>;

  if (isPremium) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="relative">
      <div className="opacity-50 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute top-1 right-1">
        <PremiumBadge feature={feature} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tier/
git commit -m "feat: add PremiumBadge and PremiumGate components"
```

---

## Task 16: Tier Indicator in Nav & Founder Banner

**Files:**
- Create: `src/components/tier/tier-indicator.tsx`
- Create: `src/components/tier/founder-banner.tsx`

- [ ] **Step 1: Create tier indicator**

Create `src/components/tier/tier-indicator.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTier } from "@/hooks/use-tier";

export function TierIndicator() {
  const { tier, loading } = useTier();

  if (loading) return null;

  if (tier === "legacy_premium") {
    return (
      <span className="text-xs font-semibold text-primary" title="Membro Fundador">
        ⭐ Fundador
      </span>
    );
  }

  if (tier === "premium") {
    return (
      <span className="text-xs font-semibold text-primary" title="Premium">
        ⭐
      </span>
    );
  }

  return (
    <Link
      href="/premium"
      className="text-xs text-text-secondary hover:text-primary transition-colors"
    >
      Upgrade
    </Link>
  );
}
```

- [ ] **Step 2: Create founder banner**

Create `src/components/tier/founder-banner.tsx`:

```tsx
"use client";

import { useTier } from "@/hooks/use-tier";
import type { Subscription } from "@/lib/types";

interface FounderBannerProps {
  subscription: Subscription | null;
  onManageSubscription: () => void;
}

export function FounderBanner({ subscription, onManageSubscription }: FounderBannerProps) {
  const { isFounder } = useTier();

  if (!isFounder) return null;

  const isVoluntarySubscriber = subscription && subscription.status === "active" && subscription.stripe_subscription_id;

  return (
    <div className="bg-surface border border-primary/30 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🛡️</span>
        <h3 className="font-semibold text-text-primary text-sm">
          {isVoluntarySubscriber ? "Membro Fundador & Apoiador" : "Membro Fundador — Acesso Premium Vitalício"}
        </h3>
      </div>
      <p className="text-text-secondary text-sm">
        {isVoluntarySubscriber
          ? "Obrigado por apoiar o Instanceiro!"
          : "Você faz parte dos primeiros usuários do Instanceiro."}
      </p>
      {isVoluntarySubscriber && (
        <button
          onClick={onManageSubscription}
          className="text-xs text-primary hover:underline mt-2"
        >
          Gerenciar assinatura
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tier/tier-indicator.tsx src/components/tier/founder-banner.tsx
git commit -m "feat: add TierIndicator and FounderBanner components"
```

---

## Task 17: Subscription & Gift Code Profile Sections

**Files:**
- Create: `src/components/profile/subscription-section.tsx`
- Create: `src/components/profile/gift-code-section.tsx`

- [ ] **Step 1: Create subscription section**

Create `src/components/profile/subscription-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTier } from "@/hooks/use-tier";
import Link from "next/link";

export function SubscriptionSection() {
  const { tier, isPremium, isFounder, loading } = useTier();
  const [portalLoading, setPortalLoading] = useState(false);

  if (loading) return null;

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  };

  if (isFounder) {
    return null; // Handled by FounderBanner
  }

  if (!isPremium) {
    return (
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="font-semibold text-text-primary text-sm mb-2">Plano</h3>
        <p className="text-text-secondary text-sm mb-3">
          Você está no plano gratuito. Desbloqueie todas as features com o Premium.
        </p>
        <Link
          href="/premium"
          className="inline-block bg-primary text-white font-semibold text-sm px-4 py-2 rounded-md hover:bg-primary-hover transition-colors"
        >
          Ver planos
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="font-semibold text-text-primary text-sm mb-2">Plano Premium</h3>
      <p className="text-text-secondary text-sm mb-3">
        Você tem acesso a todas as features do Instanceiro.
      </p>
      <button
        onClick={handleManageSubscription}
        disabled={portalLoading}
        className="text-sm text-primary hover:underline disabled:opacity-50"
      >
        {portalLoading ? "Abrindo..." : "Gerenciar assinatura"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create gift code section**

Create `src/components/profile/gift-code-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTier } from "@/hooks/use-tier";

export function GiftCodeSection() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const { refreshTier } = useTier();

  const handleRedeem = async () => {
    if (!code.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/gift/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("success");
        const label = data.status === "gifted_lifetime"
          ? "Premium vitalício"
          : data.period_end
            ? `Premium até ${new Date(data.period_end).toLocaleDateString("pt-BR")}`
            : "Premium ativado";
        setMessage(label);
        setCode("");
        await refreshTier();
      } else {
        setStatus("error");
        const errors: Record<string, string> = {
          invalid_code: "Código inválido",
          already_redeemed: "Este código já foi utilizado",
          expired: "Este código expirou",
          rate_limited: "Muitas tentativas. Aguarde um minuto.",
        };
        setMessage(errors[data.error] ?? "Erro ao resgatar código");
      }
    } catch {
      setStatus("error");
      setMessage("Erro de conexão");
    }
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="font-semibold text-text-primary text-sm mb-2">Código de Resgate</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setStatus("idle");
          }}
          placeholder="XXXXXXXXXXXX"
          maxLength={20}
          className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />
        <button
          onClick={handleRedeem}
          disabled={status === "loading" || !code.trim()}
          className="bg-primary text-white font-semibold text-sm px-4 py-2 rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {status === "loading" ? "..." : "Resgatar"}
        </button>
      </div>
      {status === "success" && (
        <p className="text-xs text-status-available-text mt-2">{message}</p>
      )}
      {status === "error" && (
        <p className="text-xs text-status-error-text mt-2">{message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/profile/subscription-section.tsx src/components/profile/gift-code-section.tsx
git commit -m "feat: add subscription and gift code profile sections"
```

---

## Task 18: Integrate Premium Gates into Existing UI

This task adds premium gates to existing components. The exact locations depend on the current component structure — the engineer should read each file before modifying.

**Files:**
- Modify: `src/components/mvp/mvp-group-hub.tsx` (or equivalent) — gate "Criar Grupo" button
- Modify: Character creation flow — gate second+ character for free users
- Modify: Dashboard nav — add TierIndicator

- [ ] **Step 1: Gate MVP group creation**

In the MVP group hub component, find the "Criar Grupo" button and wrap it:

```tsx
import { PremiumGate } from "@/components/tier/premium-gate";

// Wrap the create group button:
<PremiumGate feature="mvp-groups">
  <button onClick={handleCreateGroup} ...>
    Criar Grupo
  </button>
</PremiumGate>
```

- [ ] **Step 2: Gate character creation for free users**

In the character creation component, check the tier before allowing creation when the user already has 1 character:

```tsx
import { useTier } from "@/hooks/use-tier";
import { PremiumBadge } from "@/components/tier/premium-badge";

// In the component:
const { isPremium } = useTier();
const { characters } = useCharacters();
const canCreateCharacter = isPremium || characters.length < 1;

// In the JSX:
{canCreateCharacter ? (
  <button onClick={handleCreate}>Adicionar personagem</button>
) : (
  <div className="flex items-center gap-2">
    <button disabled className="opacity-50">Adicionar personagem</button>
    <PremiumBadge feature="characters" />
  </div>
)}
```

- [ ] **Step 3: Add TierIndicator to dashboard nav**

In `src/app/dashboard/page.tsx`, find the nav/header area and add:

```tsx
import { TierIndicator } from "@/components/tier/tier-indicator";

// In the nav, near the user avatar or settings:
<TierIndicator />
```

- [ ] **Step 4: Add profile sections**

In the profile page, add the subscription section, gift code section, and founder banner:

```tsx
import { SubscriptionSection } from "@/components/profile/subscription-section";
import { GiftCodeSection } from "@/components/profile/gift-code-section";
import { FounderBanner } from "@/components/tier/founder-banner";

// In the profile page JSX:
<FounderBanner subscription={subscription} onManageSubscription={handleManageSubscription} />
<SubscriptionSection />
<GiftCodeSection />
```

- [ ] **Step 5: Verify all gates work**

Run: `npm run dev`
Test as free user: verify character limit, MVP group gate, upgrade link visible.
Test as premium/legacy user: verify all features accessible, founder badge shows.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: integrate premium gates into existing UI

- MVP group creation gated for free users
- Character creation limited to 1 for free tier
- TierIndicator in dashboard nav
- Subscription and gift code sections in profile
- Founder banner for legacy premium users"
```

---

## Task 19: Downgrade Export to localStorage

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add downgrade detection and export**

In the dashboard, after tier loads, check for downgrade and export:

```tsx
import { useTier } from "@/hooks/use-tier";
import { wasDowngradeExported, exportToLocalStorage } from "@/lib/local-tracker";
import { createClient } from "@/lib/supabase/client";

// Inside the dashboard component, after tier loads:
useEffect(() => {
  if (tierValue.loading || tierValue.isPremium) return;
  if (wasDowngradeExported()) return;

  // User is free — check if they had premium data to export
  async function exportOnDowngrade() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get first account's first character
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, server_id")
      .eq("user_id", user.id)
      .order("sort_order")
      .limit(1);

    if (!accounts?.length) return;

    const { data: chars } = await supabase
      .from("characters")
      .select("id")
      .eq("account_id", accounts[0].id)
      .order("sort_order")
      .limit(1);

    if (!chars?.length) return;

    // Fetch completions
    const { data: completions } = await supabase
      .from("instance_completions")
      .select("instance_id, completed_at")
      .eq("character_id", chars[0].id)
      .order("completed_at", { ascending: false });

    // Fetch MVP kills
    const { data: kills } = await supabase
      .from("mvp_kills")
      .select("mvp_id, killed_at")
      .eq("registered_by", chars[0].id)
      .order("killed_at", { ascending: false });

    const instanceData: Record<string, { completed_at: string }> = {};
    for (const c of completions ?? []) {
      // Only keep latest per instance
      if (!instanceData[String(c.instance_id)]) {
        instanceData[String(c.instance_id)] = { completed_at: c.completed_at };
      }
    }

    const mvpData: Record<string, { killed_at: string }> = {};
    for (const k of kills ?? []) {
      if (!mvpData[String(k.mvp_id)]) {
        mvpData[String(k.mvp_id)] = { killed_at: k.killed_at };
      }
    }

    const serverMap: Record<number, string> = { 1: "freya", 2: "nidhogg" };
    exportToLocalStorage(instanceData, mvpData, serverMap[accounts[0].server_id] ?? "freya");
  }

  exportOnDowngrade();
}, [tierValue.loading, tierValue.isPremium]);
```

- [ ] **Step 2: Show downgrade notice**

After export, show a one-time notice:

```tsx
const [showDowngradeNotice, setShowDowngradeNotice] = useState(false);

// In the export effect, after exportToLocalStorage:
setShowDowngradeNotice(true);

// In JSX:
{showDowngradeNotice && (
  <div className="bg-surface border border-border rounded-lg p-4 mb-4">
    <p className="text-sm text-text-primary">
      Seus dados foram salvos localmente. Assine novamente para recuperar acesso completo.
    </p>
    <button
      onClick={() => setShowDowngradeNotice(false)}
      className="text-xs text-text-secondary mt-2 hover:text-text-primary"
    >
      Entendi
    </button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add downgrade export to localStorage with notice"
```

---

## Task 20: localStorage Migration on First Character

**Files:**
- Modify: `src/hooks/use-characters.ts`

- [ ] **Step 1: Add migration logic after character creation**

In `use-characters.ts`, modify the `createCharacter` function to check for localStorage data after creation:

```typescript
import { hasTrackerData, getFullTrackerData, clearTrackerData } from "@/lib/local-tracker";

// Inside createCharacter, after successful insert:
const createCharacter = useCallback(async (data: CreateCharacterData, activeInstanceIds?: Set<number>) => {
  // ... existing creation logic ...

  // After character is created and we have the new character ID:
  // Check if this is the first character and we have localStorage data to migrate
  if (characters.length === 0 && hasTrackerData()) {
    const trackerData = getFullTrackerData();
    if (trackerData) {
      try {
        // Migrate instance completions
        const instanceEntries = Object.entries(trackerData.instances);
        if (instanceEntries.length > 0) {
          const completions = instanceEntries
            .filter(([id, data]) => {
              const instanceId = parseInt(id, 10);
              return !isNaN(instanceId) && data.completed_at && !isNaN(new Date(data.completed_at).getTime());
            })
            .map(([id, data]) => ({
              character_id: newCharacter.id,
              instance_id: parseInt(id, 10),
              completed_at: data.completed_at,
            }));

          if (completions.length > 0) {
            await supabase.from("instance_completions").insert(completions);
          }
        }

        // Migrate MVP kills as unverified
        const killEntries = Object.entries(trackerData.mvp_kills);
        if (killEntries.length > 0) {
          const kills = killEntries
            .filter(([id, data]) => {
              const mvpId = parseInt(id, 10);
              return !isNaN(mvpId) && data.killed_at && !isNaN(new Date(data.killed_at).getTime());
            })
            .map(([id, data]) => ({
              mvp_id: parseInt(id, 10),
              killed_at: data.killed_at,
              verified: false,
              registered_by: newCharacter.id,
            }));

          if (kills.length > 0) {
            await supabase.from("mvp_kills").insert(kills);
          }
        }

        // Only clear after successful migration
        clearTrackerData();
      } catch (err) {
        console.error("Migration from localStorage failed (will retry):", err);
        // Don't clear localStorage — retry next time
      }
    }
  }

  return newCharacter;
}, [characters, /* ... existing deps */]);
```

- [ ] **Step 2: Verify migration works**

Run: `npm run dev`
1. Visit `/` (logged out), mark some instances as done
2. Sign up and create first character
3. Verify completions appear in dashboard
4. Verify localStorage is cleared

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-characters.ts
git commit -m "feat: migrate localStorage data on first character creation"
```

---

## Task 21: Environment Variables & Final Verification

**Files:**
- No new files — configuration only

- [ ] **Step 1: Document required env vars**

Add to `.env.local` (do not commit — already in .gitignore):

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY_ID=price_...
STRIPE_PRICE_YEARLY_ID=price_...
```

- [ ] **Step 2: Add publishable key to client**

Since `STRIPE_PUBLISHABLE_KEY` is only needed for Stripe.js (not used in this implementation — we redirect to Checkout), this step may be skipped unless adding client-side Stripe elements later.

- [ ] **Step 3: Verify full flow**

1. `/` — tracker works offline, localStorage persists
2. Login → `/dashboard` — tier shows correctly (legacy_premium for existing users)
3. `/premium` — pricing page loads, plan toggle works
4. Stripe Checkout (test mode) — creates subscription, webhook fires, tier updates
5. `/profile` — subscription section shows, gift code input works
6. Premium gates — free users see badges, premium users access everything
7. `npm run build` — no TypeScript errors
8. `npm run lint` — no lint errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```
