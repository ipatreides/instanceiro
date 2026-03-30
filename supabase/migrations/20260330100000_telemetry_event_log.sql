CREATE TABLE telemetry_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint TEXT NOT NULL,
  token_id UUID REFERENCES telemetry_tokens(id) ON DELETE SET NULL,
  character_id UUID,
  payload_summary JSONB,
  result TEXT NOT NULL,
  reason TEXT,
  kill_id UUID REFERENCES mvp_kills(id) ON DELETE SET NULL
);

CREATE INDEX idx_tel_event_log_timestamp ON telemetry_event_log(timestamp DESC);
CREATE INDEX idx_tel_event_log_token ON telemetry_event_log(token_id);
CREATE INDEX idx_tel_event_log_result ON telemetry_event_log(result);

-- Retention cleanup function (called from cron endpoint)
CREATE OR REPLACE FUNCTION cleanup_telemetry_event_log()
RETURNS void AS $$
BEGIN
  DELETE FROM telemetry_event_log WHERE timestamp < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
