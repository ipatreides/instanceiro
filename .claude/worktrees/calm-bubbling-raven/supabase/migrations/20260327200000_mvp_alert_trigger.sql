-- ============================================================
-- MVP Alert Queue: trigger + pg_cron
-- ============================================================

-- Trigger function: on mvp_kills INSERT, calculate alert times and queue them
CREATE OR REPLACE FUNCTION queue_mvp_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_group RECORD;
  v_mvp RECORD;
  v_spawn_at TIMESTAMPTZ;
BEGIN
  -- Only queue alerts for group kills with a configured discord channel
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT alert_minutes, discord_channel_id INTO v_group
  FROM mvp_groups WHERE id = NEW.group_id;

  IF v_group.discord_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get MVP respawn time
  SELECT respawn_ms INTO v_mvp FROM mvps WHERE id = NEW.mvp_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_spawn_at := NEW.killed_at + (v_mvp.respawn_ms || ' milliseconds')::interval;

  -- Queue pre-spawn alert (X minutes before)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at - (v_group.alert_minutes || ' minutes')::interval, 'pre_spawn');

  -- Queue spawn alert (at spawn time)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at, 'spawn');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to mvp_kills
DROP TRIGGER IF EXISTS trg_queue_mvp_alerts ON mvp_kills;
CREATE TRIGGER trg_queue_mvp_alerts
  AFTER INSERT ON mvp_kills
  FOR EACH ROW
  EXECUTE FUNCTION queue_mvp_alerts();
