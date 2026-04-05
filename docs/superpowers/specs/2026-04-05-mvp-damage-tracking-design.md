# MVP Damage Tracking — Design Spec

## Overview

Track and display damage dealt to MVPs during fights. The sniffer captures individual damage hits (skills + basic attacks) from all visible attackers, sends them to the backend on MVP death, and the frontend displays a damage breakdown panel with percentage bars and a cumulative damage chart in the MVP detail view.

**Key goals:**
- Know who dealt the most damage and who landed the first hit
- Aggregate data from multiple sniffers in the same group (dedup by server tick)
- Display cumulative damage over time as a line chart per attacker

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data scope | Own group only | Never mix data between groups |
| Multi-sniffer | Dedup by server tick | Same hit seen by N sniffers counts once |
| Send timing | Batch on MVP death | Single POST, includes all hits with elapsed_ms for timeline |
| Chart type | Cumulative line chart | Lines always go up, easy to compare contributions |
| Charting library | Recharts | React-native, declarative, tooltips/legends built-in |
| Hit storage | Individual hits, no cap/aggregation | Payloads are small (~37KB worst case), MVPs die infrequently |
| Panel position | Below map/coords in detail view | Side-by-side didn't work with available space |
| First hitter icon | Lucide Sword, duotone | Per Instanceiro icon guidelines |

## Sniffer Changes (Rust)

### Packet Capture

Already capturing damage from 5 packet types:

| Header | Type | Size | Damage offset |
|--------|------|------|---------------|
| 0x008A | Actor Action v0 | 29B | i16 @ [16-17] |
| 0x02E1 | Actor Action v1 | 33B | i32 @ [20-23] |
| 0x08C8 | Actor Action v2 | 34B | i32 @ [20-23] |
| 0x0114 | Skill Use v0 (ZC_NOTIFY_SKILL) | 31B | i32 @ [22-25] |
| 0x01DE | Skill Use v1 (ZC_NOTIFY_SKILL2) | 33B | i32 @ [22-25] |

### DamageDealt Event Changes

Add fields to `GameEvent::DamageDealt`:

```rust
DamageDealt {
    pid: u32,
    source_id: u32,
    target_id: u32,
    damage: i32,
    server_tick: u32,   // NEW: bytes [8-11] for action, [10-13] for skill
    skill_id: Option<u16>, // NEW: None for basic attacks, Some(id) for skills
}
```

### MvpDamageTracker Changes

Replace `damage_by_source: HashMap<u32, u64>` with individual hit storage:

```rust
pub struct DamageHit {
    pub source_name: String,     // resolved from actor_cache at hit time
    pub damage: i32,
    pub server_tick: u32,
    pub elapsed_ms: u64,         // tick - first_tick
    pub skill_id: Option<u16>,
}

pub struct MvpDamageTracker {
    pub monster_id: u32,
    pub monster_name: String,
    pub first_hitter_name: Option<String>,
    pub first_tick: Option<u32>,
    pub hits: Vec<DamageHit>,
}
```

### Filtering Rules

- **Only player → MVP**: skip hits where source is a monster (check actor_cache, only process if source actor_type == Player or source is not in cache but target IS the tracked MVP)
- **Skip self-damage**: skip when `source_id == target_id` (buffs like skill 252)
- **Resolve names at hit time**: actor may leave cache before MVP dies

### Payload Extension

When ActorDied fires for an MVP, include damage data in the existing `mvp-event` POST:

```json
{
  "monster_id": 1039,
  "map": "pay_dun04",
  "timestamp": 1712345678000,
  "tomb_x": 145,
  "tomb_y": 89,
  "damage_hits": [
    {
      "source_name": "Usen",
      "damage": 28476,
      "server_tick": 413007123,
      "elapsed_ms": 0,
      "skill_id": 2022
    },
    {
      "source_name": "MVPKiller1",
      "damage": 11914,
      "server_tick": 413007123,
      "elapsed_ms": 0,
      "skill_id": 2022
    }
  ],
  "first_hitter_name": "Usen"
}
```

Fields `damage_hits` and `first_hitter_name` are optional — kills without damage data continue working.

## Backend Changes (Next.js + Supabase)

### New Table: `mvp_kill_damage_hits`

```sql
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
```

Key design choices:
- Keyed by `source_name` (not `source_id`) because actor_ids are ephemeral (change each login)
- `UNIQUE` constraint enables `ON CONFLICT DO NOTHING` for dedup
- `ON DELETE CASCADE` cleans up hits when kill is deleted
- `reported_by` tracks which sniffer session sent each hit

### Column Addition: `mvp_kills.first_hitter_name`

```sql
ALTER TABLE mvp_kills ADD COLUMN first_hitter_name text;
```

Stored directly on the kill for quick access in history lists without querying damage_hits.

