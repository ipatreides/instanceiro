-- Add telemetry_sessions to realtime publication for live instance tracking
ALTER PUBLICATION supabase_realtime ADD TABLE telemetry_sessions;
