-- Add is_solo flag for instances that cannot be done in group
ALTER TABLE instances ADD COLUMN is_solo BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark solo-only instances
UPDATE instances SET is_solo = TRUE WHERE name IN (
  'Edda do Quarto Crescente',
  'Torneio de Magia',
  'Salão de Ymir',
  'Palácio das Mágoas',
  'Invasão ao Aeroplano'
);

-- Fix party_min for instances that require 2+ players
UPDATE instances SET party_min = 2 WHERE name IN (
  'Altar do Selo',
  'Ninho de Nidhogg'
);
