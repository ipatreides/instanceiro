-- Atomic kill registration function
-- Prevents race conditions when multiple sniffers send the same kill simultaneously
-- Uses FOR UPDATE SKIP LOCKED for row-level locking

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
  p_killer_char_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
  v_dedup_cutoff TIMESTAMPTZ;
BEGIN
  v_dedup_cutoff := p_killed_at - INTERVAL '30 seconds';

  -- Atomic dedup: check if kill exists within 30s window
  -- FOR UPDATE SKIP LOCKED prevents race conditions
  SELECT id INTO v_existing_id
  FROM mvp_kills
  WHERE group_id = p_group_id
    AND mvp_id = ANY(p_mvp_ids)
    AND killed_at >= v_dedup_cutoff
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing kill with additional info if available
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

    -- Clean sightings
    DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id);
  END IF;

  -- Delete the most recent active kill (overwrite)
  DELETE FROM mvp_kills
  WHERE id = (
    SELECT id FROM mvp_kills
    WHERE group_id = p_group_id
      AND mvp_id = ANY(p_mvp_ids)
      AND killed_at < v_dedup_cutoff
    ORDER BY killed_at DESC
    LIMIT 1
  );

  -- Insert new kill
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    killer_character_id, killer_name_raw, registered_by, source, telemetry_session_id)
  VALUES (p_group_id, p_mvp_ids[1], p_killed_at, p_tomb_x, p_tomb_y,
    p_killer_char_id, p_killer_name, p_registered_by, p_source, p_session_id)
  RETURNING id INTO v_kill_id;

  -- Clean sightings
  DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id);
END;
$$ LANGUAGE plpgsql;
