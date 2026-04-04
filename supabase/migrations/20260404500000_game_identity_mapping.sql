-- Game Identity Mapping: link game char_id/account_id to Instanceiro characters/accounts

-- Add game IDs to existing tables
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS game_account_id INT UNIQUE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS game_char_id INT UNIQUE;

-- Unresolved game characters (pending manual resolution)
CREATE TABLE IF NOT EXISTS unresolved_game_characters (
  game_char_id    INT PRIMARY KEY,
  game_account_id INT,
  char_name       TEXT NOT NULL,
  char_level      INT,
  char_class      TEXT,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unresolved_game_chars_user ON unresolved_game_characters(user_id);

ALTER TABLE unresolved_game_characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unresolved_select_own" ON unresolved_game_characters FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "unresolved_delete_own" ON unresolved_game_characters FOR DELETE USING (user_id = auth.uid());
