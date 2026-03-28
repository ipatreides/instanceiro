# New MVPs + Shared Cooldown — Design Spec

## Summary

Add missing MVPs (Beelzebub, Lord of the Dead, Bio Lab 3, Bio Lab 5) to the database and introduce two new MVP concepts: **shared cooldown groups** (Bio Labs) and **tombless MVPs**. Also link Beelzebub's two monster IDs for future telemetry matching.

## Context

The MVP timer system (spec: `2026-03-26-mvp-timer-design.md`) seeds data from `LATAM.json`, which doesn't include these MVPs. They must be added manually via migration. The shared cooldown pattern already exists for instances (`mutual_exclusion_group` in `use-instances.ts`) and will be adapted for MVPs.

---

## Schema Changes

### ALTER `mvps` table — 3 new columns

```sql
ALTER TABLE mvps ADD COLUMN has_tomb BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE mvps ADD COLUMN cooldown_group TEXT;
ALTER TABLE mvps ADD COLUMN linked_monster_id INTEGER;
```

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `has_tomb` | `BOOLEAN NOT NULL` | `true` | When `false`, kill registration modal hides the map picker (tomb_x/tomb_y) |
| `cooldown_group` | `TEXT` | `NULL` | MVPs sharing the same value share cooldown — any kill resets all timers in the group |
| `linked_monster_id` | `INTEGER` | `NULL` | Links two monster_ids as the same MVP (e.g. Beelzebub fly ↔ true form) for telemetry matching |

Existing MVPs are unaffected (`has_tomb = true`, `cooldown_group = NULL`, `linked_monster_id = NULL`).

---

## New MVP Data

### Beelzebub

| Field | Fly Form | True Form |
|-------|----------|-----------|
| `monster_id` | 1873 | 1874 |
| `name` | Beelzebub | Beelzebub (Verdadeiro) |
| `map_name` | abbey03 | abbey03 |
| `respawn_ms` | 43200000 (720 min) | 43200000 (720 min) |
| `delay_ms` | 600000 (10 min) | 600000 (10 min) |
| `has_tomb` | true | true |
| `cooldown_group` | NULL | NULL |
| `linked_monster_id` | 1874 | 1873 |

Both forms are the same MVP. `linked_monster_id` cross-references them so telemetry (under development) can match kills from either ID to the same entity. Each form is a separate row in `mvps` so both monster_ids exist in the database for packet matching.

### Lord of the Dead

| Field | Value |
|-------|-------|
| `monster_id` | 1373 |
| `name` | Lord of the Dead |
| `map_name` | niflheim |
| `respawn_ms` | 7980000 (133 min) |
| `delay_ms` | 600000 (10 min) |
| `has_tomb` | false |
| `cooldown_group` | NULL |
| `linked_monster_id` | NULL |

### Bio Lab 3 — 6 MVPs, shared cooldown

| monster_id | Name |
|-----------|------|
| 1646 | Lord Knight Seyren |
| 1647 | Assassin Cross Eremes |
| 1648 | Whitesmith Howard |
| 1649 | High Priest Margaretha |
| 1650 | Sniper Cecil |
| 1651 | High Wizard Kathryne |

Common fields:
- `map_name`: `lhz_dun03`
- `respawn_ms`: 6000000 (100 min)
- `delay_ms`: 1800000 (30 min) — window is 100–130 min
- `has_tomb`: false
- `cooldown_group`: `'bio_lab_3'`
- `linked_monster_id`: NULL

### Bio Lab 5 — 13 MVPs, shared cooldown with special mechanic

| monster_id | Name |
|-----------|------|
| 3220 | Guillotine Cross Eremes |
| 3221 | Archbishop Margaretha |
| 3222 | Ranger Cecil |
| 3223 | Mechanic Howard |
| 3224 | Warlock Kathryne |
| 3225 | Rune Knight Seyren |
| 3240 | Royal Guard Randel |
| 3241 | Genetic Flamel |
| 3242 | Sorcerer Celia |
| 3243 | Sura Chen |
| 3244 | Shadow Chaser Gertie |
| 3245 | Minstrel Alphoccio |
| 3246 | Wanderer Trentini |

