-- Fix: prevent duplicate kills from tomb re-reads.
--
-- Bug: mvp-tomb passes now() as p_killed_at. For Pharaoh (1h respawn),
-- if the tomb is re-read 1h+ after the kill, the 59-min dedup window
-- doesn't reach the original kill → creates a duplicate.
--
-- Fix: when tomb coords are provided, first try to match an existing kill
-- with the same tomb coords up to cooldown + 10min. Same coords = same tomb
-- = same kill cycle. Only if no coord match, fall back to normal dedup window.

DROP FUNCTION IF EXISTS telemetry_register_kill(UUID, INT[], TIMESTAMPTZ, INT, INT, UUID, TEXT, UUID, TEXT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION telemetry_register_kill(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'telemetry',
  p_session_id UUID DEFAULT NULL,
  p_killer_name TEXT DEFAULT NULL,
  p_killer_char_id UUID DEFAULT NULL,
  p_update_only BOOLEAN DEFAULT FALSE
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
  v_dedup_cutoff TIMESTAMPTZ;
  v_respawn_ms INT;
  v_delay_ms INT;
  v_map_name TEXT;
  v_now TIMESTAMPTZ := COALESCE(p_killed_at, NOW());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  SELECT respawn_ms, delay_ms, map_name INTO v_respawn_ms, v_delay_ms, v_map_name FROM mvps WHERE id = p_mvp_ids[1];
  v_respawn_ms := COALESCE(v_respawn_ms, 3540000);
  v_delay_ms := COALESCE(v_delay_ms, 600000);

  -- Step 1: If tomb coords provided, look for a kill with the SAME tomb coords
  -- up to cooldown + 10min. Same coords = same tomb = same kill, ignore re-reads.
  IF p_tomb_x IS NOT NULL AND p_tomb_y IS NOT NULL THEN
    v_dedup_cutoff := v_now
      - make_interval(secs := (v_respawn_ms + v_delay_ms + 600000) / 1000.0);

    SELECT id INTO v_existing_id
    FROM mvp_kills
    WHERE group_id = p_group_id
      AND mvp_id = ANY(p_mvp_ids)
      AND killed_at >= v_dedup_cutoff
      AND tomb_x = p_tomb_x
      AND tomb_y = p_tomb_y
    ORDER BY killed_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- Step 2: If no tomb-coord match, use normal dedup window (respawn - 1min)
  IF v_existing_id IS NULL THEN
    v_dedup_cutoff := v_now
      - make_interval(secs := GREATEST((v_respawn_ms - 60000) / 1000.0, 60));

    SELECT id INTO v_existing_id
    FROM mvp_kills
    WHERE group_id = p_group_id
      AND mvp_id = ANY(p_mvp_ids)
      AND killed_at >= v_dedup_cutoff
    ORDER BY killed_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE mvp_kills SET
      killer_name_raw = COALESCE(p_killer_name, killer_name_raw),
      killer_character_id = COALESCE(p_killer_char_id, killer_character_id),
      tomb_x = COALESCE(p_tomb_x, tomb_x),
      tomb_y = COALESCE(p_tomb_y, tomb_y),
      killed_at = CASE
        WHEN p_killer_name IS NOT NULL AND p_killed_at IS NOT NULL THEN p_killed_at
        ELSE killed_at
      END,
      updated_at = NOW()
    WHERE id = v_existing_id;

    DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id);
  END IF;

  IF p_update_only THEN
    RETURN json_build_object('action', 'ignored', 'kill_id', NULL);
  END IF;

  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    killer_character_id, killer_name_raw, registered_by, source, telemetry_session_id,
    validation_status)
  VALUES (p_group_id, p_mvp_ids[1], COALESCE(p_killed_at, NOW()), p_tomb_x, p_tomb_y,
    p_killer_char_id, p_killer_name, p_registered_by, p_source, p_session_id,
    CASE WHEN p_source = 'telemetry' THEN 'pending' ELSE 'confirmed' END)
  RETURNING id INTO v_kill_id;

  -- Populate witnesses from active sessions on the same map (2-min grace window)
  IF v_map_name IS NOT NULL THEN
    INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
    SELECT DISTINCT v_kill_id, mgm.character_id, ts.user_id, ts.current_map
    FROM telemetry_sessions ts
    JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
    WHERE ts.group_id = p_group_id
      AND ts.current_map = v_map_name
      AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
    ON CONFLICT (kill_id, user_id) DO NOTHING;
  END IF;

  DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id);
END;
$$ LANGUAGE plpgsql;
