-- Fix: tomb coordinates can vary by ±2 tiles between cycles.
-- Exact match caused dedup failure and duplicate kills.
-- Change to fuzzy match (±3 tiles) in _find_kill_for_mvp Tier 2.

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

  -- Tier 2: Similar tomb coordinates (±3 tiles, same kill cycle)
  IF p_tomb_x IS NOT NULL AND p_tomb_y IS NOT NULL THEN
    v_dedup_cutoff := p_reference_time
      - make_interval(secs := (v_respawn_ms + v_delay_ms + 600000) / 1000.0);

    SELECT id INTO v_existing_id
    FROM mvp_kills
    WHERE group_id = p_group_id
      AND mvp_id = ANY(p_mvp_ids)
      AND killed_at >= v_dedup_cutoff
      AND tomb_x IS NOT NULL
      AND ABS(tomb_x - p_tomb_x) <= 3
      AND ABS(tomb_y - p_tomb_y) <= 3
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

  RETURN v_existing_id;
END;
$$ LANGUAGE plpgsql;
