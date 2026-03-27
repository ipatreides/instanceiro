# MVP Timer — Design Spec

## Summary

Second tab in Instanceiro for tracking Ragnarok Online MVP respawn timers. Groups of players share kill data, party composition, and loot records. Replaces the current Excel spreadsheet + Discord bot workflow.

## Phased Implementation

| Phase | Scope | Depends on |
|-------|-------|------------|
| 1 — Foundation | DB tables, MVP/map/drop seed data, groups, tab UI with timer list | — |
| 2 — Core Timer | Kill registration (modal with map), countdown timers, status system | Phase 1 |
| 3 — Party & Loot | Pre-configured parties, kill party confirmation, loot tracking | Phase 2 |
| 4 — Notifications | Discord bot posting to group channel, alert queue + cron | Phase 2 |

Each phase is a self-contained spec → plan → implementation cycle.

---

## Navigation

- Two tabs below the account/character bar: **"Instâncias"** (current) and **"MVPs"**
- Tab selection persists per session (not per character)
- The account/character bar stays visible — group membership is per character
- The MVP tab shows timers for the **selected character's group**. Switching characters may show a different group's timers (or solo timers if the character has no group).
- A character without a group sees only their own solo timers (simplified UI: no party section, killer is a simple toggle "Eu matei" instead of group badges, loot optional)

## Groups

### Model

- **`mvp_groups`**: `id`, `name`, `server_id` (INT NOT NULL REFERENCES servers(id)), `created_by`, `alert_minutes` (INT, one of 15/10/5), `discord_channel_id` (nullable), `created_at`
- **`mvp_group_members`**: `group_id`, `character_id`, `user_id`, `role` ('owner' | 'member'), `joined_at`

### Server Isolation

