# New MVPs + Shared Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Beelzebub, Lord of the Dead, Bio Lab 3/5 MVPs to the database with shared cooldown groups and tombless MVP support.

**Architecture:** New migration adds 3 columns to `mvps` table and inserts new MVP rows. Frontend changes propagate `has_tomb`, `cooldown_group` through types/hooks/components. Shared cooldown logic in `use-mvp-timers.ts` mirrors the existing instance `mutual_exclusion_group` pattern.

**Tech Stack:** Supabase (PostgreSQL migrations), Next.js, React, TypeScript, Tailwind CSS

---

### Task 1: Database migration — schema changes + new MVP data

**Files:**
- Create: `supabase/migrations/20260328000000_new_mvps_shared_cooldown.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add new columns to mvps table
ALTER TABLE mvps ADD COLUMN has_tomb BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mvps ADD COLUMN cooldown_group TEXT;
ALTER TABLE mvps ADD COLUMN linked_monster_id INTEGER;

-- ============================================================
-- Beelzebub (Fly Form) — abbey03, 720min respawn, 10min delay
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1873, 'Beelzebub', 'abbey03', 43200000, 600000, true, NULL, 1874),
  (2, 1873, 'Beelzebub', 'abbey03', 43200000, 600000, true, NULL, 1874);

-- Beelzebub (True Form)
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1874, 'Beelzebub (Verdadeiro)', 'abbey03', 43200000, 600000, true, NULL, 1873),
  (2, 1874, 'Beelzebub (Verdadeiro)', 'abbey03', 43200000, 600000, true, NULL, 1873);

-- ============================================================
-- Lord of the Dead — niflheim, 133min respawn, 10min delay, no tomb
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1373, 'Lord of the Dead', 'niflheim', 7980000, 600000, false, NULL, NULL),
  (2, 1373, 'Lord of the Dead', 'niflheim', 7980000, 600000, false, NULL, NULL);

-- ============================================================
-- Bio Lab 3 — lhz_dun03, 100min respawn, 30min delay, no tomb, shared cooldown
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 1646, 'Lord Knight Seyren', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1647, 'Assassin Cross Eremes', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1648, 'Whitesmith Howard', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1649, 'High Priest Margaretha', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1650, 'Sniper Cecil', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (1, 1651, 'High Wizard Kathryne', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1646, 'Lord Knight Seyren', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1647, 'Assassin Cross Eremes', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1648, 'Whitesmith Howard', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1649, 'High Priest Margaretha', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1650, 'Sniper Cecil', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL),
  (2, 1651, 'High Wizard Kathryne', 'lhz_dun03', 6000000, 1800000, false, 'bio_lab_3', NULL);

-- ============================================================
-- Bio Lab 5 — lhz_dun05, 120min respawn (2h fixed delay), 0 delay, no tomb, shared cooldown
-- ============================================================
INSERT INTO mvps (server_id, monster_id, name, map_name, respawn_ms, delay_ms, has_tomb, cooldown_group, linked_monster_id)
VALUES
  (1, 3220, 'Guillotine Cross Eremes', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3221, 'Archbishop Margaretha', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3222, 'Ranger Cecil', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3223, 'Mechanic Howard', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3224, 'Warlock Kathryne', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3225, 'Rune Knight Seyren', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3240, 'Royal Guard Randel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3241, 'Genetic Flamel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3242, 'Sorcerer Celia', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3243, 'Sura Chen', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3244, 'Shadow Chaser Gertie', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3245, 'Minstrel Alphoccio', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (1, 3246, 'Wanderer Trentini', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3220, 'Guillotine Cross Eremes', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3221, 'Archbishop Margaretha', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3222, 'Ranger Cecil', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3223, 'Mechanic Howard', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3224, 'Warlock Kathryne', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3225, 'Rune Knight Seyren', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3240, 'Royal Guard Randel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3241, 'Genetic Flamel', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3242, 'Sorcerer Celia', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3243, 'Sura Chen', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3244, 'Shadow Chaser Gertie', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3245, 'Minstrel Alphoccio', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL),
  (2, 3246, 'Wanderer Trentini', 'lhz_dun05', 7200000, 0, false, 'bio_lab_5', NULL);

-- ============================================================
-- Map metadata for new maps
-- ============================================================
INSERT INTO mvp_map_meta (map_name, width, height)
VALUES
  ('niflheim', 253, 252),
  ('lhz_dun03', 200, 200),
  ('lhz_dun05', 200, 200)
ON CONFLICT (map_name) DO NOTHING;

-- abbey03 should already exist from seed; ensure it's there
INSERT INTO mvp_map_meta (map_name, width, height)
VALUES ('abbey03', 240, 240)
ON CONFLICT (map_name) DO NOTHING;
```

