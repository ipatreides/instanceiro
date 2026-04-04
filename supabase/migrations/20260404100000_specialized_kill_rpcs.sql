-- Refactor: Replace monolithic telemetry_register_kill with 3 specialized RPCs.
-- See docs/superpowers/specs/2026-04-04-rpc-refactoring-design.md

-- ============================================================
-- Helper: Find existing kill for an MVP (3-tier lookup)
-- ============================================================
CREATE OR REPLACE FUNCTION _find_kill_for_mvp(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_reference_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS UUID AS $$
DECLARE
  v_existing_id UUID;
  v_respawn_ms INT;
  v_delay_ms INT;
  v_dedup_cutoff TIMESTAMPTZ;
BEGIN
  SELECT respawn_ms, delay_ms INTO v_respawn_ms, v_delay_ms
  FROM mvps WHERE id = p_mvp_ids[1];
  v_respawn_ms := COALESCE(v_respawn_ms, 3540000);
  v_delay_ms := COALESCE(v_delay_ms, 600000);

  -- Tier 1: Sentinel kills (epoch 0 = time unknown from standalone tomb)
  SELECT id INTO v_existing_id
  FROM mvp_kills
  WHERE group_id = p_group_id
    AND mvp_id = ANY(p_mvp_ids)
    AND killed_at < '1970-01-02T00:00:00Z'::TIMESTAMPTZ
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Tier 2: Same tomb coordinates (same kill cycle)
  IF p_tomb_x IS NOT NULL AND p_tomb_y IS NOT NULL THEN
    v_dedup_cutoff := p_reference_time
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

    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Tier 3: Time window (respawn - 1min)
  v_dedup_cutoff := p_reference_time
    - make_interval(secs := GREATEST((v_respawn_ms - 60000) / 1000.0, 60));

  SELECT id INTO v_existing_id
  FROM mvp_kills
  WHERE group_id = p_group_id
    AND mvp_id = ANY(p_mvp_ids)
    AND killed_at >= v_dedup_cutoff
  ORDER BY killed_at DESC
  LIMIT 1
  FOR UPDATE;

  RETURN v_existing_id; -- NULL if not found
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- RPC 1: register_kill_from_event
-- Called by: mvp-event (Rustro saw MVP die)
-- ============================================================
CREATE OR REPLACE FUNCTION register_kill_from_event(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_killer_name TEXT DEFAULT NULL,
  p_killer_char_id UUID DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
  v_was_sentinel BOOLEAN := FALSE;
  v_map_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  SELECT map_name INTO v_map_name FROM mvps WHERE id = p_mvp_ids[1];

  v_existing_id := _find_kill_for_mvp(p_group_id, p_mvp_ids, p_tomb_x, p_tomb_y, p_killed_at);

  IF v_existing_id IS NOT NULL THEN
    -- Check if it was a sentinel
    SELECT killed_at < '1970-01-02'::TIMESTAMPTZ INTO v_was_sentinel
    FROM mvp_kills WHERE id = v_existing_id;

    UPDATE mvp_kills SET
      killer_name_raw = COALESCE(p_killer_name, killer_name_raw),
      killer_character_id = COALESCE(p_killer_char_id, killer_character_id),
      tomb_x = COALESCE(p_tomb_x, tomb_x),
      tomb_y = COALESCE(p_tomb_y, tomb_y),
      killed_at = p_killed_at,
      updated_at = NOW()
    WHERE id = v_existing_id;

    -- If was sentinel, populate witnesses now
    IF v_was_sentinel AND v_map_name IS NOT NULL THEN
      INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
      SELECT DISTINCT v_existing_id, mgm.character_id, ts.user_id, ts.current_map
      FROM telemetry_sessions ts
      JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
      WHERE ts.group_id = p_group_id
        AND ts.current_map = v_map_name
        AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
      ON CONFLICT (kill_id, user_id) DO NOTHING;
    END IF;

    DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
    DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
      SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
    ) AND group_id = p_group_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id, 'was_sentinel', v_was_sentinel, 'killed_at', p_killed_at);
  END IF;

  -- Create new kill
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    killer_character_id, killer_name_raw, registered_by, source, validation_status)
  VALUES (p_group_id, p_mvp_ids[1], p_killed_at, p_tomb_x, p_tomb_y,
    p_killer_char_id, p_killer_name, p_registered_by, 'telemetry', 'pending')
  RETURNING id INTO v_kill_id;

  -- Populate witnesses
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
  DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
    SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
  ) AND group_id = p_group_id;

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id, 'was_sentinel', FALSE, 'killed_at', p_killed_at);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- RPC 2: update_kill_from_tomb
-- Called by: mvp-tomb (Rustro saw tomb NPC, no kill time)
-- ============================================================
CREATE OR REPLACE FUNCTION update_kill_from_tomb(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_tomb_x INT,
  p_tomb_y INT,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  v_existing_id := _find_kill_for_mvp(p_group_id, p_mvp_ids, p_tomb_x, p_tomb_y, NOW());

  IF v_existing_id IS NOT NULL THEN
    -- Update tomb coords only, do NOT touch killed_at
    UPDATE mvp_kills SET
      tomb_x = p_tomb_x,
      tomb_y = p_tomb_y,
      updated_at = NOW()
    WHERE id = v_existing_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id, 'was_sentinel', FALSE, 'killed_at', NULL);
  END IF;

  -- No existing kill: create with sentinel (time unknown)
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    registered_by, source, validation_status)
  VALUES (p_group_id, p_mvp_ids[1], '1970-01-01T00:00:00Z'::TIMESTAMPTZ, p_tomb_x, p_tomb_y,
    p_registered_by, 'telemetry', 'pending')
  RETURNING id INTO v_kill_id;

  -- Clean sightings (tomb proves MVP is dead)
  DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
  -- Do NOT clean broadcasts (no confirmed kill yet)

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id, 'was_sentinel', TRUE, 'killed_at', '1970-01-01T00:00:00Z');
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- RPC 3: update_kill_from_killer
-- Called by: mvp-killer (Rustro clicked tomb, has BRT hour:minute + killer)
-- ============================================================
CREATE OR REPLACE FUNCTION update_kill_from_killer(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,
  p_killer_name TEXT,
  p_killer_char_id UUID DEFAULT NULL,
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
  v_was_sentinel BOOLEAN := FALSE;
  v_map_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  SELECT map_name INTO v_map_name FROM mvps WHERE id = p_mvp_ids[1];

  v_existing_id := _find_kill_for_mvp(p_group_id, p_mvp_ids, p_tomb_x, p_tomb_y, p_killed_at);

  IF v_existing_id IS NOT NULL THEN
    SELECT killed_at < '1970-01-02'::TIMESTAMPTZ INTO v_was_sentinel
    FROM mvp_kills WHERE id = v_existing_id;

    UPDATE mvp_kills SET
      killer_name_raw = p_killer_name,
      killer_character_id = COALESCE(p_killer_char_id, killer_character_id),
      tomb_x = COALESCE(p_tomb_x, tomb_x),
      tomb_y = COALESCE(p_tomb_y, tomb_y),
      killed_at = p_killed_at,
      updated_at = NOW()
    WHERE id = v_existing_id;

    -- If was sentinel, now we have real time — populate witnesses
    IF v_was_sentinel AND v_map_name IS NOT NULL THEN
      INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
      SELECT DISTINCT v_existing_id, mgm.character_id, ts.user_id, ts.current_map
      FROM telemetry_sessions ts
      JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
      WHERE ts.group_id = p_group_id
        AND ts.current_map = v_map_name
        AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
      ON CONFLICT (kill_id, user_id) DO NOTHING;
    END IF;

    DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
    DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
      SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
    ) AND group_id = p_group_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id, 'was_sentinel', v_was_sentinel, 'killed_at', p_killed_at);
  END IF;

  -- No existing kill: create new with real time
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    killer_character_id, killer_name_raw, registered_by, source, validation_status)
  VALUES (p_group_id, p_mvp_ids[1], p_killed_at, p_tomb_x, p_tomb_y,
    p_killer_char_id, p_killer_name, p_registered_by, 'telemetry', 'pending')
  RETURNING id INTO v_kill_id;

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
  DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
    SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
  ) AND group_id = p_group_id;

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id, 'was_sentinel', FALSE, 'killed_at', p_killed_at);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- Drop the old monolithic function
-- ============================================================
DROP FUNCTION IF EXISTS telemetry_register_kill(UUID, INT[], TIMESTAMPTZ, INT, INT, UUID, TEXT, UUID, TEXT, UUID, BOOLEAN);
