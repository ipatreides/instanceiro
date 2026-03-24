-- Update liga coins based on browiki.org/wiki/Liga_dos_Desbravadores (March 2026)
UPDATE instances SET liga_coins = 5 WHERE id = 21;   -- Covil de Vermes: 10→5
UPDATE instances SET liga_coins = 5 WHERE id = 23;   -- Fábrica do Terror: 20→5
UPDATE instances SET liga_coins = 20 WHERE id = 40;  -- Hospital Abandonado: 10→20
UPDATE instances SET liga_coins = 5 WHERE id = 8;    -- Salão de Ymir: 20→5
UPDATE instances SET liga_coins = 5 WHERE id = 33;   -- Glastheim Sombria: 20→5
UPDATE instances SET liga_tier = 'C', liga_coins = 10 WHERE id = 31; -- Wolfchev: B→C, 10 coins
UPDATE instances SET liga_coins = 20 WHERE id = 30;  -- Ninho de Nidhogg: 7→20
UPDATE instances SET liga_coins = 20 WHERE id = 42;  -- Sarah vs Fenrir: 10→20
UPDATE instances SET liga_coins = 7 WHERE id = 11;   -- Missão OS: 5→7
