-- MVP Damage Hit Tracking
-- Stores individual damage hits per MVP kill for DPS analysis.
-- Dedup key: (kill_id, source_name, server_tick, damage) allows
-- multiple sniffers to contribute complementary data to same fight.

-- Add first_hitter_name to mvp_kills
ALTER TABLE mvp_kills ADD COLUMN IF NOT EXISTS first_hitter_name text;

-- Individual damage hits table
CREATE TABLE mvp_kill_damage_hits (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kill_id         uuid NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE,
    source_name     text NOT NULL,
    damage          integer NOT NULL,
    server_tick     bigint NOT NULL,
    elapsed_ms      integer NOT NULL,
    skill_id        smallint,
    reported_by     uuid REFERENCES telemetry_sessions(id),
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (kill_id, source_name, server_tick, damage)
);

CREATE INDEX idx_damage_hits_kill_id ON mvp_kill_damage_hits(kill_id);

-- RLS
ALTER TABLE mvp_kill_damage_hits ENABLE ROW LEVEL SECURITY;

-- Read: group members can view damage hits (via parent kill's group)
CREATE POLICY "damage_hits_group_read" ON mvp_kill_damage_hits FOR SELECT
USING (
    kill_id IN (
        SELECT k.id FROM mvp_kills k
        WHERE k.group_id IN (
            SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()
        )
        OR (k.group_id IS NULL AND k.registered_by IN (
            SELECT id FROM characters WHERE user_id = auth.uid()
        ))
    )
);
