-- RPC: get_schedule_summary
-- Returns participant counts and user participation for multiple schedules in one call
-- Replaces two separate queries (schedule_participants + schedule_placeholders)
CREATE OR REPLACE FUNCTION get_schedule_summary(p_schedule_ids UUID[])
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_user_id UUID := auth.uid();
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      s.id AS schedule_id,
      (SELECT count(*) FROM schedule_participants sp WHERE sp.schedule_id = s.id)::int AS participant_count,
      (SELECT count(*) FROM schedule_placeholders ph WHERE ph.schedule_id = s.id)::int AS placeholder_count,
      (
        s.created_by = v_user_id
        OR EXISTS (SELECT 1 FROM schedule_participants sp WHERE sp.schedule_id = s.id AND sp.user_id = v_user_id)
        OR EXISTS (SELECT 1 FROM schedule_placeholders ph WHERE ph.schedule_id = s.id AND ph.claimed_by = v_user_id)
      ) AS is_participant
    FROM unnest(p_schedule_ids) AS sid(id)
    JOIN instance_schedules s ON s.id = sid.id
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