Common fields:
- `map_name`: `lhz_dun05`
- `respawn_ms`: 7200000 (120 min) — the 2h fixed delay before map mechanic starts
- `delay_ms`: 0 — actual spawn is mechanic-dependent, not a fixed window
- `has_tomb`: false
- `cooldown_group`: `'bio_lab_5'`
- `linked_monster_id`: NULL

---

## Shared Cooldown Logic

Reuses the same pattern as instance `mutual_exclusion_group` in `use-instances.ts` (lines 141–160).

### Algorithm (in `use-mvp-timers.ts`)

When computing the active timer for an MVP that has a `cooldown_group`:

1. Find all `mvp.id`s in the same `cooldown_group`
2. Find the most recent `mvp_kills` entry across all those MVP IDs
3. Use that kill's `killed_at` + the MVP's `respawn_ms` + `delay_ms` as the shared timer
4. All MVPs in the group display the same countdown

### UI indicators

- MVPs in a shared cooldown group show a `⟷` icon (same as instances) with tooltip: "Cooldown compartilhado com outros MVPs do grupo"
- When one Bio Lab MVP is killed, all others in the group immediately reflect the new timer
- Bio Lab 5: after the 120 min timer expires, status text shows "Mecânica disponivel" instead of the normal "Vivo" status, since the actual spawn depends on map mechanics

### Status text override for Bio Lab 5

When `cooldown_group = 'bio_lab_5'` and `delay_ms = 0` and the base timer has expired:
- Instead of "Vivo" / pulsing green, show "Mecânica disponivel" with a distinct visual treatment (e.g. status-soon yellow, since it's not guaranteed alive)

---

## Kill Registration — Tombless MVPs

When `has_tomb = false` for the selected MVP:

- The map picker component (`mvp-map-picker.tsx`) is **not rendered** in the kill modal
- `tomb_x` and `tomb_y` are sent as `NULL`
- The map image still appears in the MVP detail panel (for reference), but without a tomb marker
- The kill history entries for tombless MVPs don't show coordinate badges

---

## Seed / Migration Strategy

A single new migration file handles both schema changes and data insertion:

1. `ALTER TABLE mvps` — add 3 new columns
2. `INSERT INTO mvps` — all new MVPs for both servers (Freya server_id=1, Nidhogg server_id=2)
3. `INSERT INTO mvp_map_meta` — map dimensions for `abbey03` (if missing), `niflheim`, `lhz_dun03`, `lhz_dun05`
4. Download map images to `/public/maps/` for new maps (manual or script step)
5. MVP drops for new monsters — fetched via Divine Pride API in seed script update

### Map images needed

| Map | Exists? |
|-----|---------|
| `abbey03` | Already in public/maps (Beelzebub was anticipated in original seed) — verify |
| `niflheim` | Needs download |
| `lhz_dun03` | Needs download |
| `lhz_dun05` | Needs download |

---

## Discord Alerts

The existing `mvp_alert_trigger` fires on `mvp_kills` INSERT. For shared cooldown groups, a single kill registration triggers one alert — the alert references the specific MVP killed, not the entire group. Group members are notified that "X was killed in Bio Lab 3" which implicitly means the whole lab is on cooldown.

No changes needed to the alert trigger or queue system.

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/NEW_migration.sql` | Schema ALTER + INSERT new MVPs |
| `src/hooks/use-mvp-timers.ts` | Shared cooldown logic (group-aware timer computation) |
| `src/hooks/use-mvp-data.ts` | Expose `has_tomb`, `cooldown_group`, `linked_monster_id` fields |
| `src/lib/types.ts` | Add new fields to `Mvp` interface |
| `src/components/mvp/mvp-kill-modal.tsx` | Conditionally hide map picker when `has_tomb = false` |
| `src/components/mvp/mvp-timer-list.tsx` | Show `⟷` icon for shared cooldown MVPs; "Mecânica disponivel" status for Bio Lab 5 |
| `src/components/mvp/mvp-tab.tsx` | Handle shared cooldown display in detail panel |
| `scripts/seed-mvp-data.mjs` | Add Divine Pride drop fetching for new monster_ids |
| `public/maps/` | New map images (niflheim, lhz_dun03, lhz_dun05) |
