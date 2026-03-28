-- ============================================================
-- Items reference table for item_id → name resolution
-- ============================================================

CREATE TABLE items (
  item_id INT PRIMARY KEY,
  name_pt TEXT NOT NULL
);

-- Seed with MVP-relevant items (from Divine Pride bRO data)
-- This covers all known MVP drops + common valuable items
INSERT INTO items (item_id, name_pt) VALUES
  (604, 'Fruta de Yggdrasil'),
  (607, 'Baga de Yggdrasil'),
  (608, 'Semente de Yggdrasil'),
  (616, 'Album de Carta Antigo'),
  (617, 'Album de Carta Antigo'),
  (7444, 'Album de Carta Antigo'),
  (12103, 'Caixa de Velocidade'),
  (12016, 'Caixa de Velocidade Aprimorada'),
  (4134, 'Carta Baphomet'),
  (4142, 'Carta Doppelganger'),
  (4148, 'Carta Mistress'),
  (4147, 'Carta Maya'),
  (4131, 'Carta Osiris'),
  (4143, 'Carta Pharaoh'),
  (4146, 'Carta Moonlight Flower'),
  (4137, 'Carta Eddga'),
  (4153, 'Carta Golden Thief Bug'),
  (4135, 'Carta Drake'),
  (4168, 'Carta Orc Hero'),
  (4144, 'Carta Phreeoni'),
  (4154, 'Carta Orc Lord'),
  (4133, 'Carta Dark Lord'),
  (4305, 'Carta Tao Gunka'),
  (4357, 'Carta Detardeurus'),
  (4359, 'Carta Ktullanux'),
  (4361, 'Carta Thanatos'),
  (4363, 'Carta Lady Tanee'),
  (4365, 'Carta Ifrit'),
  (4367, 'Carta Beelzebub'),
  (4372, 'Carta Fallen Bishop'),
  (4374, 'Carta Bacsojin'),
  (4376, 'Carta Vesper'),
  (4386, 'Carta RSX-0806'),
  (4399, 'Carta Valkyrie Randgris'),
  (4302, 'Carta Turtle General'),
  (4318, 'Carta Lord of the Dead'),
  (4169, 'Carta Dracula'),
  (4330, 'Carta Evil Snake Lord'),
  (4352, 'Carta Amon Ra')
ON CONFLICT (item_id) DO NOTHING;
