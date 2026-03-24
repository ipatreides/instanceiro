-- discord_notifications table
CREATE TABLE discord_notifications (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_discord_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discord_notifications_updated_at
  BEFORE UPDATE ON discord_notifications
  FOR EACH ROW EXECUTE FUNCTION update_discord_notifications_updated_at();

-- RLS
ALTER TABLE discord_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON discord_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON discord_notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications" ON discord_notifications
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications" ON discord_notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- notification_log table (inserts via service role only, reads by user)
CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  instance_id INT NOT NULL REFERENCES instances(id),
  type TEXT NOT NULL CHECK (type IN ('warning', 'available')),
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log" ON notification_log
  FOR SELECT USING (auth.uid() = user_id);

-- Index for dedup lookups (includes type)
CREATE INDEX idx_notification_log_dedup
  ON notification_log (user_id, character_id, instance_id, type, notified_at DESC);
