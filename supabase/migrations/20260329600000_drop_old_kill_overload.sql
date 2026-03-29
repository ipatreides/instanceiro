-- Drop the old 10-param overload that was shadowing calls from mvp-kill
-- The old version still had the 5-minute dedup window and no advisory lock
DROP FUNCTION IF EXISTS telemetry_register_kill(
  UUID, INT[], TIMESTAMPTZ, INT, INT, UUID, TEXT, UUID, TEXT, UUID
);
