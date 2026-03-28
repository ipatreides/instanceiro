-- Separate table for pairing requests (no FK to auth.users needed)
-- The telemetry_tokens row is only created after the user confirms pairing.
CREATE TABLE IF NOT EXISTS telemetry_pairing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_code TEXT NOT NULL UNIQUE,
  callback_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