### Endpoint: `mvp-event` Extension

The existing POST `/api/telemetry/mvp-event` endpoint gets two new optional fields:

1. When kill is created OR found as duplicate:
   - Get the `kill_id` (new or existing)
   - If `damage_hits` array is present, INSERT all hits with `ON CONFLICT DO NOTHING`
   - If `first_hitter_name` is present and kill's `first_hitter_name` is null, UPDATE it

2. **Critical**: even when the kill itself is deduplicated (already exists), the damage hits MUST still be processed. This allows multiple sniffers to contribute complementary hit data to the same fight.

### Endpoint: `GET /api/telemetry/mvp-damage`

New endpoint to fetch damage data for a specific kill:

```
GET /api/telemetry/mvp-damage?kill_id=<uuid>
```

Response:

```json
{
  "kill_id": "uuid",
  "first_hitter": "Usen",
  "duration_ms": 23000,
  "sniffer_count": 2,
  "attackers": [
    { "name": "Usen", "total_damage": 172228, "pct": 70, "is_first_hitter": true },
    { "name": "MVPKiller1", "total_damage": 60585, "pct": 24, "is_first_hitter": false },
    { "name": "Kamundongos", "total_damage": 11445, "pct": 4, "is_first_hitter": false }
  ],
  "timeline": [
    { "elapsed_ms": 0, "Usen": 0, "MVPKiller1": 0, "Kamundongos": 0 },
    { "elapsed_ms": 1000, "Usen": 28476, "MVPKiller1": 11914, "Kamundongos": 0 },
    { "elapsed_ms": 2000, "Usen": 57463, "MVPKiller1": 23828, "Kamundongos": 5663 }
  ]
}
```

The `timeline` array is pre-aggregated server-side:
- Group hits into 1-second buckets by `elapsed_ms`
- Compute running cumulative sum per attacker
- Only include attackers with >=1% of total damage
- Others are omitted from timeline (shown only in bars as "Others")

`sniffer_count` = COUNT(DISTINCT reported_by) for this kill's hits.

### RLS Policy

Damage hits inherit access through the kill:
```sql
CREATE POLICY "Group members can view damage hits"
ON mvp_kill_damage_hits FOR SELECT
USING (
    kill_id IN (
        SELECT id FROM mvp_kills WHERE group_id IN (
            SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()
        )
    )
);
```

Insert is via service role (telemetry endpoint), no direct user insert.

## Frontend Changes (React + Recharts)

### New Dependency

```bash
npm install recharts
```

### New Component: `MvpDamagePanel`

**Location**: `src/components/mvp/mvp-damage-panel.tsx`

**Props**: `{ killId: string }`

**Behavior**:
- Fetches damage data from `/api/telemetry/mvp-damage?kill_id=xxx`
- Returns null if no data (kill has no damage hits)
- Shows loading skeleton while fetching

**Layout** (below map/coords in detail view):

```
┌─────────────────────────────────────────────────┐
│ Damage Breakdown                   23s · 3 atk  │
│                                                   │
│ Usen ⚔        ████████████████████  172k (70%)  │
│ MVPKiller1     ██████                 60k (24%)  │
│ Kamundongos    ██                     11k  (4%)  │
│ Others (2)     ▌                     258  (1%)  │
│                                                   │
│ ─────────────────────────────────────────────── │
│ Cumulative Damage                                │
│                                                   │
│  250k ┤              ___________  ← Usen         │
│  200k ┤         ____/                             │
│  150k ┤      __/                                  │
│  100k ┤    _/     ________  ← MVPKiller1          │
│   50k ┤  /   ___/                                 │
│     0 ┤_/___/___________  ← Kamundongos           │
│       └──┬──┬──┬──┬──┬──                         │
│         0s  6s 12s 18s 23s                        │
│                                                   │
│  ── Usen ⚔  ── MVPKiller1  ── Kamundongos       │
└─────────────────────────────────────────────────┘
```

### Design System Compliance

| Element | Token |
|---------|-------|
| Panel background | `bg-surface` |
| Panel border | `border-border` / `rounded-lg` |
| Chart background | `bg-bg` |
| Chart border | `border-border` / `rounded-md` |
| Section title | `text-primary` (Copper), font-weight 600 |
| Metadata labels | `text-text-secondary`, uppercase, letter-spacing 1.5px |
| Bar backgrounds | `bg-bg` with `border-border` |
| Player names | `text-text-primary`, font-weight 500 |
| Damage values | `text-text-primary` for numbers, `text-text-secondary` for percentages |
| "Others" row | `text-text-secondary` for name + values |
| First hitter icon | Lucide `Sword`, 12-14px, duotone (stroke `--primary`, fill `--primary` at 15%) |

### Chart Line Colors

Assigned in order of total damage DESC:

