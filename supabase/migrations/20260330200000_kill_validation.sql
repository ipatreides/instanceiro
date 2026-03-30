-- Add validation fields to mvp_kills
ALTER TABLE mvp_kills
  ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN validated_by UUID REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN validated_at TIMESTAMPTZ;

-- Set existing telemetry kills to 'pending'
UPDATE mvp_kills SET validation_status = 'pending' WHERE source = 'telemetry';

-- Witnesses table
CREATE TABLE mvp_kill_witnesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kill_id UUID NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_name TEXT NOT NULL,
  UNIQUE(kill_id, user_id)
);

CREATE INDEX idx_kill_witnesses_kill ON mvp_kill_witnesses(kill_id);
CREATE INDEX idx_kill_witnesses_user ON mvp_kill_witnesses(user_id);

-- Updated get_group_active_kills to include validation fields
CREATE OR REPLACE FUNCTION get_group_active_kills(p_group_id UUID, p_server_id INT)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT DISTINCT ON (k.mvp_id)
      k.id AS kill_id,
      k.mvp_id,
      k.killed_at,
      k.tomb_x,
      k.tomb_y,
      k.killer_character_id,
      k.registered_by,
      k.edited_by,
      k.source,
      k.killer_name_raw,
      k.validation_status,
      k.validated_by,
      k.validated_at,
      kc.name AS killer_name,
      rc.name AS registered_by_name,
      ec.name AS edited_by_name,
      vc.name AS validated_by_name,
      (SELECT count(*) FROM mvp_kills k2
       WHERE k2.mvp_id = k.mvp_id
       AND k2.group_id IS NOT DISTINCT FROM p_group_id)::int AS kill_count,
      (SELECT count(*) FROM mvp_kill_loots l
       WHERE l.kill_id = k.id
       AND l.source = 'telemetry'
       AND l.accepted IS NULL)::int AS pending_loots_count
    FROM mvp_kills k
    LEFT JOIN characters kc ON kc.id = k.killer_character_id
    LEFT JOIN characters rc ON rc.id = k.registered_by
    LEFT JOIN characters ec ON ec.id = k.edited_by
    LEFT JOIN characters vc ON vc.id = k.validated_by
    JOIN mvps m ON m.id = k.mvp_id AND m.server_id = p_server_id
    WHERE k.group_id IS NOT DISTINCT FROM p_group_id
    ORDER BY k.mvp_id, k.killed_at DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Updated telemetry_register_kill to populate witnesses and set validation_status
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
  v_map_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  SELECT respawn_ms, map_name INTO v_respawn_ms, v_map_name FROM mvps WHERE id = p_mvp_ids[1];
  v_respawn_ms := COALESCE(v_respawn_ms, 3540000);

  v_dedup_cutoff := p_killed_at - make_interval(secs := GREATEST((v_respawn_ms - 60000) / 1000.0, 60));

  SELECT id INTO v_existing_id
  FROM mvp_kills
  WHERE group_id = p_group_id
    AND mvp_id = ANY(p_mvp_ids)
    AND killed_at >= v_dedup_cutoff
  ORDER BY killed_at DESC
  LIMIT 1
  FOR UPDATE;

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
  VALUES (p_group_id, p_mvp_ids[1], p_killed_at, p_tomb_x, p_tomb_y,
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

-- Function to expire unvalidated kills past respawn window
CREATE OR REPLACE FUNCTION expire_unvalidated_kills()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE mvp_kills k
  SET validation_status = 'expired_unvalidated'
  FROM mvps m
  WHERE k.mvp_id = m.id
    AND k.validation_status = 'pending'
    AND k.killed_at + make_interval(secs := m.respawn_ms / 1000.0) < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