- A group belongs to **one server** (implicit from the creator's character account)
- Only characters from the **same server** can be invited to the group
- The server is derived from: `character → account → server_id`
- Solo kills (no group) are also scoped by server via the character's account

### Rules

- Every character starts in an implicit "solo group" (no group row needed — a character with no group membership sees only their own kills, scoped to their server)
- Any user can create a named group and invite **accepted friends' characters from the same server** to it
- A character can belong to **one group at a time** (leave current to join another)
- The group owner configures: name, Discord channel, alert timing
- All group members can: register kills, edit kills (time/position/killer), view timers

### Invites

- Owner invites accepted friends' characters directly (no invite links)
- Only characters from the same server as the group are shown as invitable
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
server_id       INT NOT NULL REFERENCES servers(id)
monster_id      INT NOT NULL (RO monster ID, e.g. 1086)
name            TEXT NOT NULL (display name, e.g. "Golden Thief Bug")
map_name        TEXT NOT NULL (e.g. "prt_sewb4")
respawn_ms      INT NOT NULL (base respawn time in milliseconds)
delay_ms        INT NOT NULL DEFAULT 600000 (spawn window variance, default 10 min)
level           INT
hp              INT
UNIQUE(server_id, monster_id, map_name)
```

**One row per server+MVP+map combination.** Different servers may have different respawn times for the same MVP. Maya on `anthell02` and Maya on `gld_dun02` are two separate rows displayed as "Maya (Anthell 2)" and "Maya (Gld Dun 2)". Two different MVPs on the same map are also separate rows — the map image is shared but the timer entries are independent.

Seed data is initially populated from `LATAM.json` for all servers. Server-specific adjustments can be made via admin tooling (future).

### Map Images

Source: Divine Pride `https://www.divine-pride.net/img/map/raw/{map_name}` — PNG images.

**Map sizes vary per map** (not uniform):
- `prt_sewb4`: 200×200
- `gef_fild10`: 400×400
- `anthell02`: 300×300
- `moc_pryd06`: 204×204
- `abbey03`: 240×240

Images are **downloaded at seed time** and bundled as static assets in `/public/maps/{map_name}.png`. Served by Vercel CDN — zero Supabase egress. Deduplicated: ~50 unique maps for ~73+ MVP entries.

### Table: `mvp_map_meta`

```
map_name        TEXT PRIMARY KEY
width           INT NOT NULL (map width in tiles/pixels)
height          INT NOT NULL (map height in tiles/pixels)
```

No `image_url` needed — images are served from `/maps/{map_name}.png` by convention.

### Coordinate System

RO maps use a tile-based coordinate system where each pixel of the raw minimap image = 1 game tile.

- Coordinates range from `(0, 0)` to `(width-1, height-1)`
- **Y-axis is inverted**: game Y=0 is the bottom of the map, but pixel Y=0 is the top of the image
- To plot coordinate `(X, Y)` on the image: `pixel_x = X`, `pixel_y = image_height - Y`
- To convert a click at `(pixel_x, pixel_y)` to game coordinates: `X = pixel_x`, `Y = image_height - pixel_y`

The modal renders the map as a square. The coordinate conversion must account for the scale factor between rendered size and actual map dimensions: `game_x = Math.round(click_x * (map_width / rendered_width))`.

### MVP Drops (Static)

Source: Divine Pride API — `GET /api/database/Monster/{monster_id}?apiKey=KEY` returns `drops[]` with `itemId` and `chance`. Item names fetched via `GET /api/database/Item/{itemId}?apiKey=KEY`. API key available in `tong-calc-ro` project scripts.

Seed script fetches drops for all MVP `monster_id`s, resolves item names, and populates `mvp_drops`.

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
tomb_x          INT (nullable — optional tomb coordinates)
tomb_y          INT (nullable)
killer_character_id UUID (nullable — references characters(id), the character that got the kill)
registered_by   UUID NOT NULL REFERENCES characters(id) (who registered this entry)
edited_by       UUID (nullable — references characters(id), last editor)
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ
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

**Conflict check**: if the MVP already has an active timer (spawn window hasn't passed yet), show a warning: "Este MVP já tem timer ativo (spawna em Xmin). Substituir?" User confirms or cancels.

**Modal contents (single modal, top to bottom):**

1. **Header**: MVP name, map name, estimated respawn window
2. **Map** (square, full width): clickable to plot tomb position. Bidirectional with X/Y inputs.
3. **Inputs row** (tab-navigable, left to right): `HORA` | `X` | `Y`
4. **Killer**: badges of all group characters. Toggle select — click to select, click again to deselect. Max 1 selected. No killer = unknown.
5. **Party**: pre-loaded from configured party (if exists). Each member is a toggle badge. Can add/remove.
6. **Loot** (optional): chips of possible drops for this MVP (from `mvp_drops`). Click to select what dropped.
7. **Footer**: Cancel | Confirm

### Edit

Any group member can edit a kill: time, position, killer. Opens same modal pre-filled with existing data.

### Delete

Any group member can delete a kill.

---

## Timer Display

### Layout: Hybrid (Option C)

**Search bar** at the top — filters by MVP name or map name. Same style as instance search.

**Section 1 — ATIVOS**: MVPs with a registered kill and active/recent countdown. Sorted by nearest spawn.

Each row:
```
[border-color] MVP Name (Map)    coordenadas    countdown
```

Border color by status:
- **Green** (< 5 min to spawn window): spawning very soon
- **Yellow** (< 30 min): spawning soon
- **Copper** (> 30 min): in cooldown
- **Pulsing green** (spawn window reached, counting UP): "Provavelmente vivo"

**Section 2 — SEM INFO**: MVPs without a recent kill. Collapsed as compact chips/tags. Clickable to register a kill.

### Timer Logic (Client-Side)

- `spawn_start = killed_at + respawn_ms`
- `spawn_end = killed_at + respawn_ms + delay_ms`
- `tomb_expiry = spawn_start + 10 min` (tomb disappears ~10 min after spawn window opens)
- `card_expiry = spawn_start + 30 min` (card returns to inactive if no new kill)

**Status progression:**

| Phase | Condition | Display | Tomb coords | Border color |
|-------|-----------|---------|-------------|-------------|
| Cooldown | `now < spawn_start` | Countdown to `spawn_start` | Shown with highlight color | Copper (> 30min), Yellow (< 30min), Green (< 5min) |
| Spawn window | `spawn_start <= now < spawn_end` | "Pode nascer" | Shown with highlight color | Pulsing green |
| Probably alive | `spawn_end <= now < tomb_expiry` | "Provavelmente vivo" + count-up | Shown (dimmed) | Pulsing green (dimmed) |
| Tomb expired | `tomb_expiry <= now < card_expiry` | "Provavelmente vivo" + count-up | Hidden | Faded green |
| Auto-inactive | `now >= card_expiry` | — (moves to SEM INFO section) | — | — |

**All countdowns are computed client-side** using `killed_at` from the database. No server-side timer or polling needed. The only query is fetching the latest kill per MVP for the group.

### Accountability

Each timer row shows who registered/edited the kill:
- "por @ceceu" (small text, secondary color)
- On edit, updates to "editado por @duke"

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

Group owner selects **one** threshold: **15 min**, **10 min**, or **5 min** before spawn.
The spawn-time alert (0 min) is **always sent** in addition to the chosen threshold.
Stored as `alert_minutes` INT on `mvp_groups` (15, 10, or 5).

### Alert Delivery: Queue + External Cron

The current notification system is client-triggered (user action fires API call). MVP alerts are **time-based** — they must fire at specific times regardless of user activity.

**Architecture:**

1. **On kill registration**: calculate alert times and insert rows into `mvp_alert_queue`:
   ```
   id              UUID PRIMARY KEY
   group_id        UUID NOT NULL
   mvp_kill_id     UUID NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE
   alert_at        TIMESTAMPTZ NOT NULL (when to send)
   alert_type      TEXT NOT NULL ('pre_spawn' | 'spawn')
   sent            BOOLEAN DEFAULT false
   created_at      TIMESTAMPTZ DEFAULT NOW()
   ```
   Example: kill at 14:00, respawn 1h, group alert = 5min → two rows:
   - `alert_at = 14:55` (5 min before), `alert_type = 'pre_spawn'`
   - `alert_at = 15:00` (at spawn), `alert_type = 'spawn'`

2. **External cron (cron-job.org)**: calls `POST /api/mvp-alerts/process` every 1 minute.

3. **Process endpoint**: queries `mvp_alert_queue` for unsent alerts where `alert_at <= NOW()`. For each, sends Discord message to the group's configured channel and marks `sent = true`. Protected by a secret token in the request header.

4. **On kill edit/delete**: cascade deletes or recalculates queue entries.

**Resilience**: if the cron misses a cycle (1-2 min delay), the next execution picks up all pending alerts. Late alerts are still sent (better late than never).

### Message Format

Pre-spawn alert:
```
🔴 Pharaoh (moc_pryd06)
⏰ Spawn em 5 minutos (15:00 ~ 15:10 BRT)
📍 Tumba: 12, 36
🗡️ Killer: spk.Detox
```

Spawn alert:
```
🟢 Pharaoh (moc_pryd06) pode ter nascido!
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
6. **RLS kept simple** — avoid subqueries in RLS policies (lesson: a friendships subquery in characters RLS caused auth timeouts). Use SECURITY DEFINER RPCs for cross-user data access instead.

### Egress Budget for MVP Timer

| Data | Frequency | Est. size | Strategy |
|------|-----------|-----------|----------|
| MVP list (~73 rows) | Once per session | ~5 KB | Module-level cache, never refetch |
| Map images (PNG) | Once per session per map | ~3-5 KB each | Static files in /public/maps/, Vercel CDN, browser cache |
| Drop list | Once per session | ~15 KB | Module-level cache |
| Active kills (group) | On mount + realtime events | ~2 KB | Single RPC, 5s debounce |
| Kill registration | User action | ~200 bytes | Write-only, no extra read |
| Party data | On mount | ~1 KB | Cache until group changes |
| Alert processing (cron) | Every 1 min | ~500 bytes | Minimal: query queue + send Discord API |

**Estimated additional egress per user per day**: ~50 KB (vs current ~300 KB for instances tab)

### Realtime

**One additional channel**: `mvp-kills-{group_id}`
- Listens on `mvp_kills` table filtered by `group_id`
- Debounced at 5s (same as schedules)
- Only active when MVP tab is selected and character has a group

**No realtime for**: MVP data, maps, drops, parties, alert queue (all cached or server-side)

### Data Fetching Pattern

```
Tab opened (character has group):
  1. Check module cache for MVPs, maps, drops → skip if cached
  2. Fetch latest kills for group (single RPC: get_group_active_kills)
  3. Subscribe to realtime channel mvp-kills-{group_id}
  4. All countdowns computed client-side from killed_at

Tab closed or character switched:
  - Unsubscribe realtime channel
  - Caches persist in memory (static data)
  - Kill data refetched on next open (may be different group)
```

### RPC: `get_group_active_kills`

Returns the latest kill per MVP for a group, with party and loot data, in a single call. Avoids N+1 queries. Uses SECURITY DEFINER to bypass character RLS.

```sql
-- Returns: [{mvp_id, killed_at, tomb_x, tomb_y, killer_name, party_members, loots, kill_count}]
```

### Map Image Delivery

Static files bundled in `/public/maps/{map_name}.png`. ~50 unique maps × ~4 KB = ~200 KB total. Served by Vercel CDN with aggressive caching. Zero Supabase egress.

### RLS Strategy

| Table | RLS | Access pattern |
|-------|-----|---------------|
| `mvps` | SELECT for all authenticated | Static data, cached |
| `mvp_map_meta` | SELECT for all authenticated | Static data, cached |
| `mvp_drops` | SELECT for all authenticated | Static data, cached |
| `mvp_groups` | SELECT/UPDATE for members only | Via RPC |
| `mvp_group_members` | SELECT for group members | Via RPC |
| `mvp_kills` | SELECT for group members, INSERT for group members | Via RPC (SECURITY DEFINER) |
| `mvp_kill_party` | Same as kills | Joined in RPC |
| `mvp_kill_loots` | Same as kills | Joined in RPC |
| `mvp_parties` | SELECT/INSERT/UPDATE for group members | Direct query with simple RLS |
| `mvp_party_members` | Same as parties | Direct query |
| `mvp_alert_queue` | No RLS (server-only, accessed by API route with service role) | Service role key |

---

## Out of Scope

- Packet sniffer integration (future)
- Spoil/loot division management (future — uses `claimed_by` field)
- Custom MVPs per group
- Kill leaderboard UI
- Map with live player positions
- MVP spawn prediction algorithms
