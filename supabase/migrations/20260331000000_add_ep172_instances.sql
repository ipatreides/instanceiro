-- Add EP 17.2 instances + Labirinto da Neblina (EP 14.2)
-- Packet name mappings left empty — telemetry unknown_instance logs will reveal the correct names

INSERT INTO instances (id, name, level_required, party_min, cooldown_type, cooldown_hours, available_day, difficulty, reward, mutual_exclusion_group)
VALUES
  -- Hourly (EP 14.2)
  (45, 'Labirinto da Neblina',       99,  1, 'hourly', 2, NULL, NULL,     'Acesso a Aventuras na Vila', NULL),

  -- Daily (EP 17.2)
  (46, 'Ortus Aqua',                130,  1, 'daily', NULL, NULL, NULL,   'Vale Varmida',  NULL),
  (47, 'Jardim Secreto',            130,  1, 'daily', NULL, NULL, NULL,   'Vale Varmida',  NULL),
  (48, 'Fazenda de Pitayas',        130,  1, 'daily', NULL, NULL, NULL,   'Vale Varmida',  NULL),
  (49, 'Duelo com Sweety',          130,  1, 'daily', NULL, NULL, NULL,   'Vale Varmida',  NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  level_required = EXCLUDED.level_required,
  party_min = EXCLUDED.party_min,
  cooldown_type = EXCLUDED.cooldown_type,
  cooldown_hours = EXCLUDED.cooldown_hours,
  available_day = EXCLUDED.available_day,
  difficulty = EXCLUDED.difficulty,
  reward = EXCLUDED.reward,
  mutual_exclusion_group = EXCLUDED.mutual_exclusion_group;

-- Wiki links
UPDATE instances SET wiki_url = 'https://browiki.org/wiki/Labirinto_da_Neblina' WHERE id = 45;
UPDATE instances SET wiki_url = 'https://browiki.org/wiki/Ortus_Aqua' WHERE id = 46;
UPDATE instances SET wiki_url = 'https://browiki.org/wiki/Jardim_Secreto' WHERE id = 47;
UPDATE instances SET wiki_url = 'https://browiki.org/wiki/Fazenda_de_Pitayas' WHERE id = 48;
UPDATE instances SET wiki_url = 'https://browiki.org/wiki/Duelo_com_Sweety' WHERE id = 49;

-- Backfill character_instances for existing characters that meet level requirements
INSERT INTO character_instances (character_id, instance_id, is_active)
SELECT c.id, i.id, false
FROM characters c
CROSS JOIN instances i
WHERE i.id IN (45, 46, 47, 48, 49)
  AND c.level >= i.level_required
  AND (i.level_max IS NULL OR c.level <= i.level_max)
  AND NOT EXISTS (
    SELECT 1 FROM character_instances ci
    WHERE ci.character_id = c.id AND ci.instance_id = i.id
  );
