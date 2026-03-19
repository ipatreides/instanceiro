-- Add Liga dos Desbravadores fields
ALTER TABLE instances ADD COLUMN liga_tier TEXT CHECK (liga_tier IN ('A', 'B', 'C'));
ALTER TABLE instances ADD COLUMN liga_coins INTEGER;

-- Insert new instances not in original seed
INSERT INTO instances (id, name, level_required, party_min, cooldown_type, cooldown_hours, available_day, difficulty, reward, mutual_exclusion_group)
VALUES
  (43, 'Batalha dos Orcs', 60, 1, 'daily', NULL, NULL, NULL, 'Orc''s Ring + Encantamentos', NULL),
  (44, 'Vila dos Porings', 30, 1, 'daily', NULL, NULL, NULL, 'Baú Poring + Encantamentos', NULL)
ON CONFLICT (id) DO NOTHING;

-- Tier A (10 instances)
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Batalha dos Orcs';
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Torneio de Magia';
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Memórias de Sarah';
UPDATE instances SET liga_tier = 'A', liga_coins = 5  WHERE name = 'Palácio das Mágoas';
UPDATE instances SET liga_tier = 'A', liga_coins = 20 WHERE name = 'Salão de Ymir';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Covil de Vermes';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Hospital Abandonado';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Aos Pés do Rei';
UPDATE instances SET liga_tier = 'A', liga_coins = 20 WHERE name = 'Fábrica do Terror';
UPDATE instances SET liga_tier = 'A', liga_coins = 10 WHERE name = 'Sonho Sombrio';

-- Tier B (11 instances)
UPDATE instances SET liga_tier = 'B', liga_coins = 7  WHERE name = 'Sala Final';
UPDATE instances SET liga_tier = 'B', liga_coins = 7  WHERE name = 'Ninho de Nidhogg';
UPDATE instances SET liga_tier = 'B', liga_coins = 20 WHERE name = 'Lago de Bakonawa';
UPDATE instances SET liga_tier = 'B', liga_coins = 5  WHERE name = 'Caverna de Buwaya';
UPDATE instances SET liga_tier = 'B', liga_coins = 20 WHERE name = 'Glastheim Sombria';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Sarah vs Fenrir';
UPDATE instances SET liga_tier = 'B', liga_coins = 5  WHERE name = 'Torre do Demônio';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Ilha Bios';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Templo do Demônio Rei';
UPDATE instances SET liga_tier = 'B', liga_coins = 5  WHERE name = 'Laboratório Werner';
UPDATE instances SET liga_tier = 'B', liga_coins = 10 WHERE name = 'Laboratório de Wolfchev';

-- Tier C (9 instances)
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Vila dos Porings';
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Caverna do Polvo';
UPDATE instances SET liga_tier = 'C', liga_coins = 10 WHERE name = 'Edda do Quarto Crescente';
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Missão OS';
UPDATE instances SET liga_tier = 'C', liga_coins = 5  WHERE name = 'Maldição de Glastheim';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Base Militar';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Memorial COR';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Fortaleza Voadora';
UPDATE instances SET liga_tier = 'C', liga_coins = 7  WHERE name = 'Caverna de Mors';

-- Expected: 30 instances with liga data (2 new + 28 existing updated)