Note: Map dimensions (niflheim 253x252, lhz_dun03 200x200, lhz_dun05 200x200) need verification from the actual downloaded PNG headers. The seed script (`scripts/seed-mvp-data.mjs`) extracts dimensions from PNGs — after downloading the map images (Task 6), update these values if they differ.

- [ ] **Step 2: Apply migration to Supabase**

Run: `npx supabase db push` (or apply via Supabase dashboard)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260328000000_new_mvps_shared_cooldown.sql
git commit -m "feat: add migration for new MVPs with shared cooldown and tombless support"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts:190-200`

- [ ] **Step 1: Add new fields to Mvp interface**

In `src/lib/types.ts`, update the `Mvp` interface (line 190) to add 3 new fields:

```typescript
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
  has_tomb: boolean;
  cooldown_group: string | null;
  linked_monster_id: number | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add has_tomb, cooldown_group, linked_monster_id to Mvp type"
```

---

### Task 3: Update data hook to fetch new fields

**Files:**
- Modify: `src/hooks/use-mvp-data.ts:33`

- [ ] **Step 1: Update the select query to include new columns**

In `src/hooks/use-mvp-data.ts`, update the `.select()` call on line 33:

```typescript
      const { data } = await supabase
        .from("mvps")
        .select("id, server_id, monster_id, name, map_name, respawn_ms, delay_ms, level, hp, has_tomb, cooldown_group, linked_monster_id")
        .eq("server_id", serverId)
        .order("name");
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-mvp-data.ts
git commit -m "feat: fetch has_tomb, cooldown_group, linked_monster_id from mvps table"
```

---

### Task 4: Shared cooldown logic in timer list

**Files:**
- Modify: `src/components/mvp/mvp-timer-list.tsx:21-51`

The shared cooldown logic lives in the timer list where active kills are matched to MVPs. When an MVP has a `cooldown_group`, the latest kill from **any** MVP in that group applies to all group members.

- [ ] **Step 1: Add cooldown group resolution to the kill map**

In `src/components/mvp/mvp-timer-list.tsx`, replace the `killMap` useMemo (lines 21-25) and the active computation loop (lines 38-51) with group-aware logic:

```typescript
  // Build kill map: mvp_id -> MvpActiveKill
  const killMap = useMemo(() => {
    const map = new Map<number, MvpActiveKill>();
    for (const k of activeKills) map.set(k.mvp_id, k);
    return map;
  }, [activeKills]);

  // Build cooldown group -> latest kill map
  const groupKillMap = useMemo(() => {
    const map = new Map<string, MvpActiveKill>();
    for (const mvp of mvps) {
      if (!mvp.cooldown_group) continue;
      const kill = killMap.get(mvp.id);
      if (!kill) continue;
      const existing = map.get(mvp.cooldown_group);
      if (!existing || kill.killed_at > existing.killed_at) {
        map.set(mvp.cooldown_group, kill);
      }
    }
    return map;
  }, [mvps, killMap]);

  // Resolve effective kill: for grouped MVPs use group's latest kill
  const getEffectiveKill = useCallback((mvp: Mvp): MvpActiveKill | undefined => {
    if (mvp.cooldown_group) {
      return groupKillMap.get(mvp.cooldown_group);
    }
    return killMap.get(mvp.id);
  }, [killMap, groupKillMap]);
