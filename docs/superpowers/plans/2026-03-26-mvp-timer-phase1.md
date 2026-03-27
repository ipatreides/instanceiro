# MVP Timer Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the database tables, seed MVP/map/drop data, group system, and tab UI with timer list for the MVP Timer feature.

**Architecture:** New Supabase migration creates tables for MVPs, groups, kills, parties, loots, drops, map metadata, and alert queue. Seed scripts populate static data from LATAM.json + Divine Pride API. Frontend adds a tab switcher below the character bar and a new MVP tab component with hybrid timer list layout.

**Tech Stack:** Next.js 16, React 19, Supabase (PostgreSQL), Tailwind CSS v4, Divine Pride API

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260327000000_mvp_timer_tables.sql` | Create | All MVP Timer tables + RLS + RPCs |
| `scripts/seed-mvp-data.mjs` | Create | Seed script: fetches LATAM.json, Divine Pride drops, map images |
| `public/maps/*.png` | Create | Static map images (~50 files) |
| `src/lib/types.ts` | Modify | Add MVP Timer types |
| `src/hooks/use-mvp-groups.ts` | Create | Group CRUD, membership, invites |
| `src/hooks/use-mvp-timers.ts` | Create | Fetch kills, timer computation, realtime |
| `src/components/mvp/mvp-tab.tsx` | Create | Main MVP tab container with search |
| `src/components/mvp/mvp-timer-list.tsx` | Create | Hybrid layout: active timers + inactive chips |
| `src/components/mvp/mvp-timer-row.tsx` | Create | Single MVP timer row with countdown |
| `src/app/dashboard/page.tsx` | Modify | Add tab switcher (Instâncias / MVPs) |

---

### Task 1: Database migration — all MVP Timer tables

**Files:**
- Create: `supabase/migrations/20260327000000_mvp_timer_tables.sql`

- [ ] **Step 1: Create the migration file with all tables**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260327000000_mvp_timer_tables.sql
git commit -m "feat: add MVP Timer database tables, RLS policies, and RPC"
```

---

### Task 2: Seed script — MVPs, maps, and drops

**Files:**
- Create: `scripts/seed-mvp-data.mjs`

- [ ] **Step 1: Create the seed script**

This script:
1. Fetches LATAM.json from GitHub
2. For each MVP+map combo, inserts into `mvps` for both servers (Freya=1, Nidhogg=2)
3. Downloads map images to `public/maps/`
4. Reads image dimensions and inserts into `mvp_map_meta`
5. Fetches drops from Divine Pride API and inserts into `mvp_drops`

```javascript
#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIVINE_PRIDE_KEY = '78ce39ae8c2f15f269d1a8f542b76ffb';
const LATAM_JSON_URL = 'https://raw.githubusercontent.com/RagnarokMvpTimer/frontend/main/src/data/LATAM.json';
const MAPS_DIR = join(process.cwd(), 'public', 'maps');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Read PNG dimensions from header
function readPngDimensions(buffer) {
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

async function main() {
  console.log('Fetching LATAM.json...');
  const mvps = await fetchJSON(LATAM_JSON_URL);
  console.log(`Found ${mvps.length} MVPs`);

  // Prepare maps dir
  if (!existsSync(MAPS_DIR)) mkdirSync(MAPS_DIR, { recursive: true });

  // Collect unique maps and MVP rows
  const mapSet = new Set();
  const mvpRows = [];
  const monsterIds = new Set();

  for (const mvp of mvps) {
    monsterIds.add(mvp.id);
    for (const spawn of mvp.spawn) {
      mapSet.add(spawn.mapname);
      // Insert for both servers (1=Freya, 2=Nidhogg)
      for (const serverId of [1, 2]) {
        mvpRows.push({
          server_id: serverId,
          monster_id: mvp.id,
          name: mvp.name,
          map_name: spawn.mapname,
          respawn_ms: spawn.respawnTime,
          delay_ms: 600000, // Default 10 min window
          level: mvp.stats?.level ?? null,
          hp: mvp.stats?.health ?? null,
        });
      }
    }
  }

  // 1. Seed MVPs
  console.log(`Inserting ${mvpRows.length} MVP rows...`);
  const { error: mvpErr } = await supabase.from('mvps').upsert(mvpRows, {
    onConflict: 'server_id,monster_id,map_name',
  });
  if (mvpErr) console.error('MVP insert error:', mvpErr);
  else console.log('MVPs seeded.');

  // 2. Download map images + collect dimensions
  const maps = [...mapSet];
  console.log(`Processing ${maps.length} unique maps...`);
  const mapMeta = [];

  for (const mapName of maps) {
    const filePath = join(MAPS_DIR, `${mapName}.png`);

    if (!existsSync(filePath)) {
      try {
        const res = await fetch(`https://www.divine-pride.net/img/map/raw/${mapName}`);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync(filePath, buffer);
          console.log(`  Downloaded ${mapName}.png`);
        } else {
          console.warn(`  Failed to download ${mapName}: HTTP ${res.status}`);
          continue;
        }
      } catch (e) {
        console.warn(`  Error downloading ${mapName}:`, e.message);
        continue;
      }
      await sleep(200); // Rate limit
    }

    const buffer = readFileSync(filePath);
    const dims = readPngDimensions(buffer);
    if (dims) {
      mapMeta.push({ map_name: mapName, width: dims.width, height: dims.height });
    }
  }

  console.log(`Inserting ${mapMeta.length} map metadata rows...`);
  const { error: mapErr } = await supabase.from('mvp_map_meta').upsert(mapMeta, {
    onConflict: 'map_name',
  });
  if (mapErr) console.error('Map meta insert error:', mapErr);
  else console.log('Map metadata seeded.');

  // 3. Fetch drops from Divine Pride
  console.log(`Fetching drops for ${monsterIds.size} monsters...`);
  const dropRows = [];

  for (const monsterId of monsterIds) {
    try {
      const monster = await fetchJSON(
        `https://www.divine-pride.net/api/database/Monster/${monsterId}?apiKey=${DIVINE_PRIDE_KEY}`
      );
      for (const drop of (monster.drops || [])) {
        // Fetch item name
        let itemName = `Item #${drop.itemId}`;
        try {
          const item = await fetchJSON(
            `https://www.divine-pride.net/api/database/Item/${drop.itemId}?apiKey=${DIVINE_PRIDE_KEY}`
          );
          itemName = item.name || itemName;
          await sleep(100);
        } catch { /* keep default name */ }

        dropRows.push({
          mvp_monster_id: monsterId,
          item_id: drop.itemId,
          item_name: itemName,
          drop_rate: drop.chance / 100, // Divine Pride returns basis points
        });
      }
      console.log(`  ${monster.name}: ${monster.drops?.length ?? 0} drops`);
      await sleep(200);
    } catch (e) {
      console.warn(`  Error fetching monster ${monsterId}:`, e.message);
    }
  }

  console.log(`Inserting ${dropRows.length} drop rows...`);
  const { error: dropErr } = await supabase.from('mvp_drops').upsert(dropRows, {
    onConflict: 'mvp_monster_id,item_id',
  });
  if (dropErr) console.error('Drop insert error:', dropErr);
  else console.log('Drops seeded.');

  console.log('Done!');
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/seed-mvp-data.mjs
git commit -m "feat: add MVP data seed script (LATAM.json + Divine Pride drops + map images)"
```

- [ ] **Step 3: Run the seed script**

```bash
node --env-file=.env.local scripts/seed-mvp-data.mjs
```

Expected: downloads ~50 map images to `public/maps/`, inserts MVPs, map meta, and drops into Supabase.

- [ ] **Step 4: Commit map images**

```bash
git add public/maps/
git commit -m "feat: add static map images for MVP Timer"
```

---

### Task 3: TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add MVP Timer types**

Add at the end of `src/lib/types.ts`:

```typescript
// MVP Timer types

