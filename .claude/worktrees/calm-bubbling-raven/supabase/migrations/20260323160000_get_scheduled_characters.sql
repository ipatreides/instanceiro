-- Returns all character_ids that are in open schedules for a given instance
CREATE OR REPLACE FUNCTION get_scheduled_character_ids(p_instance_id int)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT character_id), '{}')
  FROM (
    -- Schedule creators
    SELECT character_id FROM instance_schedules
    WHERE instance_id = p_instance_id AND status = 'open'
    UNION
    -- Schedule participants
    SELECT sp.character_id FROM schedule_participants sp
    JOIN instance_schedules s ON s.id = sp.schedule_id
    WHERE s.instance_id = p_instance_id AND s.status = 'open'
  ) sub;
$$;
