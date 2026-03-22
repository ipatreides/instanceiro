-- Schedule invite links
CREATE TABLE schedule_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  code VARCHAR(8) NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_id),
  UNIQUE(code)
);

ALTER TABLE schedule_invites ENABLE ROW LEVEL SECURITY;

-- RLS: only creator can see/manage their invite
CREATE POLICY "Creator can view own invites"
  ON schedule_invites FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can create invites"
  ON schedule_invites FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can delete invites"
  ON schedule_invites FOR DELETE
  USING (auth.uid() = created_by);

-- Schedule placeholders (external characters)
CREATE TABLE schedule_placeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  character_class TEXT NOT NULL,
  added_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES profiles(id),
  claimed_character_id UUID REFERENCES characters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schedule_placeholders ENABLE ROW LEVEL SECURITY;

-- RLS: visible to schedule creator and friends of creator
CREATE POLICY "Users can view placeholders"
  ON schedule_placeholders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM instance_schedules
    WHERE instance_schedules.id = schedule_placeholders.schedule_id
    AND (instance_schedules.created_by = auth.uid() OR is_friend_of(instance_schedules.created_by))
  ));

CREATE POLICY "Creator can add placeholders"
  ON schedule_placeholders FOR INSERT
  WITH CHECK (auth.uid() = added_by);

CREATE POLICY "Creator can remove placeholders"
  ON schedule_placeholders FOR DELETE
  USING (auth.uid() = added_by);

-- No direct UPDATE policy — claiming happens via RPC only

-- Enable realtime for placeholders
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_placeholders;