export interface Mvp {
  id: number;
  server_id: number;
  monster_id: number;
  name: string;
  map_name: string;
  respawn_ms: number;
  delay_ms: number;
  level: number | null;
  hp: number | null;
}

export interface MvpMapMeta {
  map_name: string;
  width: number;
  height: number;
}

export interface MvpDrop {
  id: number;
  mvp_monster_id: number;
  item_id: number;
  item_name: string;
  drop_rate: number | null;
}

export interface MvpGroup {
  id: string;
  name: string;
  server_id: number;
  created_by: string;
  alert_minutes: number;
  discord_channel_id: string | null;
  created_at: string;
}

export interface MvpGroupMember {
  group_id: string;
  character_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface MvpActiveKill {
  kill_id: string;
  mvp_id: number;
  killed_at: string;
  tomb_x: number | null;
  tomb_y: number | null;
  killer_character_id: string | null;
  registered_by: string;
  edited_by: string | null;
  killer_name: string | null;
  registered_by_name: string;
  edited_by_name: string | null;
  kill_count: number;
}

export type MvpTimerStatus = 'cooldown' | 'spawn_window' | 'probably_alive' | 'tomb_expired' | 'inactive';
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add MVP Timer TypeScript types"
```

---

### Task 4: MVP data hook with caching

**Files:**
- Create: `src/hooks/use-mvp-data.ts`

- [ ] **Step 1: Create the hook**

This hook loads static MVP data (mvps, maps, drops) with aggressive caching. Scoped to the selected character's server.

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Mvp, MvpMapMeta, MvpDrop } from "@/lib/types";

// Module-level caches keyed by server_id
const mvpCache = new Map<number, Mvp[]>();
const mapMetaCache = new Map<string, MvpMapMeta>();
let dropsCache: MvpDrop[] | null = null;

interface UseMvpDataReturn {
  mvps: Mvp[];
  mapMeta: Map<string, MvpMapMeta>;
  drops: MvpDrop[];
  loading: boolean;
}

export function useMvpData(serverId: number | null): UseMvpDataReturn {
  const [mvps, setMvps] = useState<Mvp[]>([]);
  const [drops, setDrops] = useState<MvpDrop[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!serverId) return;
    const supabase = createClient();

    // Fetch MVPs (cached per server)
    let serverMvps = mvpCache.get(serverId);
    if (!serverMvps) {
      const { data } = await supabase
        .from("mvps")
        .select("id, server_id, monster_id, name, map_name, respawn_ms, delay_ms, level, hp")
        .eq("server_id", serverId)
        .order("name");
      serverMvps = (data ?? []) as Mvp[];
      mvpCache.set(serverId, serverMvps);
    }

    // Fetch map meta (cached globally)
    if (mapMetaCache.size === 0) {
      const { data } = await supabase
        .from("mvp_map_meta")
        .select("map_name, width, height");
      for (const m of (data ?? [])) {
        mapMetaCache.set(m.map_name, m as MvpMapMeta);
      }
    }

    // Fetch drops (cached globally — same for all servers)
    if (!dropsCache) {
      const { data } = await supabase
        .from("mvp_drops")
        .select("id, mvp_monster_id, item_id, item_name, drop_rate");
      dropsCache = (data ?? []) as MvpDrop[];
    }

    setMvps(serverMvps);
    setDrops(dropsCache);
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { mvps, mapMeta: mapMetaCache, drops, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-mvp-data.ts
git commit -m "feat: add useMvpData hook with aggressive caching"
```

---

### Task 5: MVP groups hook

**Files:**
- Create: `src/hooks/use-mvp-groups.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpGroup, MvpGroupMember } from "@/lib/types";

interface UseMvpGroupsReturn {
  group: MvpGroup | null;
  members: MvpGroupMember[];
  loading: boolean;
  createGroup: (name: string, serverId: number) => Promise<string>;
  inviteCharacter: (groupId: string, characterId: string, userId: string) => Promise<void>;
  leaveGroup: (characterId: string) => Promise<void>;
  updateGroup: (groupId: string, updates: Partial<Pick<MvpGroup, 'name' | 'alert_minutes' | 'discord_channel_id'>>) => Promise<void>;
}

export function useMvpGroups(characterId: string | null): UseMvpGroupsReturn {
  const [group, setGroup] = useState<MvpGroup | null>(null);
  const [members, setMembers] = useState<MvpGroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroup = useCallback(async () => {
    if (!characterId) {
      setGroup(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Find which group this character belongs to
    const { data: membership } = await supabase
      .from("mvp_group_members")
      .select("group_id, role")
      .eq("character_id", characterId)
      .maybeSingle();

    if (!membership) {
      setGroup(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    // Fetch group details
    const { data: groupData } = await supabase
      .from("mvp_groups")
      .select("id, name, server_id, created_by, alert_minutes, discord_channel_id, created_at")
      .eq("id", membership.group_id)
      .single();

    // Fetch all members
    const { data: membersData } = await supabase
      .from("mvp_group_members")
      .select("group_id, character_id, user_id, role, joined_at")
      .eq("group_id", membership.group_id);

    setGroup((groupData as MvpGroup) ?? null);
    setMembers((membersData as MvpGroupMember[]) ?? []);
    setLoading(false);
  }, [characterId]);

  useEffect(() => {
    setLoading(true);
    fetchGroup();
  }, [fetchGroup]);

  const createGroup = useCallback(async (name: string, serverId: number): Promise<string> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !characterId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("mvp_groups")
      .insert({ name, server_id: serverId, created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;

    // Add creator as owner
    await supabase.from("mvp_group_members").insert({
      group_id: data.id,
      character_id: characterId,
      user_id: user.id,
      role: "owner",
    });

    await fetchGroup();
    return data.id;
  }, [characterId, fetchGroup]);

  const inviteCharacter = useCallback(async (groupId: string, targetCharacterId: string, targetUserId: string) => {
    const supabase = createClient();
    await supabase.from("mvp_group_members").insert({
      group_id: groupId,
      character_id: targetCharacterId,
      user_id: targetUserId,
      role: "member",
    });
    await fetchGroup();
  }, [fetchGroup]);

  const leaveGroup = useCallback(async (charId: string) => {
    const supabase = createClient();
    await supabase
      .from("mvp_group_members")
      .delete()
      .eq("character_id", charId);
    await fetchGroup();
  }, [fetchGroup]);

  const updateGroup = useCallback(async (groupId: string, updates: Partial<Pick<MvpGroup, 'name' | 'alert_minutes' | 'discord_channel_id'>>) => {
    const supabase = createClient();
    await supabase.from("mvp_groups").update(updates).eq("id", groupId);
    await fetchGroup();
  }, [fetchGroup]);

  return { group, members, loading, createGroup, inviteCharacter, leaveGroup, updateGroup };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-mvp-groups.ts
git commit -m "feat: add useMvpGroups hook for group CRUD and membership"
```

---

### Task 6: MVP timers hook

**Files:**
- Create: `src/hooks/use-mvp-timers.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpActiveKill } from "@/lib/types";

interface UseMvpTimersReturn {
  activeKills: MvpActiveKill[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useMvpTimers(groupId: string | null, serverId: number | null): UseMvpTimersReturn {
  const [activeKills, setActiveKills] = useState<MvpActiveKill[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKills = useCallback(async () => {
    if (!serverId) {
      setActiveKills([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_group_active_kills", {
      p_group_id: groupId,
      p_server_id: serverId,
    });

    if (error) {
      console.error("Error fetching active kills:", error);
      setActiveKills([]);
    } else {
      setActiveKills((data ?? []) as MvpActiveKill[]);
    }
    setLoading(false);
  }, [groupId, serverId]);

  useEffect(() => {
    setLoading(true);
    fetchKills();

    // Realtime subscription for kills — only when tab is active
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchKills(), 5000);
    };

    const channelName = groupId ? `mvp-kills-${groupId}` : `mvp-kills-solo`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "mvp_kills" }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchKills, groupId]);

  return { activeKills, loading, refetch: fetchKills };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-mvp-timers.ts
git commit -m "feat: add useMvpTimers hook with realtime subscription"
```

---

### Task 7: Timer row component

**Files:**
- Create: `src/components/mvp/mvp-timer-row.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect } from "react";
import type { Mvp, MvpActiveKill, MvpTimerStatus } from "@/lib/types";

interface MvpTimerRowProps {
  mvp: Mvp;
  kill: MvpActiveKill | null;
}

function computeStatus(kill: MvpActiveKill, mvp: Mvp, now: number): { status: MvpTimerStatus; remainingMs: number } {
  const killedAt = new Date(kill.killed_at).getTime();
  const spawnStart = killedAt + mvp.respawn_ms;
  const spawnEnd = spawnStart + mvp.delay_ms;
  const tombExpiry = spawnStart + 10 * 60 * 1000;
  const cardExpiry = spawnStart + 30 * 60 * 1000;

  if (now < spawnStart) return { status: "cooldown", remainingMs: spawnStart - now };
  if (now < spawnEnd) return { status: "spawn_window", remainingMs: 0 };
  if (now < tombExpiry) return { status: "probably_alive", remainingMs: now - spawnEnd };
  if (now < cardExpiry) return { status: "tomb_expired", remainingMs: now - spawnEnd };
  return { status: "inactive", remainingMs: 0 };
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<MvpTimerStatus, string> = {
  cooldown: "var(--status-cooldown)",
  spawn_window: "var(--status-available)",
  probably_alive: "var(--status-available)",
  tomb_expired: "var(--status-available)",
  inactive: "var(--border)",
};

const STATUS_TEXT_COLORS: Record<MvpTimerStatus, string> = {
  cooldown: "var(--status-cooldown-text)",
  spawn_window: "var(--status-available-text)",
  probably_alive: "var(--status-available-text)",
  tomb_expired: "var(--text-secondary)",
  inactive: "var(--text-secondary)",
};

export function MvpTimerRow({ mvp, kill }: MvpTimerRowProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!kill) return null;

  const { status, remainingMs } = computeStatus(kill, mvp, now);
  if (status === "inactive") return null;

  const borderColor = STATUS_COLORS[status];
  const textColor = STATUS_TEXT_COLORS[status];
  const showTomb = kill.tomb_x != null && kill.tomb_y != null && status !== "tomb_expired";
  const isCountUp = status === "probably_alive" || status === "tomb_expired";

  // Determine countdown color thresholds for cooldown
  let countdownColor = textColor;
  if (status === "cooldown") {
    if (remainingMs < 5 * 60 * 1000) countdownColor = "var(--status-available-text)";
    else if (remainingMs < 30 * 60 * 1000) countdownColor = "var(--status-soon-text)";
  }

  const statusLabel = status === "cooldown" ? "" : status === "spawn_window" ? "Pode nascer" : "Provavelmente vivo";

  // Display name: "Maya (Anthell 2)" format
  const displayName = `${mvp.name} (${mvp.map_name})`;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary font-medium truncate">{displayName}</span>
          {kill.kill_count > 1 && (
            <span className="text-[10px] text-text-secondary">×{kill.kill_count}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showTomb && (
            <span className="text-[10px] text-text-secondary">{kill.tomb_x},{kill.tomb_y}</span>
          )}
          {statusLabel && (
            <span className="text-[10px]" style={{ color: textColor }}>{statusLabel}</span>
          )}
          {kill.registered_by_name && (
            <span className="text-[10px] text-text-secondary">
              por {kill.edited_by_name ? `${kill.edited_by_name} (editado)` : kill.registered_by_name}
            </span>
          )}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums min-w-[60px] text-right" style={{ color: countdownColor }}>
        {isCountUp ? `+${formatCountdown(remainingMs)}` : formatCountdown(remainingMs)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-timer-row.tsx
git commit -m "feat: add MvpTimerRow component with countdown and status colors"
```

---

### Task 8: Timer list component

**Files:**
- Create: `src/components/mvp/mvp-timer-list.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useMemo } from "react";
import type { Mvp, MvpActiveKill } from "@/lib/types";
import { MvpTimerRow } from "./mvp-timer-row";

interface MvpTimerListProps {
  mvps: Mvp[];
  activeKills: MvpActiveKill[];
  search: string;
  loading: boolean;
}

export function MvpTimerList({ mvps, activeKills, search, loading }: MvpTimerListProps) {
  const killMap = useMemo(() => {
    const map = new Map<number, MvpActiveKill>();
    for (const k of activeKills) map.set(k.mvp_id, k);
    return map;
  }, [activeKills]);

  const q = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    return mvps.filter((m) => {
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.map_name.toLowerCase().includes(q);
    });
  }, [mvps, q]);

  // Split into active (has kill, not expired) and inactive
  const now = Date.now();
  const active: { mvp: Mvp; kill: MvpActiveKill }[] = [];
  const inactive: Mvp[] = [];

  for (const mvp of filtered) {
    const kill = killMap.get(mvp.id);
    if (kill) {
      const spawnStart = new Date(kill.killed_at).getTime() + mvp.respawn_ms;
      const cardExpiry = spawnStart + 30 * 60 * 1000;
      if (now < cardExpiry) {
        active.push({ mvp, kill });
        continue;
      }
    }
    inactive.push(mvp);
  }

  // Sort active by nearest spawn
  active.sort((a, b) => {
    const aSpawn = new Date(a.kill.killed_at).getTime() + a.mvp.respawn_ms;
    const bSpawn = new Date(b.kill.killed_at).getTime() + b.mvp.respawn_ms;
    return aSpawn - bSpawn;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Active timers */}
      {active.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-secondary font-semibold">ATIVOS ({active.length})</p>
          <div className="flex flex-col gap-1">
            {active.map(({ mvp, kill }) => (
              <MvpTimerRow key={mvp.id} mvp={mvp} kill={kill} />
            ))}
          </div>
        </div>
      )}

      {/* Inactive MVPs */}
      {inactive.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-secondary font-semibold">SEM INFO ({inactive.length})</p>
          <div className="flex flex-wrap gap-1">
            {inactive.map((mvp) => (
              <button
                key={mvp.id}
                className="px-2 py-1 text-[10px] bg-surface border border-border rounded text-text-secondary hover:border-primary hover:text-text-primary transition-colors cursor-pointer"
              >
                {mvp.name} ({mvp.map_name})
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-text-secondary italic text-center py-4">
          {q ? "Nenhum MVP encontrado." : "Nenhum MVP cadastrado."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-timer-list.tsx
git commit -m "feat: add MvpTimerList with active/inactive split layout"
```

---

### Task 9: MVP tab container

**Files:**
- Create: `src/components/mvp/mvp-tab.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import type { Account, Character } from "@/lib/types";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { MvpTimerList } from "./mvp-timer-list";

interface MvpTabProps {
  selectedCharId: string | null;
  characters: Character[];
  accounts: Account[];
}

export function MvpTab({ selectedCharId, characters, accounts }: MvpTabProps) {
  const [search, setSearch] = useState("");

  // Derive server_id from selected character
  const selectedChar = characters.find((c) => c.id === selectedCharId);
  const account = accounts.find((a) => a.id === selectedChar?.account_id);
  const serverId = account?.server_id ?? null;

  // Load static data
  const { mvps, loading: mvpLoading } = useMvpData(serverId);

  // Load group for this character
  const { group, loading: groupLoading } = useMvpGroups(selectedCharId);

  // Load active kills
  const { activeKills, loading: killsLoading } = useMvpTimers(group?.id ?? null, serverId);

  const loading = mvpLoading || groupLoading || killsLoading;

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <img
          src="/app-icon.svg"
          alt=""
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar MVP ou mapa..."
          className="w-full rounded-lg bg-bg border border-border pl-10 pr-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Group info */}
      {group ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Grupo:</span>
          <span className="text-xs text-primary-secondary font-medium">{group.name}</span>
          <span className="text-[10px] text-text-secondary">· {activeKills.length} ativos</span>
        </div>
      ) : (
        <div className="text-xs text-text-secondary">Modo solo</div>
      )}

      {/* Timer list */}
      <MvpTimerList
        mvps={mvps}
        activeKills={activeKills}
        search={search}
        loading={loading}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: add MvpTab container with search, group info, and timer list"
```

---

### Task 10: Add tab switcher to dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add tab state and imports**

At the top of `dashboard/page.tsx`, add import:
```typescript
import { MvpTab } from "@/components/mvp/mvp-tab";
```

Add state near other state declarations:
```typescript
const [activeMainTab, setActiveMainTab] = useState<"instances" | "mvps">("instances");
```

- [ ] **Step 2: Add tab buttons below the account bar**

Find the `<AccountBar>` component in the JSX. Right after its closing tag, add:

```tsx
{/* Main tab switcher */}
<div className="flex gap-1 border-b border-border pb-1">
  <button
    onClick={() => setActiveMainTab("instances")}
    className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
      activeMainTab === "instances"
        ? "text-text-primary border-b-2 border-primary"
        : "text-text-secondary hover:text-text-primary"
    }`}
  >
    Instâncias
  </button>
  <button
    onClick={() => setActiveMainTab("mvps")}
    className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors cursor-pointer ${
      activeMainTab === "mvps"
        ? "text-text-primary border-b-2 border-primary"
        : "text-text-secondary hover:text-text-primary"
    }`}
  >
    MVPs
  </button>
</div>
```