| Rank | Color | Token |
|------|-------|-------|
| 1st | Copper | `--primary` (#C87941) |
| 2nd | Jade | `--status-available` (#4a9a5a) |
| 3rd | Gold | `--status-soon` (#d4a843) |
| 4th | Amber | `--primary-secondary` (#E8A665) |
| 5th | Slate | `--text-secondary` (#7a7a8e) |
| 6th+ | Ember | `--status-error` (#c44040) |

### Recharts Configuration

```tsx
<LineChart data={timeline}>
  <XAxis dataKey="elapsed_ms" tickFormatter={ms => `${Math.round(ms/1000)}s`} />
  <YAxis tickFormatter={v => `${Math.round(v/1000)}k`} />
  <Tooltip />
  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
  {attackers.filter(a => a.pct >= 1).map((attacker, i) => (
    <Line
      key={attacker.name}
      type="monotone"
      dataKey={attacker.name}
      stroke={CHART_COLORS[i]}
      strokeWidth={2}
      dot={false}
    />
  ))}
</LineChart>
```

### Integration Point

In `mvp-tab.tsx`, render `<MvpDamagePanel killId={selectedKill.kill_id} />` below the existing map/coordinates section. Only renders when a kill is selected and the component internally handles the "no data" case by returning null.

## Testing

### Sniffer (Rust) — Unit Tests

**Packet parsers** (`src/packets/handlers/action.rs`):
- `parse_skill_damage_v0` — correct extraction of skill_id, source_id, target_id, damage, server_tick from 0x0114 payload
- `parse_skill_damage_v1` — same for 0x01DE payload
- Both: return None when damage <= 0
- Both: return None when payload too short
- Existing action parsers updated to include server_tick and skill_id

**MvpDamageTracker** (`src/state/processor.rs`):
- Accumulates hits from multiple sources into `hits: Vec<DamageHit>`
- Resolves source_name from actor_cache at hit time
- Records first_hitter_name on first hit
- Calculates elapsed_ms relative to first_tick
- Filters out self-damage (source_id == target_id)
- Filters out monster → player hits (only player → MVP)
- On ActorDied, produces correct damage summary

**Payload serialization**:
- `damage_hits` array serializes correctly in mvp-event JSON
- `first_hitter_name` included when present
- Omitted fields when no damage data (backward compatible)

### Backend (Next.js) — Integration Tests via Rollback

**Migration** (`mvp_kill_damage_hits` table):
- Table created with correct columns and constraints
- UNIQUE constraint on (kill_id, source_name, server_tick, damage)
- CASCADE delete works when kill is removed
- `first_hitter_name` column added to mvp_kills

**`mvp-event` endpoint with damage data**:
- Creates kill + inserts damage_hits in one request
- Duplicate kill still processes damage_hits (merge from second sniffer)
- ON CONFLICT DO NOTHING prevents duplicate hits
- Hits from sniffer A + sniffer B both present after both POST
- `first_hitter_name` set on kill record
- Request without `damage_hits` still works (backward compatible)

**`GET /api/telemetry/mvp-damage` endpoint**:
- Returns correct attacker breakdown (sorted by damage DESC)
- Percentages sum to ~100%
- Timeline aggregated into 1-second buckets with cumulative sums
- Only attackers >=1% included in timeline
- `first_hitter` field matches first_hitter_name on kill
- `sniffer_count` = distinct reported_by sessions
- Returns 404 or empty when kill has no damage data
- RLS: only group members can access

### Frontend — Component Tests

**`MvpDamagePanel`**:
- Renders damage bars in correct order (highest first)
- Shows Sword icon only on first hitter row
- "Others" row aggregates attackers below 1%
- Returns null when no damage data
- Shows loading skeleton while fetching
- Renders Recharts LineChart with correct number of lines (only >=1% attackers)
- Uses design system tokens (no hardcoded hex)

## Scope

### In Scope
- Capture skill + action damage in sniffer (5 packet types)
- Filter: only player → MVP, skip self-damage
- Send hits batch on MVP death via existing `mvp-event` endpoint
- Store individual hits with dedup by server tick
- Accept and merge hits from multiple sniffers per kill
- Store `first_hitter_name` on kill record
- New GET endpoint for formatted damage data
- `MvpDamagePanel` component with bars + cumulative chart
- Lucide Sword duotone icon for first hitter
- Recharts as charting library

### Out of Scope
- Real-time streaming during fights
- DPS per second chart (only cumulative)
- Cross-fight / historical DPS comparison
- Skill breakdown (which skills dealt most damage)
- Cross-group data sharing
- Light mode styling (follows existing token system automatically)

## Visual Mockups

Saved in `.superpowers/brainstorm/10445-1775350897/content/`:
- `mvp-damage-mockup-v4.html` — approved damage panel design (full width, below map)
- `mvp-damage-layout.html` — rejected side-by-side layout
