-- ============================================================
-- Part A: Friend invites
-- ============================================================

CREATE TABLE friend_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(8) NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code)
);

ALTER TABLE friend_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creator can view own invites"
  ON friend_invites FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can create invites"
  ON friend_invites FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can delete invites"
  ON friend_invites FOR DELETE
  USING (auth.uid() = created_by);

-- RPC: resolve_friend_invite (read-only, works for anon + authenticated)
CREATE OR REPLACE FUNCTION resolve_friend_invite(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_creator RECORD;
BEGIN
  SELECT * INTO v_invite FROM friend_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'invalid');
  END IF;

  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('status', 'used');
  END IF;

  -- Load creator profile
  SELECT id, username, display_name, avatar_url INTO v_creator
  FROM profiles WHERE id = v_invite.created_by;

  -- Unauthenticated user
  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'status', 'unauthenticated',
      'creator', json_build_object(
        'id', v_creator.id,
        'username', v_creator.username,
        'display_name', v_creator.display_name,
        'avatar_url', v_creator.avatar_url
      )
    );
  END IF;

  -- Self invite
  IF v_invite.created_by = auth.uid() THEN
    RETURN json_build_object('status', 'self_invite');
  END IF;

  -- Already friends
  IF EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
    AND (
      (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
      OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
    )
  ) THEN
    RETURN json_build_object(
      'status', 'already_friends',
      'creator', json_build_object(
        'id', v_creator.id,
        'username', v_creator.username,
        'display_name', v_creator.display_name,
        'avatar_url', v_creator.avatar_url
      )
    );
  END IF;

  RETURN json_build_object(
    'status', 'valid',
    'creator', json_build_object(
      'id', v_creator.id,
      'username', v_creator.username,
      'display_name', v_creator.display_name,
      'avatar_url', v_creator.avatar_url
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Must be callable by anon (unauthenticated users on invite page)
GRANT EXECUTE ON FUNCTION resolve_friend_invite TO anon, authenticated;

-- RPC: accept_friend_invite
CREATE OR REPLACE FUNCTION accept_friend_invite(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite FROM friend_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'invalid');
  END IF;

  IF v_invite.used_by IS NOT NULL THEN
    RETURN json_build_object('status', 'used');
  END IF;

  IF v_invite.created_by = auth.uid() THEN
    RETURN json_build_object('status', 'self_invite');
  END IF;

  -- Already friends
  IF EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
    AND (
      (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
      OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
    )
  ) THEN
    RETURN json_build_object('status', 'already_friends');
  END IF;

  -- Create friendship
  INSERT INTO friendships (requester_id, addressee_id, status)
  VALUES (auth.uid(), v_invite.created_by, 'accepted');

  -- Mark invite as used
  UPDATE friend_invites
  SET used_by = auth.uid(), used_at = NOW()
  WHERE id = v_invite.id;

  RETURN json_build_object('status', 'accepted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: create_friend_invite (with collision retry)
CREATE OR REPLACE FUNCTION create_friend_invite()
RETURNS JSON AS $$
DECLARE
  v_code TEXT;
  v_attempts INT := 0;
BEGIN
  LOOP
    v_code := generate_invite_code(8);
    BEGIN
      INSERT INTO friend_invites (code, created_by) VALUES (v_code, auth.uid());
      RETURN json_build_object('code', v_code);
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts >= 5 THEN
        RAISE EXCEPTION 'Failed to generate unique invite code';
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Part B: Drop old invite system
-- ============================================================

DROP FUNCTION IF EXISTS accept_invite(TEXT, UUID);
DROP FUNCTION IF EXISTS resolve_invite(TEXT);
DROP TABLE IF EXISTS schedule_invites;

-- ============================================================
-- Part C: Placeholder redesign
-- ============================================================

-- Add new columns with defaults (safe for existing rows)
ALTER TABLE schedule_placeholders
  ADD COLUMN slot_type TEXT DEFAULT 'class',
  ADD COLUMN slot_label TEXT DEFAULT '',
  ADD COLUMN slot_class TEXT;

-- Migrate existing data
UPDATE schedule_placeholders
SET slot_type = 'class',
    slot_label = character_class,
    slot_class = character_class;

-- Make NOT NULL
ALTER TABLE schedule_placeholders ALTER COLUMN slot_type SET NOT NULL;
ALTER TABLE schedule_placeholders ALTER COLUMN slot_label SET NOT NULL;

-- Remove defaults
ALTER TABLE schedule_placeholders ALTER COLUMN slot_type DROP DEFAULT;
ALTER TABLE schedule_placeholders ALTER COLUMN slot_label DROP DEFAULT;

-- Drop old columns
ALTER TABLE schedule_placeholders DROP COLUMN character_name;
ALTER TABLE schedule_placeholders DROP COLUMN character_class;

-- Add CHECK constraint
ALTER TABLE schedule_placeholders
  ADD CONSTRAINT valid_slot_type
  CHECK (slot_type IN ('class', 'dps_fisico', 'dps_magico', 'artista'));

-- RPC: claim_placeholder
CREATE OR REPLACE FUNCTION claim_placeholder(p_placeholder_id UUID, p_character_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_char RECORD;
BEGIN
  -- Lock and fetch placeholder
  SELECT * INTO v_placeholder
  FROM schedule_placeholders
  WHERE id = p_placeholder_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF v_placeholder.claimed_by IS NOT NULL THEN
    RETURN json_build_object('status', 'already_claimed');
  END IF;

  -- Validate character ownership
  SELECT * INTO v_char FROM characters WHERE id = p_character_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_owner');
  END IF;

  -- Validate class restriction
  IF v_placeholder.slot_type = 'class' AND v_char.class != v_placeholder.slot_class THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  IF v_placeholder.slot_type = 'artista' AND v_char.class NOT IN ('Trovador', 'Musa') THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  -- dps_fisico and dps_magico have no class restriction

  -- Claim
  UPDATE schedule_placeholders
  SET claimed_by = auth.uid(), claimed_character_id = p_character_id
  WHERE id = v_placeholder.id;

  RETURN json_build_object('status', 'claimed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