- [ ] **Step 3: Conditionally render content based on active tab**

Wrap the existing instances content (schedules section, search, instance columns, mobile tabs) in a conditional:

```tsx
{activeMainTab === "instances" ? (
  <>
    {/* All existing instance content: ScheduleSection, InstanceSearch, InstanceColumn, MobileInstanceTabs */}
  </>
) : (
  <MvpTab
    selectedCharId={selectedCharId}
    characters={characters}
    accounts={accounts}
  />
)}
```

The existing modals (ScheduleModal, ScheduleForm, InstanceModal, etc.) should stay **outside** the conditional — they're triggered by state and render as overlays regardless of active tab.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add Instâncias/MVPs tab switcher to dashboard"
```

---

### Task 11: Run migration and verify

- [ ] **Step 1: Copy and run migration on Supabase**

Copy `supabase/migrations/20260327000000_mvp_timer_tables.sql` to clipboard and run in Supabase SQL Editor.

- [ ] **Step 2: Run seed script**

```bash
node --env-file=.env.local scripts/seed-mvp-data.mjs
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Manual verification**

- Dashboard loads with tab switcher below account bar
- Clicking "MVPs" shows the MVP tab with search bar and "Modo solo"
- MVPs appear in "SEM INFO" section as compact chips
- Clicking "Instâncias" returns to the original view
- All existing functionality (schedules, instances, friends) works unchanged

---

## Self-Review

**Spec coverage:**
- ✅ Navigation (tabs below char bar)
- ✅ Groups (model, CRUD, membership)
- ✅ MVP data (static, cached)
- ✅ Map images (static files)
- ✅ Map meta (coordinate dimensions)
- ✅ Drops (seeded from Divine Pride)
- ✅ Timer display (hybrid layout)
- ✅ Timer logic (client-side)
- ✅ Server isolation (server_id on mvps and groups)
- ⏭ Kill registration modal → Phase 2
- ⏭ Party system → Phase 3
- ⏭ Discord notifications → Phase 4

**RLS note:** The `mvp_kills` RLS uses subqueries on `characters` and `mvp_group_members`. Given the lesson from the characters RLS incident, if performance issues arise, replace direct table access with SECURITY DEFINER RPCs. The `get_group_active_kills` RPC already uses SECURITY DEFINER for the main read path.
