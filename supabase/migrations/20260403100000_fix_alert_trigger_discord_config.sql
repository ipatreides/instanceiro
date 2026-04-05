-- Fix: queue_mvp_alerts() was reading discord_channel_id and alert_minutes
-- from mvp_groups, but the config migrated to discord_notifications table.
-- Since mvp_groups.discord_channel_id is always NULL, alerts were never queued.

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

  -- Queue pre-spawn alert (X minutes before)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at - (COALESCE(v_discord.alert_minutes, 5) || ' minutes')::interval, 'pre_spawn');

  -- Queue spawn alert (at spawn time)
  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at, 'spawn');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
