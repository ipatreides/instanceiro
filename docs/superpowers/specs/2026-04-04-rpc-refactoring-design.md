# Refactoring telemetry_register_kill RPC

## Problem

The `telemetry_register_kill` RPC accumulated 10 migrations, handling 4 different callers with a single generic function. Parameters like `p_update_only` create implicit modes, the dedup logic has 3 tiers that interact in fragile ways, and the sentinel epoch 0 for "unknown time" adds more edge cases.

Key bugs from this complexity:
- `reconstructKilledAt` overwrites correct `killed_at` with wrong date (assumes today, but tomb hour:minute may be from yesterday)
- Sentinel kills not found by MvpKiller due to dedup window mismatch
- Tomb standalone creates kill with `now()` showing wrong time until click

## Design

### Architecture: 3 Specialized RPCs + 1 Helper

Replace the single `telemetry_register_kill` with:

```
_find_kill_for_mvp()        -- Internal helper: find existing kill (3-tier lookup)
register_kill_from_event()  -- Rustro saw MVP die (has real timestamp)
update_kill_from_tomb()     -- Rustro saw tomb (no kill time)
update_kill_from_killer()   -- Rustro clicked tomb (has BRT hour:minute + killer)
```

### Helper: `_find_kill_for_mvp`

```sql
_find_kill_for_mvp(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_reference_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS UUID  -- kill_id or NULL
```

Three-tier lookup (same as current but cleaner):

1. **Sentinel**: `killed_at < '1970-01-02'` — orphaned tomb kills waiting for real time
2. **Tomb coords**: same `(tomb_x, tomb_y)` within `respawn_ms + delay_ms + 10min` window
3. **Time window**: `killed_at >= reference - (respawn_ms - 1min)` — normal dedup

All tiers use `pg_advisory_xact_lock` and `FOR UPDATE`.

### RPC 1: `register_kill_from_event`

```sql
register_kill_from_event(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,       -- real timestamp from sniffer
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_killer_name TEXT DEFAULT NULL,
  p_killer_char_id UUID DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON
```

**Called by:** `mvp-event` endpoint (Rustro kill buffer batched)

**Flow:**
1. `_find_kill_for_mvp()` with tomb coords + killed_at
2. If found: update with COALESCE (tomb, killer, killed_at always overwrites)
3. If not found: INSERT new kill
4. On create: populate witnesses from active sessions (2-min grace)
5. Always: clean sightings + broadcasts

**Dedup window:** 30s (two sniffers seeing same death)

### RPC 2: `update_kill_from_tomb`

```sql
update_kill_from_tomb(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_tomb_x INT,                  -- required
  p_tomb_y INT,                  -- required
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON
```

**Called by:** `mvp-tomb` endpoint (Rustro saw tomb NPC spawn, standalone)

**Flow:**
1. `_find_kill_for_mvp()` with tomb coords + NOW() as reference
2. If found: update tomb coords only (COALESCE), do NOT touch killed_at
3. If not found: INSERT with sentinel `killed_at = epoch 0`, set `validation_status = 'pending'`
4. On create: clean sightings (tomb proves MVP is dead)
5. Do NOT clean broadcasts (no confirmed kill yet)
6. Do NOT populate witnesses (no real timestamp to anchor)

### RPC 3: `update_kill_from_killer`

```sql
update_kill_from_killer(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,       -- reconstructed from BRT hour:minute by TypeScript
  p_killer_name TEXT,             -- required
  p_killer_char_id UUID DEFAULT NULL,
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON
```

**Called by:** `mvp-killer` endpoint (Rustro clicked tomb, NPC dialog parsed)

**Flow:**
1. `_find_kill_for_mvp()` with tomb coords + killed_at
2. If found: update killer + killed_at (always overwrite, tomb is source of truth for time)
3. If found AND was sentinel: also populate witnesses now (first real timestamp)
4. If not found: INSERT new kill with killer + time
5. Always: clean sightings + broadcasts (confirmed kill)

### TypeScript: `reconstructKilledAt` improvements

Current function stays in TypeScript but receives `respawn_ms` to validate the date:

```typescript
function reconstructKilledAt(
  killHour: number,
  killMinute: number,
  reference: Date,
  respawnMs: number     // NEW: from MVP record
): Date | null
```

**Logic:**
1. Construct candidate date: today at `killHour:killMinute` BRT → UTC
2. If candidate is in the future → subtract 1 day
3. **NEW validation:** if candidate is older than `respawnMs + 10min` from reference → reject (return null)
4. Return the validated timestamp

