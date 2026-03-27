# MVP Timer — Design Spec

## Summary

Second tab in Instanceiro for tracking Ragnarok Online MVP respawn timers. Groups of players share kill data, party composition, and loot records. Replaces the current Excel spreadsheet + Discord bot workflow.

## Phased Implementation

| Phase | Scope | Depends on |
|-------|-------|------------|
| 1 — Foundation | DB tables, MVP/map/drop seed data, groups, tab UI with timer list | — |
| 2 — Core Timer | Kill registration (modal with map), countdown timers, status system | Phase 1 |
| 3 — Party & Loot | Pre-configured parties, kill party confirmation, loot tracking | Phase 2 |
| 4 — Notifications | Discord bot posting to group channel, 15/10/5/0 min alerts | Phase 2 |

Each phase is a self-contained spec → plan → implementation cycle.

---

## Navigation

- Two tabs below the account/character bar: **"Instâncias"** (current) and **"MVPs"**
- Tab selection persists per session (not per character)
- The account/character bar stays visible — group membership is per character
- A character without a group sees only their own solo timers

## Groups

### Model

- **`mvp_groups`**: `id`, `name`, `created_by`, `alert_minutes` (int[], e.g. `{15,5,0}`), `discord_channel_id` (nullable), `created_at`
- **`mvp_group_members`**: `group_id`, `character_id`, `user_id`, `role` ('owner' | 'member'), `joined_at`

### Rules

- Every character starts in an implicit "solo group" (no group row needed — a character with no group membership sees only their own kills)
- Any user can create a named group and invite **accepted friends' characters** to it
- A character can belong to **one group at a time** (leave current to join another)
- The group owner configures: name, Discord channel, alert timing
- All group members can: register kills, edit kills (time/position/killer), view timers

### Invites

- Owner invites accepted friends' characters directly (no invite links)
- Invited character sees a notification to accept/decline
- On accept, character joins the group and sees shared timers

---

## MVP Data (Static)

### Source

