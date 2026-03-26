-- ============================================================
-- Placeholder Management RPCs
-- ============================================================

-- RPC: unclaim_placeholder
-- Only the schedule creator can unclaim a filled placeholder
CREATE OR REPLACE FUNCTION unclaim_placeholder(p_placeholder_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_schedule RECORD;
BEGIN
  SELECT sp.*, isch.created_by AS schedule_creator
  INTO v_placeholder
  FROM schedule_placeholders sp
  JOIN instance_schedules isch ON isch.id = sp.schedule_id
  WHERE sp.id = p_placeholder_id;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF v_placeholder.claimed_by IS NULL THEN
    RETURN json_build_object('status', 'not_claimed');
  END IF;

  IF v_placeholder.schedule_creator != auth.uid() THEN
    RETURN json_build_object('status', 'not_creator');
  END IF;

  UPDATE schedule_placeholders
  SET claimed_by = NULL, claimed_character_id = NULL
  WHERE id = p_placeholder_id;

  RETURN json_build_object('status', 'released');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: get_eligible_for_placeholder
-- Returns characters eligible to fill a specific placeholder slot
CREATE OR REPLACE FUNCTION get_eligible_for_placeholder(p_placeholder_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_schedule_id UUID;
  v_creator_id UUID;
  v_result JSON;
BEGIN
  -- Look up placeholder + schedule
  SELECT sp.*, isch.id AS sched_id, isch.created_by AS schedule_creator
  INTO v_placeholder
  FROM schedule_placeholders sp
  JOIN instance_schedules isch ON isch.id = sp.schedule_id
  WHERE sp.id = p_placeholder_id;

  IF NOT FOUND THEN
    RETURN '[]'::JSON;
  END IF;

  v_schedule_id := v_placeholder.sched_id;
  v_creator_id := v_placeholder.schedule_creator;

  -- Only the schedule creator can query eligible characters
  IF v_creator_id != auth.uid() THEN
    RETURN '[]'::JSON;
  END IF;

  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      c.id AS character_id,
      c.name AS character_name,
      c.class AS character_class,
      c.level AS character_level,
      c.user_id,
      p.username,
      p.avatar_url
    FROM characters c
    JOIN profiles p ON p.id = c.user_id
    WHERE c.is_active = true
      -- Only creator's own chars + accepted friends' chars
      AND (
        c.user_id = v_creator_id
        OR c.user_id IN (
          SELECT CASE
            WHEN requester_id = v_creator_id THEN addressee_id
            ELSE requester_id
          END
          FROM friendships
          WHERE status = 'accepted'
            AND (requester_id = v_creator_id OR addressee_id = v_creator_id)
        )
      )
      -- Not already a participant in this schedule
      AND c.id NOT IN (
        SELECT character_id FROM schedule_participants WHERE schedule_id = v_schedule_id
      )
      -- Not the schedule's own creator character
      AND c.id NOT IN (
        SELECT character_id FROM instance_schedules WHERE id = v_schedule_id
      )
      -- Not already claimed in another placeholder for this schedule
      AND c.id NOT IN (
        SELECT claimed_character_id FROM schedule_placeholders
        WHERE schedule_id = v_schedule_id AND claimed_character_id IS NOT NULL
      )
      -- Class restriction
      AND (
        CASE
          WHEN v_placeholder.slot_type = 'class' THEN c.class = v_placeholder.slot_class
          WHEN v_placeholder.slot_type = 'artista' THEN c.class IN ('Trovador', 'Musa')
          ELSE true -- dps_fisico, dps_magico: no restriction
        END
      )
    ORDER BY
      CASE WHEN c.user_id = v_creator_id THEN 0 ELSE 1 END,
      c.name
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RPC: claim_placeholder (updated)
-- Now allows schedule creator to assign any eligible character (own or friend's)
-- Also checks character is not already a participant
CREATE OR REPLACE FUNCTION claim_placeholder(p_placeholder_id UUID, p_character_id UUID)
RETURNS JSON AS $$
DECLARE
  v_placeholder RECORD;
  v_char RECORD;
  v_schedule_creator UUID;
  v_schedule_id UUID;
BEGIN
  -- Lock and fetch placeholder + schedule info
  SELECT sp.*, isch.created_by AS schedule_creator, isch.id AS sched_id
  INTO v_placeholder
  FROM schedule_placeholders sp
  JOIN instance_schedules isch ON isch.id = sp.schedule_id
  WHERE sp.id = p_placeholder_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_found');
  END IF;

  IF v_placeholder.claimed_by IS NOT NULL THEN
    RETURN json_build_object('status', 'already_claimed');
  END IF;

  v_schedule_creator := v_placeholder.schedule_creator;
  v_schedule_id := v_placeholder.sched_id;

  -- Validate character exists
  SELECT * INTO v_char FROM characters WHERE id = p_character_id;
  IF NOT FOUND THEN
    RETURN json_build_object('status', 'not_owner');
  END IF;

  -- Validate caller is character owner OR schedule creator
  IF v_char.user_id != auth.uid() AND v_schedule_creator != auth.uid() THEN
    RETURN json_build_object('status', 'not_owner');
  END IF;

  -- Check character is not already a participant in this schedule
  IF EXISTS (
    SELECT 1 FROM schedule_participants
    WHERE schedule_id = v_schedule_id AND character_id = p_character_id
  ) THEN
    RETURN json_build_object('status', 'already_participant');
  END IF;

  -- Check character is not the schedule's creator character
  IF EXISTS (
    SELECT 1 FROM instance_schedules
    WHERE id = v_schedule_id AND character_id = p_character_id
  ) THEN
    RETURN json_build_object('status', 'already_participant');
  END IF;

  -- Check character is not already claimed in another placeholder for this schedule
  IF EXISTS (
    SELECT 1 FROM schedule_placeholders
    WHERE schedule_id = v_schedule_id AND claimed_character_id = p_character_id
  ) THEN
    RETURN json_build_object('status', 'already_participant');
  END IF;

  -- Validate class restriction
  IF v_placeholder.slot_type = 'class' AND v_char.class != v_placeholder.slot_class THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  IF v_placeholder.slot_type = 'artista' AND v_char.class NOT IN ('Trovador', 'Musa') THEN
    RETURN json_build_object('status', 'class_mismatch');
  END IF;

  -- Claim: use character owner's user_id, not auth.uid()
  -- This is intentional: when creator assigns a friend's char, claimed_by = friend's user_id
  UPDATE schedule_placeholders
  SET claimed_by = v_char.user_id, claimed_character_id = p_character_id
  WHERE id = v_placeholder.id;

  RETURN json_build_object('status', 'claimed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