If null is returned, the endpoint can decide to skip the killed_at update (use existing) or use sentinel.

### Frontend: Sentinel display

`isUnknownKillTime(killedAt)` — already implemented. Returns `true` for `killed_at < 1 day from epoch`. Timer shows "?" and card stays active until MvpKiller provides real time.

### Deprecated

- `telemetry_register_kill` — replaced by the 3 RPCs above
- `mvp-kill` endpoint — legacy C++ endpoint, never called by Rust sniffer

### Side effects per RPC

| RPC | Clean sightings | Clean broadcasts | Populate witnesses |
|-----|:---:|:---:|:---:|
| `register_kill_from_event` | Yes | Yes | Yes (on create) |
| `update_kill_from_tomb` | Yes (on create) | No | No |
| `update_kill_from_killer` | Yes | Yes | Yes (if was sentinel) |

### Return values

All RPCs return:
```json
{
  "action": "created" | "updated" | "ignored",
  "kill_id": "uuid" | null,
  "was_sentinel": true | false,
  "killed_at": "iso-string" | null
}
```

`was_sentinel` tells the endpoint whether this kill was previously time-unknown, useful for toast logic.

### Testing strategy

SQL tests via transactional rollback against the live database. Each test:
1. `BEGIN`
2. Insert test fixtures (group, MVPs, existing kills as needed)
3. Call the RPC
4. Assert return value (JSON) and table state (`SELECT` from `mvp_kills`)
5. `ROLLBACK` — nothing persisted

Test cases per RPC:

**`register_kill_from_event`:**
- Create new kill (no existing) → action=created, verify row
- Dedup: call twice with same data → second returns action=updated
- Update sentinel kill → was_sentinel=true, killed_at updated
- Witnesses populated on create
- Event arrives after tomb sentinel → finds sentinel, updates with real timestamp
- Event with tomb coords matching old cycle (respawn passed) → creates new, not update old

**`update_kill_from_tomb`:**
- Update existing kill with tomb coords → action=updated, coords set
- No existing kill → creates sentinel (epoch 0), action=created
- Duplicate tomb same coords → action=updated (not duplicate)
- Does NOT overwrite killed_at
- Does NOT clean broadcasts (no confirmed kill)
- Does clean sightings on create (tomb proves MVP dead)

**`update_kill_from_killer`:**
- Update existing kill with killer + time → action=updated, killed_at overwritten
- Update sentinel kill → was_sentinel=true, killed_at set, witnesses populated
- No existing kill + has valid time → creates new kill
- No existing kill + invalid/null time → action=ignored (don't create without time)
- Cleans broadcasts (confirmed kill with real time)

**`_find_kill_for_mvp`:**
- Finds sentinel kill (tier 1)
- Finds by tomb coords (tier 2)
- Finds by time window (tier 3)
- Returns NULL when nothing matches
- Does NOT match old cycle kills (respawn + delay + 10min expired)

**`reconstructKilledAt` (TypeScript):**
- Hour:minute BRT → correct UTC timestamp (same day)
- Crosses midnight: 23:50 BRT when now is 00:10 BRT → uses yesterday
- Outside respawn+10min window → returns null (rejects stale tomb)
- Null hour/minute → returns null

**Cross-RPC scenarios:**
- Tomb sentinel → Event arrives 3s later → sentinel found and updated
- Tomb sentinel → Killer click → sentinel found, time + killer set, witnesses populated
- Event creates kill → Tomb arrives → updates coords only, keeps killed_at
- UI manual kill (`/api/mvp-kills` INSERT) → unaffected by RPC changes

Executed via `supabase db query --linked` with ROLLBACK wrapping.

### Migration strategy

Single migration that:
1. Creates `_find_kill_for_mvp` helper
2. Creates the 3 new RPCs
3. Drops old `telemetry_register_kill`
4. Updates endpoint code to call the new RPCs

### Endpoint mapping

| Endpoint | Current | New |
|----------|---------|-----|
| `mvp-event` | `telemetry_register_kill(...)` | `register_kill_from_event(...)` |
| `mvp-tomb` | `telemetry_register_kill(...)` x2 | `update_kill_from_tomb(...)` x1 |
| `mvp-killer` | `telemetry_register_kill(...)` | `update_kill_from_killer(...)` |
| `mvp-kill` | `telemetry_register_kill(...)` | Deprecated |
