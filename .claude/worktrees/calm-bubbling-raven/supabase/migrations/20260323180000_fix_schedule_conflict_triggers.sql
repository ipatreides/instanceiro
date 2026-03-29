-- Fix: unnest the array returned by get_scheduled_character_ids

CREATE OR REPLACE FUNCTION check_schedule_creator_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.character_id = ANY(get_scheduled_character_ids(NEW.instance_id)) THEN
    RAISE EXCEPTION 'Character % is already in an open schedule for instance %', NEW.character_id, NEW.instance_id;
  END IF;
  RETURN NEW;
END;
$$;

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

  IF v_instance_id IS NOT NULL AND NEW.character_id = ANY(get_scheduled_character_ids(v_instance_id)) THEN
    RAISE EXCEPTION 'Character % is already in an open schedule for instance %', NEW.character_id, v_instance_id;
  END IF;
  RETURN NEW;
END;
$$;
