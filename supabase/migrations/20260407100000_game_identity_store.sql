-- Game Identity Store: canonical lookup tables for game accounts & characters
-- Replaces ad-hoc account_name_cache + unresolved_game_characters with
-- two clean tables plus auto-backfill triggers for placeholder names.

-- ============================================================
-- 1. game_accounts
-- ============================================================
CREATE TABLE game_accounts (
  account_id          INT NOT NULL,
  server_id           INT NOT NULL REFERENCES servers(id),
  name                TEXT NOT NULL,
  last_active_char_id INT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, server_id)
);

-- ============================================================
-- 2. game_characters
-- ============================================================
CREATE TABLE game_characters (
  char_id      INT NOT NULL,
  server_id    INT NOT NULL REFERENCES servers(id),
  account_id   INT,
  name         TEXT NOT NULL,
  level        INT,
  class_id     INT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (char_id, server_id)
);
CREATE INDEX idx_game_characters_account ON game_characters(account_id, server_id);

-- ============================================================
-- 3. Backfill trigger: game_accounts → replace actor_NNNNN
-- ============================================================
CREATE OR REPLACE FUNCTION fn_backfill_account_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Only backfill when the name is NOT itself a placeholder
  IF NEW.name NOT LIKE 'actor_%' AND NEW.name NOT LIKE 'char_%' THEN
    UPDATE mvp_kills
       SET killer_name_raw = NEW.name
     WHERE killer_name_raw = 'actor_' || NEW.account_id;

    UPDATE mvp_kills
       SET first_hitter_name = NEW.name
     WHERE first_hitter_name = 'actor_' || NEW.account_id;

    UPDATE mvp_kill_damage_hits
       SET source_name = NEW.name
     WHERE source_name = 'actor_' || NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_backfill_account_name
  AFTER INSERT OR UPDATE ON game_accounts
  FOR EACH ROW
  EXECUTE FUNCTION fn_backfill_account_name();

-- ============================================================
-- 4. Backfill trigger: game_characters → replace char_NNNNN
-- ============================================================
CREATE OR REPLACE FUNCTION fn_backfill_char_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Only backfill when the name is NOT itself a placeholder
  IF NEW.name NOT LIKE 'actor_%' AND NEW.name NOT LIKE 'char_%' THEN
    UPDATE mvp_kills
       SET killer_name_raw = NEW.name
     WHERE killer_name_raw = 'char_' || NEW.char_id;

    UPDATE mvp_kills
       SET first_hitter_name = NEW.name
     WHERE first_hitter_name = 'char_' || NEW.char_id;

    UPDATE mvp_kill_damage_hits
       SET source_name = NEW.name
     WHERE source_name = 'char_' || NEW.char_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_backfill_char_name
  AFTER INSERT OR UPDATE ON game_characters
  FOR EACH ROW
  EXECUTE FUNCTION fn_backfill_char_name();

-- ============================================================
-- 5. Migrate data from old tables
-- ============================================================

-- 5a. account_name_cache → game_accounts (skip placeholders)
INSERT INTO game_accounts (account_id, server_id, name, updated_at)
SELECT account_id::int, server_id, name, updated_at
  FROM account_name_cache
 WHERE name NOT LIKE 'actor_%'
   AND name NOT LIKE 'char_%'
ON CONFLICT (account_id, server_id) DO UPDATE
   SET name = EXCLUDED.name,
       updated_at = EXCLUDED.updated_at;

-- 5b. unresolved_game_characters → game_characters (no server_id column → default 2 for bRO)
INSERT INTO game_characters (char_id, server_id, account_id, name, level, class_id, updated_at)
SELECT game_char_id,
       2,                                       -- bRO LATAM server_id
       game_account_id,
       char_name,
       char_level,
       NULLIF(char_class, '')::int,             -- TEXT → INT, empty string → NULL
       updated_at
  FROM unresolved_game_characters
ON CONFLICT (char_id, server_id) DO UPDATE
   SET account_id = EXCLUDED.account_id,
       name       = EXCLUDED.name,
       level      = EXCLUDED.level,
       class_id   = EXCLUDED.class_id,
       updated_at = EXCLUDED.updated_at;

-- 5c. characters table (rows with game_char_id) → game_characters
INSERT INTO game_characters (char_id, server_id, name, updated_at)
SELECT c.game_char_id,
       a.server_id,
       c.name,
       COALESCE(c.updated_at, now())
  FROM characters c
  JOIN accounts a ON c.account_id = a.id
 WHERE c.game_char_id IS NOT NULL
ON CONFLICT (char_id, server_id) DO UPDATE
   SET name       = EXCLUDED.name,
       updated_at = EXCLUDED.updated_at;

-- 5d. Backfill game_characters.account_id from accounts.game_account_id via characters join
UPDATE game_characters gc
   SET account_id = a.game_account_id
  FROM characters c
  JOIN accounts a ON c.account_id = a.id
 WHERE c.game_char_id = gc.char_id
   AND a.server_id = gc.server_id
   AND a.game_account_id IS NOT NULL
   AND gc.account_id IS DISTINCT FROM a.game_account_id;

-- 5e. accounts table (rows with game_account_id) → game_accounts
INSERT INTO game_accounts (account_id, server_id, name, updated_at)
SELECT a.game_account_id,
       a.server_id,
       a.name,
       a.created_at
  FROM accounts a
 WHERE a.game_account_id IS NOT NULL
ON CONFLICT (account_id, server_id) DO UPDATE
   SET updated_at = EXCLUDED.updated_at;

-- ============================================================
-- 6. Drop old tables
-- ============================================================
DROP TABLE account_name_cache;
DROP TABLE unresolved_game_characters;
