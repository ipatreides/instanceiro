-- ============================================================
-- Telemetry: tokens, sessions, and alterations to existing tables
-- ============================================================

-- Telemetry API tokens (one per sniffer instance)
CREATE TABLE telemetry_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  pairing_code TEXT,
  pairing_callback TEXT,
  pairing_expires_at TIMESTAMPTZ,
  exchange_code TEXT,
  exchange_expires_at TIMESTAMPTZ,
  temporary_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_telemetry_tokens_user ON telemetry_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_telemetry_tokens_pairing ON telemetry_tokens(pairing_code) WHERE pairing_code IS NOT NULL;
CREATE INDEX idx_telemetry_tokens_exchange ON telemetry_tokens(exchange_code) WHERE exchange_code IS NOT NULL;

-- Telemetry sessions (one per active character per token)
CREATE TABLE telemetry_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES telemetry_tokens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id INT NOT NULL,
  account_id INT NOT NULL,
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  current_map TEXT,
  config_version INT NOT NULL DEFAULT 1,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token_id, character_id)
);

CREATE INDEX idx_telemetry_sessions_group ON telemetry_sessions(group_id);
CREATE INDEX idx_telemetry_sessions_heartbeat ON telemetry_sessions(last_heartbeat);

-- Alter mvp_kills: add source tracking
ALTER TABLE mvp_kills
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN telemetry_session_id UUID REFERENCES telemetry_sessions(id) ON DELETE SET NULL,
  ADD COLUMN killer_name_raw TEXT;

-- Alter mvp_kill_loots: add source + acceptance tracking
ALTER TABLE mvp_kill_loots
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN accepted BOOLEAN;

-- No RLS on telemetry tables — accessed only via service role from API routes
-- (same pattern as mvp_alert_queue)
