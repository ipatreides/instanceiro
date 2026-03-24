-- calendar_connections table
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

-- Auto-update updated_at
CREATE TRIGGER calendar_connections_updated_at
  BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_discord_notifications_updated_at();

-- RLS
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar connections" ON calendar_connections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own calendar connections" ON calendar_connections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendar connections" ON calendar_connections
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own calendar connections" ON calendar_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- schedule_calendar_events table
CREATE TABLE schedule_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  external_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, user_id, provider)
);

ALTER TABLE schedule_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar events" ON schedule_calendar_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendar events" ON schedule_calendar_events
  FOR DELETE USING (auth.uid() = user_id);

-- Index for sync lookups
CREATE INDEX idx_schedule_calendar_events_schedule
  ON schedule_calendar_events (schedule_id);
CREATE INDEX idx_calendar_connections_user_enabled
  ON calendar_connections (user_id, enabled) WHERE enabled = true;
