-- Prevent the same character from being in multiple open schedules for the same instance.
-- This covers both creators (via instance_schedules.character_id) and participants (via schedule_participants).

-- Trigger function: before INSERT on instance_schedules, check creator isn't already scheduled
CREATE OR REPLACE FUNCTION check_schedule_creator_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM get_scheduled_character_ids(NEW.instance_id) AS cid
    WHERE cid = NEW.character_id
  ) THEN
    RAISE EXCEPTION 'Character % is already in an open schedule for instance %', NEW.character_id, NEW.instance_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_schedule_creator_conflict
  BEFORE INSERT ON instance_schedules
  FOR EACH ROW EXECUTE FUNCTION check_schedule_creator_conflict();

-- Trigger function: before INSERT on schedule_participants, check participant isn't already scheduled
CREATE OR REPLACE FUNCTION check_schedule_participant_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_instance_id int;
BEGIN
  SELECT instance_id INTO v_instance_id
  FROM instance_schedules
  WHERE id = NEW.schedule_id AND status = 'open';

  IF v_instance_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM get_scheduled_character_ids(v_instance_id) AS cid
    WHERE cid = NEW.character_id
  ) THEN
    RAISE EXCEPTION 'Character % is already in an open schedule for instance %', NEW.character_id, v_instance_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_schedule_participant_conflict
  BEFORE INSERT ON schedule_participants
  FOR EACH ROW EXECUTE FUNCTION check_schedule_participant_conflict();
