-- MVP sightings: live position tracking when a group member sees an MVP alive
CREATE TABLE IF NOT EXISTS mvp_sightings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mvp_id INT NOT NULL,
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  map_name TEXT NOT NULL,
  x INT NOT NULL,
  y INT NOT NULL,
  spotted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  telemetry_session_id UUID REFERENCES telemetry_sessions(id) ON DELETE SET NULL
);

CREATE INDEX idx_mvp_sightings_group_mvp ON mvp_sightings(group_id, mvp_id, spotted_at DESC);

-- Enable RLS with public read (needed for Supabase Realtime subscriptions)
ALTER TABLE mvp_sightings ENABLE ROW LEVEL SECURITY;
CREATE POLICY mvp_sightings_select ON mvp_sightings FOR SELECT USING (true);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE mvp_sightings;