-- RPC: resolve_invite (read-only, for invite page)
CREATE OR REPLACE FUNCTION resolve_invite(invite_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_schedule RECORD;
  v_instance RECORD;
  v_creator RECORD;
  v_participants JSON;
  v_placeholders JSON;
  v_user_in_schedule BOOLEAN;
BEGIN
  -- Resolve invite
  SELECT * INTO v_invite FROM schedule_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'invite_not_found');
  END IF;

  -- Load schedule
  SELECT * INTO v_schedule FROM instance_schedules WHERE id = v_invite.schedule_id;

  -- Load instance
  SELECT id, name, start_map, liga_tier, level_required INTO v_instance
  FROM instances WHERE id = v_schedule.instance_id;

  -- Load creator profile
  SELECT id, username, avatar_url INTO v_creator
  FROM profiles WHERE id = v_invite.created_by;

  -- Load participants (enriched)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_participants
  FROM (
    SELECT sp.character_id, sp.user_id, sp.message, sp.created_at,
           p.username, p.avatar_url,
           c.name AS character_name, c.class AS character_class, c.level AS character_level
    FROM schedule_participants sp
    JOIN profiles p ON p.id = sp.user_id
    JOIN characters c ON c.id = sp.character_id
    WHERE sp.schedule_id = v_invite.schedule_id
  ) t;

  -- Load unclaimed placeholders
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_placeholders
  FROM (
    SELECT id, character_name, character_class, claimed_by, claimed_character_id
    FROM schedule_placeholders
    WHERE schedule_id = v_invite.schedule_id AND claimed_by IS NULL
  ) t;

  -- Check if current user already in schedule
  SELECT EXISTS (
    SELECT 1 FROM schedule_participants
    WHERE schedule_id = v_invite.schedule_id AND user_id = auth.uid()
  ) OR v_schedule.created_by = auth.uid()
  INTO v_user_in_schedule;

  RETURN json_build_object(
    'schedule', json_build_object(
      'id', v_schedule.id,
      'instance_id', v_schedule.instance_id,
      'character_id', v_schedule.character_id,
      'created_by', v_schedule.created_by,
      'scheduled_at', v_schedule.scheduled_at,
      'status', v_schedule.status,
      'message', v_schedule.message
    ),
    'instance', json_build_object(
      'id', v_instance.id,
      'name', v_instance.name,
      'start_map', v_instance.start_map,
      'liga_tier', v_instance.liga_tier,
      'level_required', v_instance.level_required
    ),
    'creator', json_build_object(
      'id', v_creator.id,
      'username', v_creator.username,
      'avatar_url', v_creator.avatar_url
    ),
    'participants', v_participants,
    'placeholders', v_placeholders,
    'user_already_joined', v_user_in_schedule
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RPC: accept_invite (join schedule + claim placeholder + create friendship)
-- p_character_id can be NULL for non-open schedules (friendship-only)
CREATE OR REPLACE FUNCTION accept_invite(invite_code TEXT, p_character_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_schedule RECORD;
  v_char RECORD;
  v_participant_count INT;
  v_placeholder_count INT;
  v_total INT;
BEGIN
  -- 1. Resolve invite
  SELECT * INTO v_invite FROM schedule_invites WHERE code = invite_code;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'message', 'invite_not_found');
  END IF;

  -- Load schedule
  SELECT * INTO v_schedule FROM instance_schedules WHERE id = v_invite.schedule_id;

  -- 3. Check schedule status (before character validation — friendship-only doesn't need a char)
  IF v_schedule.status != 'open' THEN
    -- Create friendship only
    INSERT INTO friendships (requester_id, addressee_id, status)
    SELECT auth.uid(), v_invite.created_by, 'accepted'
    WHERE auth.uid() != v_invite.created_by
    AND NOT EXISTS (
      SELECT 1 FROM friendships
      WHERE (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
         OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
    );
    RETURN json_build_object('status', 'friendship_only');
  END IF;

  -- 2. Validate character ownership (required for open schedules)
  IF p_character_id IS NULL THEN
    RETURN json_build_object('status', 'error', 'message', 'character_required');
  END IF;

  SELECT * INTO v_char FROM characters WHERE id = p_character_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'message', 'character_not_owned');
  END IF;

  -- 4. Count total slots
  SELECT COUNT(*) INTO v_participant_count
  FROM schedule_participants WHERE schedule_id = v_invite.schedule_id;

  SELECT COUNT(*) INTO v_placeholder_count
  FROM schedule_placeholders
  WHERE schedule_id = v_invite.schedule_id AND claimed_by IS NULL;

  v_total := v_participant_count + v_placeholder_count + 1; -- +1 for creator
  IF v_total >= 12 THEN
    RETURN json_build_object('status', 'full');
  END IF;

  -- 5. Check if user already in schedule
  IF EXISTS (
    SELECT 1 FROM schedule_participants
    WHERE schedule_id = v_invite.schedule_id AND user_id = auth.uid()
  ) OR v_schedule.created_by = auth.uid() THEN
    RETURN json_build_object('status', 'already_joined');
  END IF;

  -- 6. Insert participant
  INSERT INTO schedule_participants (schedule_id, character_id, user_id)
  VALUES (v_invite.schedule_id, p_character_id, auth.uid());

  -- 7. Try claim placeholder (with locking)
  WITH target AS (
    SELECT id FROM schedule_placeholders
    WHERE schedule_id = v_invite.schedule_id
      AND lower(character_name) = lower(v_char.name)
      AND claimed_by IS NULL
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE schedule_placeholders
  SET claimed_by = auth.uid(), claimed_character_id = p_character_id
  FROM target
  WHERE schedule_placeholders.id = target.id;

  -- 8. Create friendship (bidirectional check)
  INSERT INTO friendships (requester_id, addressee_id, status)
  SELECT auth.uid(), v_invite.created_by, 'accepted'
  WHERE auth.uid() != v_invite.created_by
  AND NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE (requester_id = auth.uid() AND addressee_id = v_invite.created_by)
       OR (requester_id = v_invite.created_by AND addressee_id = auth.uid())
  );

  -- 9. Return success
  RETURN json_build_object('status', 'joined');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: generate random alphanumeric code
CREATE OR REPLACE FUNCTION generate_invite_code(len INT DEFAULT 8)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..len LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
