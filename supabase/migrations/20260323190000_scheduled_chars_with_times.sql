-- Returns character_ids with their scheduled_at for open schedules of a given instance
CREATE OR REPLACE FUNCTION get_scheduled_characters_with_times(p_instance_id int)
RETURNS TABLE(character_id uuid, scheduled_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- Creators
  SELECT s.character_id, s.scheduled_at
  FROM instance_schedules s
  WHERE s.instance_id = p_instance_id AND s.status = 'open'
  UNION
  -- Participants
  SELECT sp.character_id, s.scheduled_at
  FROM schedule_participants sp
  JOIN instance_schedules s ON s.id = sp.schedule_id
  WHERE s.instance_id = p_instance_id AND s.status = 'open';
$$;

-- Remove strict triggers (conflict check now done client-side with cooldown awareness)
DROP TRIGGER IF EXISTS trg_schedule_creator_conflict ON instance_schedules;
DROP TRIGGER IF EXISTS trg_schedule_participant_conflict ON schedule_participants;
DROP FUNCTION IF EXISTS check_schedule_creator_conflict();
DROP FUNCTION IF EXISTS check_schedule_participant_conflict();