Primary: `LATAM.json` from [RagnarokMvpTimer/frontend](https://github.com/RagnarokMvpTimer/frontend/blob/main/src/data/LATAM.json) — 73 MVPs with `id` (monster_id), `name`, `dbname`, spawn locations with `mapname` and `respawnTime` (ms).

Supplementary: Team Eclipse spreadsheet "MVPData" sheet — adds `delay` (spawn window variance, ~10 min for most MVPs).

### Table: `mvps`

```
id              SERIAL PRIMARY KEY
monster_id      INT NOT NULL (RO monster ID, e.g. 1086)
name            TEXT NOT NULL (display name, e.g. "Golden Thief Bug")
map_name        TEXT NOT NULL (e.g. "prt_sewb4")
respawn_ms      INT NOT NULL (base respawn time in milliseconds)
delay_ms        INT NOT NULL DEFAULT 600000 (spawn window variance, default 10 min)
level           INT
hp              INT
```

**One row per MVP+map combination.** Maya on `anthell02` and Maya on `gld_dun02` are two separate rows displayed as "Maya (Anthell 2)" and "Maya (Gld Dun 2)".

### Map Images

Source: Divine Pride `https://www.divine-pride.net/img/map/raw/{map_name}` — PNG images.

**Map sizes vary per map** (not uniform):
- `prt_sewb4`: 200×200
- `gef_fild10`: 400×400
- `anthell02`: 300×300
- `moc_pryd06`: 204×204
- `abbey03`: 240×240

Images are **downloaded at build/seed time** and stored in Supabase Storage or served statically. Not hotlinked from Divine Pride.

### Table: `mvp_map_meta`

```
map_name        TEXT PRIMARY KEY
image_url       TEXT NOT NULL (URL to stored map image)
width           INT NOT NULL (map width in tiles/pixels)
height          INT NOT NULL (map height in tiles/pixels)
```

### Coordinate System

RO maps use a tile-based coordinate system where each pixel of the raw minimap image = 1 game tile.

- Coordinates range from `(0, 0)` to `(width-1, height-1)`
- **Y-axis is inverted**: game Y=0 is the bottom of the map, but pixel Y=0 is the top of the image
- To plot coordinate `(X, Y)` on the image: `pixel_x = X`, `pixel_y = image_height - Y`
- To convert a click at `(pixel_x, pixel_y)` to game coordinates: `X = pixel_x`, `Y = image_height - pixel_y`

The modal scales the map image to fit (e.g. 200px rendered width for a 400×400 map), so coordinate conversion must account for the scale factor: `game_x = Math.round(pixel_x * (map_width / rendered_width))`.

### MVP Drops (Static)

Source: Divine Pride database — drops per MVP.

### Table: `mvp_drops`

```
id              SERIAL PRIMARY KEY
mvp_id          INT NOT NULL REFERENCES mvps(id)
item_id         INT NOT NULL (RO item ID)
item_name       TEXT NOT NULL
drop_rate       DECIMAL (percentage, e.g. 0.01 for 0.01%)
```

---

## Kill Registration

### Table: `mvp_kills`

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
group_id        UUID REFERENCES mvp_groups(id) (nullable — null for solo kills)
mvp_id          INT NOT NULL REFERENCES mvps(id)
killed_at       TIMESTAMPTZ NOT NULL
tomb_x          INT (nullable)
tomb_y          INT (nullable)
killer_character_id UUID (nullable — references characters(id), the character that got the kill)
registered_by   UUID NOT NULL REFERENCES characters(id) (who registered this entry)
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `mvp_kill_party`

```
kill_id         UUID REFERENCES mvp_kills(id) ON DELETE CASCADE
character_id    UUID REFERENCES characters(id)
PRIMARY KEY (kill_id, character_id)
```

### Table: `mvp_kill_loots`

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
kill_id         UUID REFERENCES mvp_kills(id) ON DELETE CASCADE
item_id         INT NOT NULL
item_name       TEXT NOT NULL
quantity        INT NOT NULL DEFAULT 1
claimed_by      UUID (nullable — references characters(id), for future spoil management)
```

### Registration Flow

Two entry points on each MVP row:
1. **Sword icon** (⚔) — "Matei agora" → opens modal with current time pre-filled
2. **Clock icon** (🕐) — "Informar horário" → opens modal with empty time field

**Modal contents (single modal):**

1. **Header**: MVP name, map name, estimated respawn window
2. **Map** (square, full width): clickable to plot tomb position. Bidirectional with X/Y inputs below.
3. **Inputs row** (tab-navigable): `HORA` | `X` | `Y`
4. **Killer**: badges of all group characters. Toggle select — max 1 selected, can deselect. No killer = unknown.
5. **Party**: pre-loaded from configured party (if exists). Each member is a toggle badge. Can add/remove.
6. **Loot** (optional): chips of possible drops for this MVP (from `mvp_drops`). Click to select what dropped.
7. **Footer**: Cancel | Confirm

### Edit

Any group member can edit a kill: time, position, killer. Opens same modal pre-filled with existing data.

### Delete

Group owner can delete a kill.

---

## Timer Display

### Layout: Hybrid (Option C)

**Section 1 — ATIVOS**: MVPs with a registered kill and active countdown. Sorted by nearest spawn.

Each row:
```
[border-color] MVP Name (Map)    coordenadas    countdown
```

Border color by status:
- **Green** (< 5 min to spawn window): spawning very soon
- **Yellow** (< 30 min): spawning soon
- **Copper** (> 30 min): in cooldown
- **Pulsing green** (spawn window reached): "Provavelmente vivo" — timer counts UP from 0

**Section 2 — SEM INFO**: MVPs without a recent kill. Collapsed as compact chips/tags. Clickable to register a kill.

### Search Bar

Above the timer list, same style as instance search. Filters by MVP name or map name.

### Timer Logic (Client-Side)

- `spawn_start = killed_at + respawn_ms`
- `spawn_end = killed_at + respawn_ms + delay_ms`
- **Before spawn_start**: show countdown to `spawn_start` → status: cooldown
- **Between spawn_start and spawn_end**: show "Pode nascer" → status: spawn window
- **After spawn_end**: show "Provavelmente vivo" + count-up timer → status: probably alive

**All countdowns are computed client-side** using `killed_at` from the database. No server-side timer needed. The only query is fetching the latest kill per MVP for the group.

### Kill Count / Statistics

Accumulated per MVP and per group member:
- Total kills per MVP (displayed as small badge on MVP row, e.g. "×417")
- Kill leaderboard per group (future, not in MVP)

---

## Pre-Configured Parties

### Table: `mvp_parties`

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
group_id        UUID NOT NULL REFERENCES mvp_groups(id)
name            TEXT NOT NULL (e.g. "MVP Hunters")
created_by      UUID NOT NULL
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Table: `mvp_party_members`

```
party_id        UUID REFERENCES mvp_parties(id) ON DELETE CASCADE
character_id    UUID REFERENCES characters(id)
PRIMARY KEY (party_id, character_id)
```

### Rules

- A group can have multiple parties (different compositions for different MVPs)
- Any group member can create/edit parties
- When registering a kill, the most recently used party is pre-loaded
- Party members are toggle badges — easily adjust who was present for that specific kill

---

## Discord Notifications

### Bot Integration

- The Instanceiro Discord bot (already exists for schedule notifications) is extended
- Group owner configures which Discord channel receives MVP alerts
- Bot must be present in the server (invited via OAuth)

### Alert Timing

Group owner selects from fixed options: **15 min**, **10 min**, **5 min**, and **on spawn** (0 min).
Stored as `alert_minutes` int array on `mvp_groups`, e.g. `{15, 5, 0}`.

### Message Format

```
🔴 @MVP Pharaoh (moc_pryd06)
⏰ Spawn em 5 minutos (14:36 ~ 14:46 BRT)
📍 Tumba: 12, 36
🗡️ Killer: spk.Detox
```

At spawn time (0 min alert):
```
🟢 @MVP Pharaoh (moc_pryd06) pode ter nascido!
📍 Última tumba: 12, 36
```

---

## Performance & Egress Strategy

**Critical constraint**: Supabase Free Plan with 5 GB egress/month. Current usage is ~2.8 GB in 3 days after optimizations. Every new feature must be egress-conscious.

### Principles

1. **Static data is cached aggressively** — MVPs, maps, drops never change during a session
2. **Timers are 100% client-side** — no polling for countdown updates
3. **Minimal realtime subscriptions** — one channel for MVP kills, debounced at 5s
4. **Specific column selects** — never `select("*")`
5. **RPCs over multiple queries** — single RPC call for complex data

### Egress Budget for MVP Timer

| Data | Frequency | Est. size | Strategy |
|------|-----------|-----------|----------|
| MVP list (73 rows) | Once per session | ~5 KB | Module-level cache, never refetch |
| Map images (PNG) | Once per session per map | ~3-5 KB each | Browser cache (Cache-Control), Supabase Storage |
| Drop list | Once per session | ~15 KB | Module-level cache |
| Active kills (group) | On mount + realtime events | ~2 KB | Single RPC, 5s debounce |
| Kill registration | User action | ~200 bytes | Write-only, no extra read |
| Party data | On mount | ~1 KB | Cache until group changes |

**Estimated additional egress per user per day**: ~50 KB (vs current ~300 KB for instances tab)

### Realtime

**One additional channel**: `mvp-kills-{group_id}`
- Listens on `mvp_kills` table filtered by `group_id`
- Debounced at 5s (same as schedules)
- Only active when MVP tab is selected

**No realtime for**: MVP data, maps, drops, parties (all cached or low-frequency)

### Data Fetching Pattern

```
Tab opened:
  1. Check module cache for MVPs, maps, drops → skip if cached
  2. Fetch latest kills for group (single RPC: get_group_active_kills)
  3. Subscribe to realtime channel for group kills
  4. All countdowns computed client-side from killed_at

Tab closed:
  - Unsubscribe realtime channel
  - Caches persist in memory
```

### RPC: `get_group_active_kills`

Returns the latest kill per MVP for a group, with party and loot data, in a single call. Avoids N+1 queries.

```sql
-- Returns: [{mvp_id, killed_at, tomb_x, tomb_y, killer_name, party_members, loots, kill_count}]
```

### Map Image Delivery

Options (in order of preference):
1. **Supabase Storage** with `Cache-Control: public, max-age=31536000` — browser caches for 1 year
2. **Static files** bundled in the Next.js app (`/public/maps/`) — zero Supabase egress
3. **CDN proxy** to Divine Pride — not recommended (dependency on external service)

**Recommendation**: Bundle map images in `/public/maps/` as static assets. ~73 maps × ~4 KB = ~292 KB total. Served by Vercel CDN with aggressive caching. Zero Supabase egress.

---

## Out of Scope

- Packet sniffer integration (future)
- Spoil/loot division management (future — uses `claimed_by` field)
- Custom MVPs per group
- Kill leaderboard UI
- Map with live player positions
- MVP spawn prediction algorithms
