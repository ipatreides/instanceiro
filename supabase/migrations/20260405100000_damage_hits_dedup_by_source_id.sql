-- Fix dedup: use source_id (actor_id) instead of source_name
-- Two PIDs can see the same hit but resolve different names for the same actor_id.
-- The server_tick + source_id + damage uniquely identifies a hit.

-- Add source_id column
ALTER TABLE mvp_kill_damage_hits ADD COLUMN source_id bigint;

-- Drop old constraint and create new one
ALTER TABLE mvp_kill_damage_hits DROP CONSTRAINT mvp_kill_damage_hits_kill_id_source_name_server_tick_damage_key;
ALTER TABLE mvp_kill_damage_hits ADD CONSTRAINT mvp_kill_damage_hits_dedup UNIQUE (kill_id, source_id, server_tick, damage);

-- Clean up duplicates from current data (keep the one with resolved name, not actor_NNNNN)
DELETE FROM mvp_kill_damage_hits a
USING mvp_kill_damage_hits b
WHERE a.id > b.id
  AND a.kill_id = b.kill_id
  AND a.server_tick = b.server_tick
  AND a.damage = b.damage
  AND a.source_name != b.source_name;
