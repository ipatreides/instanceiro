-- Migration: instance_parties, instance_party_members, notifications
-- Date: 2026-03-23
-- Description: Add party tracking for instance completions and notification system

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE instance_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id int NOT NULL REFERENCES instances(id),
  completed_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE instance_party_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES instance_parties(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('confirmed', 'pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  is_read boolean NOT NULL DEFAULT false,
  responded boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Schema change: link instance_completions to parties
-- =============================================================================

ALTER TABLE instance_completions
  ADD COLUMN party_id uuid REFERENCES instance_parties(id) DEFAULT NULL;

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_instance_party_members_party_id ON instance_party_members(party_id);
CREATE INDEX idx_instance_party_members_user_id ON instance_party_members(user_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = false;
CREATE INDEX idx_instance_completions_party_id ON instance_completions(party_id) WHERE party_id IS NOT NULL;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE instance_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_party_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- instance_parties: see parties you created or are a member of
CREATE POLICY "select_own_or_member_parties" ON instance_parties
  FOR SELECT USING (
    created_by = auth.uid()
    OR id IN (
      SELECT party_id FROM instance_party_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "insert_own_parties" ON instance_parties
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- instance_party_members: see members of parties you created or your own memberships
CREATE POLICY "select_party_members" ON instance_party_members
  FOR SELECT USING (
    party_id IN (
      SELECT id FROM instance_parties WHERE created_by = auth.uid()
    )
    OR user_id = auth.uid()
  );

-- notifications: users can only see and update their own
CREATE POLICY "select_own_notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "update_own_notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- =============================================================================
-- Realtime
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =============================================================================
-- RPC: complete_instance_party
-- =============================================================================

CREATE OR REPLACE FUNCTION complete_instance_party(
  p_instance_id int,
  p_completed_at timestamptz,
  p_own_character_ids uuid[],
  p_friends jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party_id uuid;
  v_char_id uuid;
  v_char_record record;
  v_friend jsonb;
  v_friend_user_id uuid;
  v_friend_char_id uuid;
  v_friend_char_name text;
  v_instance_name text;
  v_username text;
BEGIN
  -- Validate own characters belong to the calling user
  IF EXISTS (
    SELECT 1 FROM unnest(p_own_character_ids) AS cid
    WHERE cid NOT IN (
      SELECT id FROM characters WHERE user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'One or more characters do not belong to the current user';
  END IF;

  -- Get instance name
  SELECT name INTO v_instance_name
  FROM instances
  WHERE id = p_instance_id;

  IF v_instance_name IS NULL THEN
    RAISE EXCEPTION 'Instance not found: %', p_instance_id;
  END IF;

  -- Get calling user's username
  SELECT username INTO v_username
  FROM profiles
  WHERE id = auth.uid();

  -- Validate friend entries: each character_id belongs to specified user_id
  FOR v_friend IN SELECT * FROM jsonb_array_elements(p_friends)
  LOOP
    v_friend_user_id := (v_friend->>'user_id')::uuid;
    v_friend_char_id := (v_friend->>'character_id')::uuid;

    IF NOT EXISTS (
      SELECT 1 FROM characters
      WHERE id = v_friend_char_id AND user_id = v_friend_user_id
    ) THEN
      RAISE EXCEPTION 'Character % does not belong to user %', v_friend_char_id, v_friend_user_id;
    END IF;
  END LOOP;

  -- Create the party
  INSERT INTO instance_parties (instance_id, completed_at, created_by)
  VALUES (p_instance_id, p_completed_at, auth.uid())
  RETURNING id INTO v_party_id;

  -- Insert own characters as confirmed members + completions
  FOREACH v_char_id IN ARRAY p_own_character_ids
  LOOP
    INSERT INTO instance_party_members (party_id, character_id, user_id, status)
    VALUES (v_party_id, v_char_id, auth.uid(), 'confirmed');

    INSERT INTO instance_completions (character_id, instance_id, completed_at, party_id)
    VALUES (v_char_id, p_instance_id, p_completed_at, v_party_id);
  END LOOP;

  -- Insert friend characters as pending members + notifications
  FOR v_friend IN SELECT * FROM jsonb_array_elements(p_friends)
  LOOP
    v_friend_user_id := (v_friend->>'user_id')::uuid;
    v_friend_char_id := (v_friend->>'character_id')::uuid;

    -- Get friend's character name
    SELECT name INTO v_friend_char_name
    FROM characters
    WHERE id = v_friend_char_id;

    INSERT INTO instance_party_members (party_id, character_id, user_id, status)
    VALUES (v_party_id, v_friend_char_id, v_friend_user_id, 'pending');

    INSERT INTO notifications (user_id, type, payload)
    VALUES (
      v_friend_user_id,
      'party_confirm',
      jsonb_build_object(
        'party_id', v_party_id,
        'instance_name', v_instance_name,
        'invited_by', v_username,
        'character_id', v_friend_char_id,
        'character_name', v_friend_char_name,
        'completed_at', p_completed_at
      )
    );
  END LOOP;

  RETURN v_party_id;
END;
$$;

-- =============================================================================
-- RPC: respond_party_notification
-- =============================================================================

CREATE OR REPLACE FUNCTION respond_party_notification(
  p_notification_id uuid,
  p_accepted boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification record;
  v_party_id uuid;
  v_character_id uuid;
  v_instance_id int;
  v_completed_at timestamptz;
BEGIN
  -- Get and validate the notification
  SELECT * INTO v_notification
  FROM notifications
  WHERE id = p_notification_id
    AND user_id = auth.uid()
    AND type = 'party_confirm';

  IF v_notification IS NULL THEN
    RAISE EXCEPTION 'Notification not found or does not belong to current user';
  END IF;

  IF v_notification.expires_at < now() THEN
    RAISE EXCEPTION 'Notification has expired';
  END IF;

  IF v_notification.responded THEN
    RAISE EXCEPTION 'Notification has already been responded to';
  END IF;

  -- Extract data from payload
  v_party_id := (v_notification.payload->>'party_id')::uuid;
  v_character_id := (v_notification.payload->>'character_id')::uuid;

  IF p_accepted THEN
    -- Update party member status
    UPDATE instance_party_members
    SET status = 'accepted'
    WHERE party_id = v_party_id AND character_id = v_character_id AND user_id = auth.uid();

    -- Get instance details from the party
    SELECT instance_id, completed_at INTO v_instance_id, v_completed_at
    FROM instance_parties
    WHERE id = v_party_id;

    -- Create the instance completion
    INSERT INTO instance_completions (character_id, instance_id, completed_at, party_id)
    VALUES (v_character_id, v_instance_id, v_completed_at, v_party_id);
  ELSE
    -- Update party member status to declined
    UPDATE instance_party_members
    SET status = 'declined'
    WHERE party_id = v_party_id AND character_id = v_character_id AND user_id = auth.uid();
  END IF;

  -- Mark notification as responded
  UPDATE notifications
  SET responded = true
  WHERE id = p_notification_id;
END;
$$;