```

- [ ] **Step 2: Update active/inactive split to use getEffectiveKill**

Replace the active/inactive computation loop (lines 37-59):

```typescript
  const q = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    return mvps.filter((m) => {
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.map_name.toLowerCase().includes(q);
    });
  }, [mvps, q]);

  const now = Date.now();
  const active: { mvp: Mvp; kill: MvpActiveKill }[] = [];
  const activeIds = new Set<number>();

  for (const mvp of mvps) {
    const kill = getEffectiveKill(mvp);
    if (kill) {
      const spawnStart = new Date(kill.killed_at).getTime() + mvp.respawn_ms;
      const cardExpiry = spawnStart + 30 * 60 * 1000;
      if (now < cardExpiry) {
        active.push({ mvp, kill });
        activeIds.add(mvp.id);
      }
    }
  }

  const inactive: { mvp: Mvp; killCount: number }[] = [];
  for (const mvp of filtered) {
    if (activeIds.has(mvp.id)) continue;
    const kill = killMap.get(mvp.id);
    const killCount = kill?.kill_count ?? 0;
    inactive.push({ mvp, killCount });
  }
```

- [ ] **Step 3: Add shared cooldown icon to active MVP cards**

In the active card render (around line 139), add the `⟷` icon after the map name for grouped MVPs:

```tsx
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-text-primary truncate">{mvp.name}</div>
                  <div className="text-[9px] text-text-secondary">
                    {mvp.map_name}
                    {mvp.cooldown_group && (
                      <span title="Cooldown compartilhado com outros MVPs do grupo"> ⟷</span>
                    )}
                  </div>
                </div>
```

- [ ] **Step 4: Add shared cooldown icon to inactive MVP cards**

In the inactive card render (around line 172), add the same icon:

```tsx
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-text-secondary">{mvp.name}</div>
                  <div className="text-[9px] text-text-secondary opacity-60">
                    {mvp.map_name}
                    {mvp.cooldown_group && (
                      <span title="Cooldown compartilhado com outros MVPs do grupo"> ⟷</span>
                    )}
                  </div>
                </div>
