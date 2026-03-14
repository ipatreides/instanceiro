INSERT INTO instances (id, name, level_required, party_min, cooldown_type, cooldown_hours, available_day, difficulty, reward, mutual_exclusion_group)
VALUES
  -- Hourly
  (1,  'Altar do Selo',              75,  2, 'hourly', 12, NULL, NULL,       'Chifres Místicos de Bafomé', NULL),
  (2,  'Caverna do Polvo',           90,  1, 'hourly', 3,  NULL, NULL,       'Caixa das Melhores Armas',   NULL),
  (3,  'Esgotos de Malangdo',        90,  1, 'hourly', 1,  NULL, NULL,       'Ira do Deus do Mar',         NULL),
  (4,  'Espaço Infinito',           100,  1, 'hourly', 3,  NULL, NULL,       'Pó Espacial',                NULL),

  -- Daily
  (5,  'Edda do Quarto Crescente',   80,  1, 'daily', NULL, NULL, 'Easy',      'Fragmento de Sonho',          NULL),
  (6,  'Torneio de Magia',           90,  1, 'daily', NULL, NULL, 'Easy',      'Moeda Mágica de Geffen',      NULL),
  (7,  'Memórias de Sarah',          99,  1, 'daily', NULL, NULL, 'Easy',      'EXP',                         NULL),
  (8,  'Salão de Ymir',             100,  1, 'daily', NULL, NULL, 'Medium',    'Marca de Honra',              NULL),
  (9,  'Base Militar',              100,  1, 'daily', NULL, NULL, 'Medium',    'Brasão de Honra',             NULL),
  (10, 'Laboratório Werner',        100,  1, 'daily', NULL, NULL, 'Medium',    'Brasão de Honra',             NULL),
  (11, 'Missão OS',                 110,  1, 'daily', NULL, NULL, 'Medium',    'Chip Misterioso',             NULL),
  (12, 'Memorial COR',              110,  1, 'daily', NULL, NULL, 'Medium',    'Núcleo COR',                  NULL),
  (13, 'Palácio das Mágoas',        120,  1, 'daily', NULL, NULL, 'Easy',      'Fragmento de Cinzas',         NULL),
  (14, 'Sonho Sombrio',             120,  1, 'daily', NULL, NULL, 'Medium',    'Dente de Jitterbug',          NULL),
  (15, 'Invasão ao Aeroplano',      125,  1, 'daily', NULL, NULL, 'Easy',      'EXP',                         NULL),
  (16, 'Aos Pés do Rei',            130,  1, 'daily', NULL, NULL, 'Medium',    'Carta Dourada',               NULL),
  (17, 'Torre do Demônio',          130,  1, 'daily', NULL, NULL, 'Medium',    'EXP',                         NULL),
  (18, 'Caverna de Buwaya',         130,  1, 'daily', NULL, NULL, 'Difficult', 'Tatuagem de Buwaya',          NULL),
  (19, 'Maldição de Glastheim',     130,  1, 'daily', NULL, NULL, 'Medium',    'Mana Coagulada',              NULL),
  (20, 'Ruína de Glastheim',        130,  1, 'daily', NULL, NULL, 'Medium',    'Cristal Corrompido',          NULL),
  (21, 'Covil de Vermes',           140,  1, 'daily', NULL, NULL, 'Difficult', 'Pele da Rainha Verme',        NULL),
  (22, 'Laboratório Central',       140,  1, 'daily', NULL, NULL, 'Difficult', 'Batalha contra MVPs',         NULL),
  (23, 'Fábrica do Terror',         140,  1, 'daily', NULL, NULL, 'Medium',    'Moeda Sangrenta',             NULL),
  (24, 'Queda de Glastheim (Normal)', 140, 1, 'daily', NULL, NULL, 'Medium',  'Gema Corrompida',             'glastheim_queda'),
  (25, 'Sala Final',                150,  1, 'daily', NULL, NULL, 'Medium',    'Peça Intacta',                NULL),
  (26, 'Ilha Bios',                 160,  1, 'daily', NULL, NULL, 'Medium',    'Marca do Herói',              NULL),
  (27, 'Caverna de Mors',           160,  1, 'daily', NULL, NULL, 'Medium',    'Prêmio do Herói',             NULL),
  (28, 'Templo do Demônio Rei',     160,  1, 'daily', NULL, NULL, 'Difficult', 'Prêmio de Esquadrão',         NULL),
  (29, 'Edda do Biolaboratório',    170,  1, 'daily', NULL, NULL, 'Difficult', 'Fragmento de Experimento',    NULL),

  -- 3-Day
  (30, 'Ninho de Nidhogg',           70,  1, 'three_day', NULL, NULL, 'Medium',    'EXP',                    NULL),
  (31, 'Laboratório de Wolfchev',    90,  1, 'three_day', NULL, NULL, 'Difficult', 'Batalha contra MVPs',    NULL),
  (32, 'Fortaleza Voadora',         145,  1, 'three_day', NULL, NULL, 'Medium',    'Armas Sobrenaturais',    NULL),
  (33, 'Glastheim Sombria',         160,  1, 'three_day', NULL, NULL, 'Difficult', 'Mana Sombria',           NULL),
  (34, 'Queda de Glastheim (Difícil)', 170, 1, 'three_day', NULL, NULL, 'Difficult', 'Gema Corrompida',     'glastheim_queda'),

  -- Weekly
  (35, 'Torre sem Fim',               50, 1, 'weekly', NULL, NULL,       NULL,       'Batalha contra MVPs',      NULL),
  (36, 'Cripta',                       60, 1, 'weekly', NULL, 'weekend',  NULL,       'Embalagem de Poções',      NULL),
  (37, 'Glastheim Infantil',           65, 1, 'weekly', NULL, 'thursday', NULL,       'Mana Coagulada',           NULL),
  (38, 'Fábrica Infantil',             70, 1, 'weekly', NULL, 'thursday', NULL,       'Moeda Sangrenta',          NULL),
  (39, 'Túmulo do Monarca',            99, 1, 'weekly', NULL, 'friday',   NULL,       'Pedra Bruta',              NULL),
  (40, 'Hospital Abandonado',         100, 1, 'weekly', NULL, NULL,       NULL,       'Tatuagem de Bangungot',    NULL),
  (41, 'Lago de Bakonawa',            140, 1, 'weekly', NULL, NULL,       NULL,       'Tatuagem de Bakonawa',     NULL),
  (42, 'Sarah vs Fenrir',             145, 1, 'weekly', NULL, NULL,       NULL,       'Fragmento de Gigantes',    NULL)
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
