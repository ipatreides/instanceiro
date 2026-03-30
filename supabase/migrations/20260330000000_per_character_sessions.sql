-- Per-character telemetry sessions
-- Previously: one session per token (character_id always 0)
-- Now: one session per token per game-level character_id

-- Drop old unique constraint
ALTER TABLE telemetry_sessions DROP CONSTRAINT IF EXISTS telemetry_sessions_token_id_character_id_key;

-- Recreate constraint (same columns, just making sure it exists)
ALTER TABLE telemetry_sessions ADD CONSTRAINT telemetry_sessions_token_character_key UNIQUE (token_id, character_id);

-- Add columns for character name and instance tracking
ALTER TABLE telemetry_sessions ADD COLUMN IF NOT EXISTS character_name TEXT;
ALTER TABLE telemetry_sessions ADD COLUMN IF NOT EXISTS in_instance BOOLEAN DEFAULT false;
ALTER TABLE telemetry_sessions ADD COLUMN IF NOT EXISTS instance_name TEXT;
