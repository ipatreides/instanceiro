-- Fix: get_group_active_kills LEFT JOINs on characters table, but RLS
-- restricts characters to "own user only". This makes killer_name and
-- registered_by_name null for other users' characters.
-- Set SECURITY DEFINER so the RPC bypasses RLS for the JOIN resolution.

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
    ORDER BY k.mvp_id,
      CASE WHEN k.killed_at <= '1970-01-02'::timestamptz THEN 0 ELSE 1 END DESC,
      k.killed_at DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