```

- [ ] **Step 5: Update getTimerColor for Bio Lab 5 "Mecânica disponível" status**

Update the `getTimerColor` function (line 207) to handle Bio Lab 5's mechanic-available state:

```typescript
function getTimerColor(kill: MvpActiveKill, mvp: Mvp, now: number): string {
  const spawnStart = new Date(kill.killed_at).getTime() + mvp.respawn_ms;
  const remaining = spawnStart - now;
  if (remaining <= 0) {
    // Bio Lab 5: mechanic-dependent, not guaranteed alive
    if (mvp.cooldown_group === 'bio_lab_5') return "var(--status-soon)";
    return "var(--status-available)";
  }
  if (remaining < 5 * 60 * 1000) return "var(--status-available)";
  if (remaining < 30 * 60 * 1000) return "var(--status-soon)";
  return "var(--status-cooldown)";
}
```

- [ ] **Step 6: Update formatTimer for Bio Lab 5**

Update `formatTimer` (line 217) to show "Mecânica" text for Bio Lab 5 when timer expired:

```typescript
function formatTimer(kill: MvpActiveKill, mvp: Mvp, now: number): string {
  const spawnStart = new Date(kill.killed_at).getTime() + mvp.respawn_ms;
  const diff = spawnStart - now;
  if (diff <= 0 && mvp.cooldown_group === 'bio_lab_5') {
    return "Mecânica";
  }
  const totalMin = Math.floor(Math.abs(diff) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const time = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}min`;
  return diff <= 0 ? `+${time}` : time;
}
```

- [ ] **Step 7: Add `useCallback` import if not already present**

The `useCallback` import is already on line 3 of `mvp-timer-list.tsx`. No change needed.

- [ ] **Step 8: Commit**

```bash
git add src/components/mvp/mvp-timer-list.tsx
git commit -m "feat: shared cooldown logic and Bio Lab 5 mechanic status in timer list"
```

---

### Task 5: Detail view — shared cooldown status + tombless display

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx:216-224` (detail status computation)
- Modify: `src/components/mvp/mvp-tab.tsx:326-334` (status label)
- Modify: `src/components/mvp/mvp-tab.tsx:338-393` (detail map + coords)

- [ ] **Step 1: Update detail status computation for Bio Lab 5**

In `src/components/mvp/mvp-tab.tsx`, update the `detailStatus` computation (lines 216-224) to include a `mechanicMode` flag:

```typescript
  const detailStatus = selectedMvp && selectedKill ? (() => {
    const killedAt = new Date(selectedKill.killed_at).getTime();
    const spawnStart = killedAt + selectedMvp.respawn_ms;
    const spawnEnd = spawnStart + selectedMvp.delay_ms;
    const remaining = spawnStart - now;
    const isAlive = now >= spawnStart;
    const mechanicMode = isAlive && selectedMvp.cooldown_group === 'bio_lab_5';
    const countUp = isAlive ? now - spawnEnd : 0;
    return { remaining, isAlive, mechanicMode, countUp };
  })() : null;
```

- [ ] **Step 2: Update status label text**

In the detail header status display (lines 328-334), update to show "Mecânica disponível" for Bio Lab 5:

```tsx
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums" style={{ color: detailStatus.mechanicMode ? "var(--status-soon-text)" : detailStatus.isAlive ? "var(--status-available-text)" : "var(--status-cooldown-text)" }}>
                    {detailStatus.mechanicMode ? "Mecânica" : detailStatus.isAlive ? `+${formatCountdown(detailStatus.countUp)}` : formatCountdown(detailStatus.remaining)}
                  </div>
                  <div className="text-[10px]" style={{ color: detailStatus.mechanicMode ? "var(--status-soon-text)" : detailStatus.isAlive ? "var(--status-available-text)" : "var(--status-cooldown-text)" }}>
                    {detailStatus.mechanicMode ? "Mecânica disponível" : detailStatus.isAlive ? "Provavelmente vivo" : "Cooldown"}
                  </div>
                </div>
```

- [ ] **Step 3: Add shared cooldown badge to detail header**

After the subtitle line (line 322-324), add a cooldown group indicator:

```tsx
                <p className="text-[11px] text-text-secondary">
                  {selectedMvp.map_name} · Respawn: {formatRespawn(selectedMvp.respawn_ms)}
                  {selectedKill && selectedKill.kill_count > 0 && ` · ×${selectedKill.kill_count} kills`}
                  {selectedMvp.cooldown_group && (
                    <span className="ml-1" title="Cooldown compartilhado com outros MVPs do grupo">⟷</span>
                  )}
                </p>
```

- [ ] **Step 4: Conditionally hide map tomb marker and coord badges for tombless MVPs**

In the detail map section (lines 339-352), conditionally pass `null` coords and hide heatmap when `has_tomb` is false:

```tsx
            <div className="flex gap-3 mb-3">
              <div className="w-[160px] flex-shrink-0">
                <MvpMapPicker
                  mapName={selectedMvp.map_name}
                  mapMeta={mapMeta.get(selectedMvp.map_name)}
                  tombX={selectedMvp.has_tomb ? (selectedKill?.tomb_x ?? null) : null}
                  tombY={selectedMvp.has_tomb ? (selectedKill?.tomb_y ?? null) : null}
                  onCoordsChange={() => {}}
                  readOnly
                  heatmapPoints={selectedMvp.has_tomb
                    ? killHistory
                        .filter((h) => h.tomb_x != null && h.tomb_y != null)
                        .map((h) => ({ x: h.tomb_x!, y: h.tomb_y! }))
                    : []}
                />
              </div>
```

- [ ] **Step 5: Hide coord display in detail info for tombless MVPs**

In the kill info section (lines 361-372), wrap the tomb_x/tomb_y display with a `has_tomb` check:

```tsx
                    {selectedMvp.has_tomb && selectedKill.tomb_x != null && (
                      <>
                        <div>
                          <span className="text-[9px] text-text-secondary font-semibold">X</span>
                          <div className="text-xs text-text-primary">{selectedKill.tomb_x}</div>
                        </div>
                        <div>
                          <span className="text-[9px] text-text-secondary font-semibold">Y</span>
                          <div className="text-xs text-text-primary">{selectedKill.tomb_y}</div>
                        </div>
                      </>
                    )}
```

- [ ] **Step 6: Hide coord display in kill history for tombless MVPs**

In the history row (line 413-415), add `has_tomb` check:

```tsx
                      {selectedMvp.has_tomb && h.tomb_x != null && (
                        <span className="text-text-secondary ml-auto">{h.tomb_x},{h.tomb_y}</span>
                      )}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: Bio Lab 5 mechanic status, shared cooldown badge, tombless MVP display"
```

---

### Task 6: Kill modal — hide map picker for tombless MVPs

**Files:**
- Modify: `src/components/mvp/mvp-kill-modal.tsx:178-215`

- [ ] **Step 1: Conditionally render map picker and coord inputs**

In `src/components/mvp/mvp-kill-modal.tsx`, wrap the MvpMapPicker and the X/Y coord inputs (lines 178-215) with a `has_tomb` check. The time input stays visible regardless:

```tsx
            {/* Left: Map + Time + Coords */}
            <div className="w-[300px] flex-shrink-0 flex flex-col gap-2">
              {mvp.has_tomb && (
                <MvpMapPicker
                  mapName={mvp.map_name}
                  mapMeta={mapMeta}
                  tombX={tombX}
                  tombY={tombY}
                  onCoordsChange={handleCoordsChange}
                />
              )}
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <label className="text-[9px] text-text-secondary font-semibold">HORA</label>
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    tabIndex={1}
                    className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                  />
                </div>
                {mvp.has_tomb && (
                  <>
                    <div className="w-[50px]">
                      <label className="text-[9px] text-text-secondary font-semibold">X</label>
                      <input
                        type="number"
                        value={tombX ?? ""}
                        onChange={(e) => setTombX(e.target.value ? Number(e.target.value) : null)}
                        tabIndex={2}
                        className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div className="w-[50px]">
                      <label className="text-[9px] text-text-secondary font-semibold">Y</label>
                      <input
                        type="number"
                        value={tombY ?? ""}
                        onChange={(e) => setTombY(e.target.value ? Number(e.target.value) : null)}
                        tabIndex={3}
                        className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-text-primary outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
```

- [ ] **Step 2: Force null coords for tombless MVPs in form submission**

In the `handleConfirm` function, ensure tombless MVPs always send null coords. Find the `onConfirm` call and update:

```typescript
    await onConfirm({
      killedAt: dt.toISOString(),
      tombX: mvp.has_tomb ? tombX : null,
      tombY: mvp.has_tomb ? tombY : null,
      killerCharacterId: killerId,
      selectedLoots: loots,
      partyMemberIds: Array.from(partyMemberIds),
    });
```

- [ ] **Step 3: Commit**

```bash
git add src/components/mvp/mvp-kill-modal.tsx
git commit -m "feat: hide map picker and coord inputs for tombless MVPs in kill modal"
```

---

### Task 7: Download map images

**Files:**
- Create: `public/maps/niflheim.png`
- Create: `public/maps/lhz_dun03.png`
- Create: `public/maps/lhz_dun05.png`
- Verify: `public/maps/abbey03.png` exists

- [ ] **Step 1: Download map images from Divine Pride**

```bash
cd public/maps
curl -o niflheim.png "https://www.divine-pride.net/img/map/raw/niflheim"
curl -o lhz_dun03.png "https://www.divine-pride.net/img/map/raw/lhz_dun03"
curl -o lhz_dun05.png "https://www.divine-pride.net/img/map/raw/lhz_dun05"
ls -la abbey03.png niflheim.png lhz_dun03.png lhz_dun05.png
```

- [ ] **Step 2: Verify map dimensions and update migration if needed**

Use the seed script's PNG dimension extraction pattern or check manually:

```bash
file niflheim.png lhz_dun03.png lhz_dun05.png
```

If dimensions differ from what's in the migration (niflheim 253x252, lhz_dun03 200x200, lhz_dun05 200x200), update the `mvp_map_meta` INSERT values in the migration file before applying.

- [ ] **Step 3: Commit**

```bash
git add public/maps/niflheim.png public/maps/lhz_dun03.png public/maps/lhz_dun05.png
git commit -m "chore: add map images for niflheim, lhz_dun03, lhz_dun05"
```

---

### Task 8: Shared cooldown in detail view — resolve effective kill for grouped MVPs

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx` (kill resolution logic)

When viewing a Bio Lab MVP in the detail panel, the displayed kill/timer should come from the group's latest kill (same as timer list logic).

- [ ] **Step 1: Add effective kill resolution in mvp-tab**

In `src/components/mvp/mvp-tab.tsx`, after the existing `selectedKill` computation (where it finds the active kill for the selected MVP), add group-aware resolution. Find where `selectedKill` is derived from `activeKills` and update to resolve across the cooldown group:

```typescript
  // Resolve effective kill for selected MVP (group-aware)
  const selectedKill = useMemo(() => {
    if (!selectedMvp) return null;

    // Direct kill for this MVP
    const directKill = activeKills.find((k) => k.mvp_id === selectedMvp.id) ?? null;

    // If MVP has a cooldown group, find the latest kill across the group
    if (selectedMvp.cooldown_group) {
      const groupMvpIds = new Set(
        mvps
          .filter((m) => m.cooldown_group === selectedMvp.cooldown_group)
          .map((m) => m.id)
      );
      let latestKill: MvpActiveKill | null = null;
      for (const kill of activeKills) {
        if (groupMvpIds.has(kill.mvp_id)) {
          if (!latestKill || kill.killed_at > latestKill.killed_at) {
            latestKill = kill;
          }
        }
      }
      return latestKill;
    }

    return directKill;
  }, [selectedMvp, activeKills, mvps]);
```

Note: This replaces whatever the current `selectedKill` derivation logic is. Check the existing code — if `selectedKill` is currently just `activeKills.find(k => k.mvp_id === selectedMvp?.id)`, replace it with the useMemo above. If it's already a useMemo, update the body.

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: resolve effective kill across cooldown group in detail view"
```

---

### Task 9: Invalidate MVP data cache for new columns

**Files:**
- Modify: `src/hooks/use-mvp-data.ts`

The module-level `mvpCache` may have stale data without the new columns if the app was loaded before the migration. Since the cache is keyed by `serverId` and persists across mounts, users who had a session before this deploy would get cached data without `has_tomb`, `cooldown_group`, `linked_monster_id`.

- [ ] **Step 1: No code change needed**

The cache is in-memory only (module-level `Map`). A page refresh clears it. The new `.select()` query from Task 3 will fetch the new columns on the next load. No cache versioning needed — this is a deploy-time change and all users will get a fresh page load.

- [ ] **Step 2: Mark complete**

No commit needed for this task.

---

### Task 10: Verify end-to-end

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify new MVPs appear in the list**

Navigate to the MVP tab. Search for "Beelzebub", "Lord of the Dead", "Seyren", "Eremes", etc. All new MVPs should appear in the "SEM INFO" section.

- [ ] **Step 3: Verify tombless kill registration**

Select "Lord of the Dead" → click "Matei agora" → verify the map picker and X/Y coord inputs are **not shown**. Only the time input should appear. Submit the kill.

- [ ] **Step 4: Verify shared cooldown for Bio Lab 3**

Register a kill for any Bio Lab 3 MVP (e.g. "Lord Knight Seyren"). After registering, all 6 Bio Lab 3 MVPs should appear in the ATIVOS section with the same timer, each showing the `⟷` icon.

- [ ] **Step 5: Verify Bio Lab 5 mechanic status**

Register a kill for any Bio Lab 5 MVP. Wait for (or set) the time past the 2h mark. The timer should show "Mecânica" in yellow instead of the normal green "+Xmin" alive status.

- [ ] **Step 6: Verify Beelzebub has tomb**

Select Beelzebub → register kill → verify map picker and coords **are** shown.

- [ ] **Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification"
```
