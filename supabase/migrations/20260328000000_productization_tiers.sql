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
UPDATE profiles SET tier = 'legacy_premium'
WHERE created_at < (SELECT value::TIMESTAMPTZ FROM app_config WHERE key = 'tier_launch_date');

-- 11. Updated RLS: characters insert (free = max 1)
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
