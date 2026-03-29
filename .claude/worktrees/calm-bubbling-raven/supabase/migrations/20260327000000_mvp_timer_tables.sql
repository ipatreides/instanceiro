-- ============================================================
-- MVP Timer Tables
-- ============================================================

-- Static MVP data (one row per server+MVP+map combo)
CREATE TABLE mvps (
  id SERIAL PRIMARY KEY,
  server_id INT NOT NULL REFERENCES servers(id),
  monster_id INT NOT NULL,
  name TEXT NOT NULL,
  map_name TEXT NOT NULL,
  respawn_ms INT NOT NULL,
  delay_ms INT NOT NULL DEFAULT 600000,
  level INT,
  hp INT,
  UNIQUE(server_id, monster_id, map_name)
);

ALTER TABLE mvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvps_public_read" ON mvps FOR SELECT USING (true);

-- Map metadata (dimensions for coordinate conversion)
CREATE TABLE mvp_map_meta (
  map_name TEXT PRIMARY KEY,
  width INT NOT NULL,
  height INT NOT NULL
);

ALTER TABLE mvp_map_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_map_meta_public_read" ON mvp_map_meta FOR SELECT USING (true);

-- MVP drops (static, from Divine Pride)
CREATE TABLE mvp_drops (
  id SERIAL PRIMARY KEY,
  mvp_monster_id INT NOT NULL,
  item_id INT NOT NULL,
  item_name TEXT NOT NULL,
  drop_rate DECIMAL,
  UNIQUE(mvp_monster_id, item_id)
);

ALTER TABLE mvp_drops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_drops_public_read" ON mvp_drops FOR SELECT USING (true);

-- Groups
CREATE TABLE mvp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  server_id INT NOT NULL REFERENCES servers(id),
  created_by UUID NOT NULL REFERENCES profiles(id),
  alert_minutes INT NOT NULL DEFAULT 5 CHECK (alert_minutes IN (5, 10, 15)),
  discord_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mvp_groups ENABLE ROW LEVEL SECURITY;

-- Group members
CREATE TABLE mvp_group_members (
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, character_id)
);

ALTER TABLE mvp_group_members ENABLE ROW LEVEL SECURITY;

-- RLS for groups: members can read their own group
CREATE POLICY "mvp_groups_member_read" ON mvp_groups FOR SELECT
  USING (id IN (SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()));
CREATE POLICY "mvp_groups_owner_update" ON mvp_groups FOR UPDATE
  USING (created_by = auth.uid());
CREATE POLICY "mvp_groups_insert" ON mvp_groups FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "mvp_group_members_read" ON mvp_group_members FOR SELECT
  USING (group_id IN (SELECT group_id FROM mvp_group_members m WHERE m.user_id = auth.uid()));
CREATE POLICY "mvp_group_members_insert" ON mvp_group_members FOR INSERT
  WITH CHECK (
    group_id IN (SELECT g.id FROM mvp_groups g WHERE g.created_by = auth.uid())
  );
CREATE POLICY "mvp_group_members_delete" ON mvp_group_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR group_id IN (SELECT g.id FROM mvp_groups g WHERE g.created_by = auth.uid())
  );

-- Kills
CREATE TABLE mvp_kills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES mvp_groups(id) ON DELETE CASCADE,
  mvp_id INT NOT NULL REFERENCES mvps(id),
  killed_at TIMESTAMPTZ NOT NULL,
  tomb_x INT,
  tomb_y INT,
  killer_character_id UUID REFERENCES characters(id),
  registered_by UUID NOT NULL REFERENCES characters(id),
  edited_by UUID REFERENCES characters(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE mvp_kills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_kills_member_read" ON mvp_kills FOR SELECT
  USING (
    group_id IS NULL AND registered_by IN (SELECT id FROM characters WHERE user_id = auth.uid())
    OR group_id IN (SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "mvp_kills_insert" ON mvp_kills FOR INSERT
  WITH CHECK (
    registered_by IN (SELECT id FROM characters WHERE user_id = auth.uid())
  );
CREATE POLICY "mvp_kills_update" ON mvp_kills FOR UPDATE
  USING (
    group_id IS NULL AND registered_by IN (SELECT id FROM characters WHERE user_id = auth.uid())
    OR group_id IN (SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "mvp_kills_delete" ON mvp_kills FOR DELETE
  USING (
    group_id IS NULL AND registered_by IN (SELECT id FROM characters WHERE user_id = auth.uid())
    OR group_id IN (SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid())
  );

-- Kill party members
CREATE TABLE mvp_kill_party (
  kill_id UUID NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id),
  PRIMARY KEY (kill_id, character_id)
);

ALTER TABLE mvp_kill_party ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_kill_party_read" ON mvp_kill_party FOR SELECT
  USING (kill_id IN (SELECT id FROM mvp_kills));

-- Kill loots
CREATE TABLE mvp_kill_loots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kill_id UUID NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE,
  item_id INT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  claimed_by UUID REFERENCES characters(id)
);

ALTER TABLE mvp_kill_loots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_kill_loots_read" ON mvp_kill_loots FOR SELECT
  USING (kill_id IN (SELECT id FROM mvp_kills));

-- Pre-configured parties
CREATE TABLE mvp_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mvp_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_parties_member_read" ON mvp_parties FOR SELECT
  USING (group_id IN (SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()));
CREATE POLICY "mvp_parties_member_insert" ON mvp_parties FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()));
CREATE POLICY "mvp_parties_member_update" ON mvp_parties FOR UPDATE
  USING (group_id IN (SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()));

CREATE TABLE mvp_party_members (
  party_id UUID NOT NULL REFERENCES mvp_parties(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id),
  PRIMARY KEY (party_id, character_id)
);

ALTER TABLE mvp_party_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_party_members_read" ON mvp_party_members FOR SELECT
  USING (party_id IN (SELECT id FROM mvp_parties));

-- Alert queue (server-only, no RLS — accessed via service role)
CREATE TABLE mvp_alert_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  mvp_kill_id UUID NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE,
  alert_at TIMESTAMPTZ NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('pre_spawn', 'spawn')),
  sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS on alert_queue — accessed only via service role from API route
CREATE INDEX idx_mvp_alert_queue_pending ON mvp_alert_queue (alert_at) WHERE sent = false;

-- RPC: get_group_active_kills
-- Returns latest kill per MVP for a group, with kill count
CREATE OR REPLACE FUNCTION get_group_active_kills(p_group_id UUID, p_server_id INT)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT DISTINCT ON (k.mvp_id)
      k.id AS kill_id,
      k.mvp_id,
      k.killed_at,
      k.tomb_x,
      k.tomb_y,
      k.killer_character_id,
      k.registered_by,
      k.edited_by,
      kc.name AS killer_name,
      rc.name AS registered_by_name,
      ec.name AS edited_by_name,
      (SELECT count(*) FROM mvp_kills k2 WHERE k2.mvp_id = k.mvp_id AND k2.group_id IS NOT DISTINCT FROM p_group_id)::int AS kill_count
    FROM mvp_kills k
    LEFT JOIN characters kc ON kc.id = k.killer_character_id
    LEFT JOIN characters rc ON rc.id = k.registered_by
    LEFT JOIN characters ec ON ec.id = k.edited_by
    JOIN mvps m ON m.id = k.mvp_id AND m.server_id = p_server_id
    WHERE k.group_id IS NOT DISTINCT FROM p_group_id
    ORDER BY k.mvp_id, k.killed_at DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
