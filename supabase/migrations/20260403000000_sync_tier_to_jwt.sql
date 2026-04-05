-- Fix: sync tier to auth.users app_metadata so RLS policies that read
-- auth.jwt()->'app_metadata'->>'tier' work correctly.
-- Previously sync_user_tier() only updated profiles.tier but never
-- wrote to auth.users, so the JWT never contained the tier claim.

-- 1. Update the trigger function to also write app_metadata
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

  -- Sync to auth.users so the JWT includes the tier claim
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('tier', v_new_tier)
  WHERE id = v_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Backfill: sync existing profiles.tier → auth.users.app_metadata
UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('tier', p.tier)
FROM profiles p
WHERE p.id = u.id
  AND p.tier IS NOT NULL;
