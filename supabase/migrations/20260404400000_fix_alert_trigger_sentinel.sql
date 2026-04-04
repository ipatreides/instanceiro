-- Fix: queue_mvp_alerts() fires on sentinel kills (epoch 0),
-- scheduling alerts for 1970. Also no alerts queued when
-- killed_at is updated from sentinel to real time.
--
-- Changes:
-- 1. Skip sentinel kills (killed_at < 1970-01-02)
-- 2. On UPDATE of killed_at: delete old alerts, queue new ones
-- 3. Trigger on both INSERT and UPDATE

CREATE OR REPLACE FUNCTION queue_mvp_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_discord RECORD;
  v_mvp RECORD;
  v_spawn_at TIMESTAMPTZ;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip sentinel kills (time unknown)
  IF NEW.killed_at < '1970-01-02T00:00:00Z'::TIMESTAMPTZ THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: only re-queue if killed_at actually changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.killed_at = NEW.killed_at THEN
      RETURN NEW;  -- killed_at didn't change, no need to re-queue
    END IF;
    -- Delete old alerts for this kill
    DELETE FROM mvp_alert_queue WHERE mvp_kill_id = NEW.id;
  END IF;

  -- Get group owner
  SELECT created_by INTO v_owner_id FROM mvp_groups WHERE id = NEW.group_id;
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Read discord config from the correct table
  SELECT bot_channel_id, alert_minutes INTO v_discord
  FROM discord_notifications WHERE user_id = v_owner_id;

  IF v_discord.bot_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get MVP respawn time
  SELECT respawn_ms INTO v_mvp FROM mvps WHERE id = NEW.mvp_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_spawn_at := NEW.killed_at + (v_mvp.respawn_ms || ' milliseconds')::interval;

  -- Only queue if spawn is in the future
  IF v_spawn_at <= NOW() THEN
    RETURN NEW;
  END IF;

  -- Queue pre-spawn alert (X minutes before)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at - (COALESCE(v_discord.alert_minutes, 5) || ' minutes')::interval, 'pre_spawn');

  -- Queue spawn alert (at spawn time)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at, 'spawn');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger (INSERT only) and create new one (INSERT OR UPDATE)
DROP TRIGGER IF EXISTS trg_queue_mvp_alerts ON mvp_kills;

CREATE TRIGGER trg_queue_mvp_alerts
  AFTER INSERT OR UPDATE OF killed_at ON mvp_kills
  FOR EACH ROW
  EXECUTE FUNCTION queue_mvp_alerts();
