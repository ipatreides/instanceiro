-- Add new columns to mvps table
ALTER TABLE mvps ADD COLUMN has_tomb BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mvps ADD COLUMN cooldown_group TEXT;
ALTER TABLE mvps ADD COLUMN linked_monster_id INTEGER;

-- ============================================================
-- Beelzebub (Fly Form) — abbey03, 720min respawn, 10min delay
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1873, 'Beelzebub', 'abbey03', 43200000, 600000, true, NULL, 1874),
  (2, 1873, 'Beelzebub', 'abbey03', 43200000, 600000, true, NULL, 1874);

-- Beelzebub (True Form)
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1874, 'Beelzebub (Verdadeiro)', 'abbey03', 43200000, 600000, true, NULL, 1873),
  (2, 1874, 'Beelzebub (Verdadeiro)', 'abbey03', 43200000, 600000, true, NULL, 1873);

-- ============================================================
-- Lord of the Dead — niflheim, 133min respawn, 10min delay, no tomb
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1373, 'Lord of the Dead', 'niflheim', 7980000, 600000, false, NULL, NULL),
  (2, 1373, 'Lord of the Dead', 'niflheim', 7980000, 600000, false, NULL, NULL);

-- ============================================================
-- Bio Lab 3 — lhz_dun03, 100min respawn, 30min delay, no tomb, shared cooldown
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1646, 'Lord Knight Seyren', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1647, 'Assassin Cross Eremes', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1648, 'Whitesmith Howard', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1649, 'High Priest Margaretha', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1650, 'Sniper Cecil', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1651, 'High Wizard Kathryne', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1646, 'Lord Knight Seyren', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1647, 'Assassin Cross Eremes', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1648, 'Whitesmith Howard', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1649, 'High Priest Margaretha', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1650, 'Sniper Cecil', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1651, 'High Wizard Kathryne', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL);

-- ============================================================
-- Bio Lab 5 — lhz_dun05, 120min respawn (2h fixed delay), 0 delay, no tomb, shared cooldown
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 3220, 'Guillotine Cross Eremes', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3221, 'Archbishop Margaretha', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3222, 'Ranger Cecil', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3223, 'Mechanic Howard', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3224, 'Warlock Kathryne', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3225, 'Rune Knight Seyren', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3240, 'Royal Guard Randel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3241, 'Genetic Flamel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3242, 'Sorcerer Celia', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3243, 'Sura Chen', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3244, 'Shadow Chaser Gertie', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3245, 'Minstrel Alphoccio', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3246, 'Wanderer Trentini', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3220, 'Guillotine Cross Eremes', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3221, 'Archbishop Margaretha', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3222, 'Ranger Cecil', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3223, 'Mechanic Howard', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3224, 'Warlock Kathryne', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3225, 'Rune Knight Seyren', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3240, 'Royal Guard Randel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3241, 'Genetic Flamel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3242, 'Sorcerer Celia', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3243, 'Sura Chen', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3244, 'Shadow Chaser Gertie', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3245, 'Minstrel Alphoccio', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3246, 'Wanderer Trentini', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL);

-- ============================================================
-- Map metadata for new maps
-- ============================================================
INSERT INTO mvp_map_meta (map_name, width, height)
VALUES
  ('niflheim', 253, 252),
  ('lhz_dun03', 200, 200),
  ('lhz_dun05', 200, 200)
ON CONFLICT (map_name) DO NOTHING;

-- abbey03 should already exist from seed; ensure it's there
INSERT INTO mvp_map_meta (map_name, width, height)
VALUES ('abbey03', 240, 240)
ON CONFLICT (map_name) DO NOTHING;
