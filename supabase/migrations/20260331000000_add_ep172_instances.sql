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
