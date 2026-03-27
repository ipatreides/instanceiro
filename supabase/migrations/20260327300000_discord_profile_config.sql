-- Add bot config columns to discord_notifications
ALTER TABLE discord_notifications
  ADD COLUMN IF NOT EXISTS bot_guild_id TEXT,
  ADD COLUMN IF NOT EXISTS bot_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS alert_minutes INT DEFAULT 5 CHECK (alert_minutes IN (5, 10, 15));

-- Update alert trigger to read from owner's profile instead of mvp_groups
CREATE OR REPLACE FUNCTION queue_mvp_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_config RECORD;
  v_mvp RECORD;
  v_spawn_at TIMESTAMPTZ;
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT created_by INTO v_owner_id FROM mvp_groups WHERE id = NEW.group_id;
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT bot_channel_id, alert_minutes INTO v_config
  FROM discord_notifications WHERE user_id = v_owner_id;

  IF v_config.bot_channel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT respawn_ms INTO v_mvp FROM mvps WHERE id = NEW.mvp_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_spawn_at := NEW.killed_at + (v_mvp.respawn_ms || ' milliseconds')::interval;

  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at - (v_config.alert_minutes || ' minutes')::interval, 'pre_spawn');

  INSERT INTO mvp_alert_queue (group_id, mvp_kill_id, alert_at, alert_type)
  VALUES (NEW.group_id, NEW.id, v_spawn_at, 'spawn');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
