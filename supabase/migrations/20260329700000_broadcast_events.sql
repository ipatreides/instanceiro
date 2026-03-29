CREATE TABLE mvp_broadcast_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  cooldown_group TEXT NOT NULL,
  code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  mvp_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX idx_broadcast_events_lookup
  ON mvp_broadcast_events (group_id, cooldown_group, expires_at);

ALTER TABLE mvp_broadcast_events
  ADD CONSTRAINT uq_broadcast_group_cooldown UNIQUE (group_id, cooldown_group);
