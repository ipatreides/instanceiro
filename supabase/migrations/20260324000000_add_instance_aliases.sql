-- Add aliases column to instances table
ALTER TABLE instances ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT NULL;

-- Set aliases
UPDATE instances SET aliases = ARRAY['baphomet'] WHERE id = 1;
UPDATE instances SET aliases = ARRAY['celancanto'] WHERE id = 3;
UPDATE instances SET aliases = ARRAY['phreeoni', 'espacial'] WHERE id = 4;
UPDATE instances SET aliases = ARRAY['fenrir'] WHERE id = 6;
UPDATE instances SET aliases = ARRAY['bijou'] WHERE id = 8;
UPDATE instances SET aliases = ARRAY['malicia'] WHERE id = 9;
UPDATE instances SET aliases = ARRAY['fofinho'] WHERE id = 10;
UPDATE instances SET aliases = ARRAY['tigrinho', 'miguel'] WHERE id = 11;
UPDATE instances SET aliases = ARRAY['panela de pressao'] WHERE id = 12;
UPDATE instances SET aliases = ARRAY['piano', 'pesadelo musical'] WHERE id = 14;
UPDATE instances SET aliases = ARRAY['charleston'] WHERE id = 16;
UPDATE instances SET aliases = ARRAY['ogh'] WHERE id = 19;
UPDATE instances SET aliases = ARRAY['rainha verme'] WHERE id = 21;
UPDATE instances SET aliases = ARRAY['labzin'] WHERE id = 22;
UPDATE instances SET aliases = ARRAY['celine kimi'] WHERE id = 23;
UPDATE instances SET aliases = ARRAY['edda de glastheim'] WHERE id = 24;
UPDATE instances SET aliases = ARRAY['caidos'] WHERE id = 26;
UPDATE instances SET aliases = ARRAY['necromante'] WHERE id = 27;
UPDATE instances SET aliases = ARRAY['jack wolf'] WHERE id = 32;
UPDATE instances SET aliases = ARRAY['ogh sombria'] WHERE id = 33;
UPDATE instances SET aliases = ARRAY['edda de glastheim'] WHERE id = 34;
UPDATE instances SET aliases = ARRAY['sarinha'] WHERE id = 42;
