-- Add resolved instance FK to telemetry_sessions
ALTER TABLE telemetry_sessions
  ADD COLUMN current_instance_id INTEGER REFERENCES instances(id);

-- Add telemetry traceability to instance_completions
ALTER TABLE instance_completions
  ADD COLUMN telemetry_session_id UUID REFERENCES telemetry_sessions(id),
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

-- Static mapping: packet name (EN) → instance ID
CREATE TABLE instance_name_mappings (
  id SERIAL PRIMARY KEY,
  packet_name TEXT UNIQUE NOT NULL,
  instance_id INTEGER NOT NULL REFERENCES instances(id)
);

CREATE INDEX idx_instance_name_mappings_packet ON instance_name_mappings(packet_name);

-- Seed confirmed + high-confidence mappings
INSERT INTO instance_name_mappings (packet_name, instance_id) VALUES
  ('Glastheim Purification (Normal)', 24),
  ('Sealed Catacomb', 1),
  ('Octopus Cave', 2),
  ('Culvert', 3),
  ('Infinite Space', 4),
  ('Half Moon In The Daylight', 5),
  ('Geffen Magic Tournament', 6),
  ('Sara''s Memories', 7),
  ('Room of Consciousness', 8),
  ('Heart Hunter War Base 2', 9),
  ('Werner Laboratory', 10),
  ('2nd OS Search', 11),
  ('Charleston Crisis', 12),
  ('Ghost Palace', 13),
  ('Nightmarish Jitterbug', 14),
  ('Assault on the Airship', 15),
  ('Devil''s Tower', 17),
  ('Buwaya Cave', 18),
  ('Old Glast Heim', 19),
  ('Faceworm''s Nest', 21),
  ('Central Laboratory', 22),
  ('Horror Toy Factory', 23),
  ('Last room', 25),
  ('Isle of Bios', 26),
  ('Morse''s Cave', 27),
  ('Temple of the Demon God', 28),
  ('EDDA Somatology Laboratory', 29),
  ('Nidhoggur''s Nest', 30),
  ('Wolfchev''s Laboratory', 31),
  ('Sky Fortress Invasion', 32),
  ('Glastheim Purification (Hard)', 34),
  ('Endless Tower', 35),
  ('Weekend', 36),
  ('Old Glast Heim (Beginner)', 37),
  ('Friday', 39),
  ('Bangungot Hospital 2F', 40),
  ('Bakonawa Lake', 41),
  ('Fenrir and Sarah', 42)
ON CONFLICT (packet_name) DO NOTHING;
