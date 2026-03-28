# Telemetry Integration Design

Integrates the RO-PacketSniffer-CPP with Instanceiro's MVP timer system. The sniffer captures in-game events (MVP kills, tomb spawns, loot drops, killer identification) and forwards them to Instanceiro's API, which registers kills automatically in the user's group.

## Terminology

- **Telemetry**: the feature name for the sniffer-to-Instanceiro data pipeline
- **Sniffer**: RO-PacketSniffer-CPP, a Windows C++ app that captures game packets via Npcap
- **Pairing**: one-time browser-based authentication linking a sniffer instance to an Instanceiro user
- **Session**: an active sniffer connection for a specific character, tracked by heartbeat

## Phases

- **Phase 1**: Telemetry pipeline (API routes, data model, sniffer handlers, group UI, server-driven config)
- **Phase 2**: Sniffer packaging (installer, auto-detect network, zero-config UX for non-technical users)

This spec covers Phase 1. Phase 2 is documented as constraints at the end.

---

## Architecture

```
┌─────────────────────┐         ┌────────────────────────────┐        ┌──────────┐
│  ROSniffer.exe      │  HTTP   │  Instanceiro (Next.js)     │        │ Supabase │
│                     │  POST   │                            │        │          │
│  1. ActorDied ──────┼────────►│ /api/telemetry/mvp-kill    ├───────►│mvp_kills │
│     + ItemAppeared  │  batch  │   (kill + loots + party)   │        │mvp_kill_*│
│  2. Tomb NPC 565 ───┼────────►│ /api/telemetry/mvp-tomb    ├───────►│  update  │
│  3. Tomb click ─────┼────────►│ /api/telemetry/mvp-killer  ├───────►│  update  │
│  4. Heartbeat ──────┼────────►│ /api/telemetry/heartbeat   ├───────►│  upsert  │
│  0. Init ───────────┼────────►│ GET /api/telemetry/config  │        │          │
│                     │         │                            │        │          │
│ Headers:            │         │ Resolves:                  │        │          │
│  X-API-TOKEN        │         │  token → user → character  │        │          │
│  X-ACCOUNT-ID       │         │  character → group         │        │          │
│  X-CHARACTER-ID     │         │  monster_id → mvp_id       │        │          │
└─────────────────────┘         └────────────────────────────┘        └──────────┘
```

### Server-Driven Config

The sniffer is a thin client. All filtering logic is configured server-side and consumed via `/api/telemetry/config`. Changes propagate without sniffer redeploy via the `config_version` mechanism in the heartbeat.

---

## Authentication: Pairing Flow

Zero-config authentication via browser redirect (no manual token copying).

### Flow

1. Sniffer starts without a saved token
2. Starts a local HTTP server on a random port (e.g., `localhost:48721`)
3. Generates a `pairing_code` (UUID short, e.g., `A3F7-X9K2`, TTL 5 minutes)
4. Opens the user's default browser to `instanceiro.com/telemetry/pair?code=A3F7-X9K2&callback=http://localhost:48721/callback`
5. User logs into Instanceiro (or is already logged in)
6. Page shows: "Conectar sniffer? Codigo: A3F7-X9K2" with a confirm button
7. On confirm, backend generates an API token, associates it with the user, marks the pairing code as resolved
8. Browser redirects to `http://localhost:48721/callback?token=<api_token>`
9. Sniffer receives the token, saves it to `config.json`, shuts down the local HTTP server
10. Subsequent runs: token already exists, skip pairing, go straight to `/api/telemetry/config`

### Token Revocation & Re-pairing

- If any API call returns 401, the sniffer clears the saved token and re-initiates pairing
- Users can revoke tokens from the Instanceiro settings page
- One user can have multiple tokens (multiple machines)

---

## Data Model

### New table: `telemetry_tokens`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `user_id` | UUID FK → auth.users | Token owner |
| `token_hash` | TEXT UNIQUE | SHA-256 of the token (never store plaintext) |
| `name` | TEXT nullable | User label ("PC do Marcel", "Notebook") |
| `pairing_code` | TEXT nullable | Short code for pairing flow, TTL 5 min |
| `pairing_callback` | TEXT nullable | localhost callback URL during pairing |
| `pairing_expires_at` | TIMESTAMPTZ nullable | Pairing code expiry |
| `created_at` | TIMESTAMPTZ | |
| `last_used_at` | TIMESTAMPTZ | Updated on each API request |
| `revoked_at` | TIMESTAMPTZ nullable | Soft-delete |

### New table: `telemetry_sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | |
| `token_id` | UUID FK → telemetry_tokens | |
| `user_id` | UUID FK → auth.users | Denormalized for query convenience |
| `character_id` | INT | Active character (from game packet) |
| `account_id` | INT | Account ID (from game packet) |
| `group_id` | UUID FK → mvp_groups | Resolved group |
| `current_map` | TEXT nullable | Current map (from heartbeat) |
| `config_version` | INT | Incremented when group config changes |
| `last_heartbeat` | TIMESTAMPTZ | |
| `started_at` | TIMESTAMPTZ | |

- One session per (token_id, character_id) — upserted on heartbeat
- Telemetry "online" = `last_heartbeat` within last 2 minutes
- Multiple sessions possible (2 game clients, 2 characters)

### Alterations to `mvp_kills`

| New column | Type | Description |
|------------|------|-------------|
| `source` | TEXT DEFAULT 'manual' | `'manual'` or `'telemetry'` |
| `telemetry_session_id` | UUID nullable FK → telemetry_sessions | Which session registered the kill |
| `killer_name_raw` | TEXT nullable | Killer name from tomb click (fallback when character not in group) |

### Alterations to `mvp_kill_loots`

| New column | Type | Description |
|------------|------|-------------|
| `source` | TEXT DEFAULT 'manual' | `'manual'` or `'telemetry'` |
| `accepted` | BOOLEAN nullable | null = pending suggestion, true = accepted, false = rejected |

Loots from telemetry enter with `source='telemetry'` and `accepted=null`. When the user confirms them in the UI, `accepted` is set to `true` and they become active. Rejected loots get `accepted=false`.

---

## API Routes

All telemetry endpoints share common headers:

```
X-API-TOKEN: <token>
X-ACCOUNT-ID: <account_id>
X-CHARACTER-ID: <character_id>
Content-Type: application/json
```

The backend resolves on every request: token → user → character → group. The `last_used_at` on the token is updated.

### GET /api/telemetry/config

Called on sniffer startup and whenever `config_version` changes.

**Request:** Headers only (account_id and character_id as query params).

**Response (200):**

```json
{
  "config_version": 5,
  "server_id": 1,
  "group_id": "uuid",
  "events": {
    "mvp_kill": {
      "enabled": true,
      "monster_ids": [1511, 1039, 1583],
      "batch_window_ms": 3000
    },
    "mvp_tomb": {
      "enabled": true,
      "npc_id": 565
    },
    "mvp_killer": {
      "enabled": true
    },
    "heartbeat": {
      "interval_ms": 60000
    }
  }
}
```

**Server-side logic:**
1. Validates token
2. Resolves character → group
3. Queries `mvps` table for the group's server → builds `monster_ids` list
4. Returns event config with current `config_version`
5. Creates/updates `telemetry_sessions` entry

**Error responses:** 401 (invalid/revoked token), 404 (character not in a group).

### POST /api/telemetry/mvp-kill

Main event. Sent after ActorDied for an MVP, batched with loots and party from a configurable window (default 3s).

**Request:**

```json
{
  "mvp_id": 42,
  "monster_id": 1583,
  "map": "beach_dun",
  "x": 153,
  "y": 90,
  "timestamp": 1711612800,
  "loots": [
    { "item_id": 7444, "amount": 1 },
    { "item_id": 607, "amount": 2 }
  ],
  "party_character_ids": [456, 789, 123]
}
```

**Server-side logic:**

1. Validate mvp_id exists for the group's server
2. **Dedup**: query `mvp_kills` for same `mvp_id` in group within last 30 seconds → if exists, return `{ "action": "dedup" }` (200)
3. **Overwrite**: if active kill exists for this MVP (older than 30s) → delete it (cascades to loots, party, alert queue)
4. Insert into `mvp_kills` with `source='telemetry'`, `telemetry_session_id`
5. Insert loots into `mvp_kill_loots` with `source='telemetry'`, `accepted=null`
6. Insert party into `mvp_kill_party`
7. Trigger `queue_mvp_alerts` fires automatically

**Response (201):**

```json
{ "action": "created", "kill_id": "uuid" }
```

### POST /api/telemetry/mvp-tomb

Sent when NPC ID matching `events.mvp_tomb.npc_id` (default 565) appears on the map.

**Request:**

```json
{
  "map": "beach_dun",
  "tomb_x": 153,
  "tomb_y": 90,
  "timestamp": 1711612800
}
```

**Server-side logic:**

1. Find the most recent `mvp_kills` in the group on this map without `tomb_x`/`tomb_y`, within 2 minutes
2. If found → update with tomb coordinates
3. If not found → ignore (kill might belong to another group)

**Response (200):**

```json
{ "action": "updated", "kill_id": "uuid" }
```

### POST /api/telemetry/mvp-killer

Sent when the player clicks a tomb. The sniffer captures the last NPC_TALK message before NPC_TALK_CLOSE (packet 0x00B6) — the killer name is always plaintext in that position.

**Request:**

```json
{
  "map": "beach_dun",
  "tomb_x": 153,
  "tomb_y": 90,
  "killer_name": "Borjukes"
}
```

**Server-side logic:**

1. Find kill by matching `tomb_x`/`tomb_y` + `map` in the group
2. Resolve `killer_name` to a `character_id` (match against group members' character names)
3. If resolved → update `killer_character_id` on the kill
4. If not resolved (killer not in the group) → store `killer_name` in a `killer_name_raw` TEXT column on `mvp_kills`, leave `killer_character_id` null. UI displays the raw name as fallback.

**Response (200):**

```json
{ "action": "updated", "kill_id": "uuid", "killer_resolved": true }
```

### POST /api/telemetry/heartbeat

Sent every `events.heartbeat.interval_ms` (default 60s).

**Request:**

```json
{
  "account_id": 123,
  "character_id": 456,
  "current_map": "prontera",
  "config_version": 5
}
```

**Server-side logic:**

1. Upsert `telemetry_sessions`: update `last_heartbeat`, `current_map`
2. Return current `config_version`

**Response (200):**

```json
{
  "status": "ok",
  "config_version": 5
}
```

If the returned `config_version` differs from the request, the sniffer refetches GET `/api/telemetry/config`.

### POST /api/telemetry/pair (browser-side)

Called by the Instanceiro web page when the user confirms pairing.

**Request (from browser, authenticated via session):**

```json
{
  "pairing_code": "A3F7-X9K2"
}
```

**Server-side logic:**

1. Validate pairing code exists and is not expired
2. Generate API token (UUID v4)
3. Store SHA-256 hash in `telemetry_tokens`
4. Redirect browser to the `pairing_callback` URL with `?token=<plaintext_token>`

---

## Sniffer-Side Implementation

### Initialization Flow

1. Check `config.json` for saved `api_token`
2. If missing → start pairing flow (local HTTP server + browser)
3. If present → GET `/api/telemetry/config`
   - 401 → clear token, restart pairing
   - 200 → store config in memory, start event processing
4. Store MVP monster_ids as `std::unordered_set<uint16_t>` for O(1) lookup
5. Start heartbeat timer

### Event Handlers

**MVP Kill (ActorDied handler):**

1. `ActorDied` fires → `ActorCache::get(actor_id)` → get `monster_id`, `x`, `y`
2. Check `monster_id` against config's `monster_ids` set → if not in set, skip
3. Open a batch window (`batch_window_ms`, default 3s)
4. During window, collect `ItemAppeared` events near the death location (existing `DropTracker` spatial correlation: ≤5 tiles, ≤2s)
5. Collect current party members (if party cache available — see Open Questions)
6. POST `/api/telemetry/mvp-kill` with all collected data

**MVP Tomb (ActorInfo handler):**

1. `ActorInfo` fires for NPC with type_id matching config's `npc_id` (default 565)
2. Extract coordinates from the packet
3. POST `/api/telemetry/mvp-tomb`

**MVP Killer (GameMessage handler):**

1. On `NPC_TALK_CLOSE` (0x00B6), check if the NPC actor_id matches a recently detected tomb
2. The last `NPC_TALK` message before the CLOSE contains the killer name in plaintext
3. POST `/api/telemetry/mvp-killer` with the extracted name and tomb coordinates

**Heartbeat (timer thread):**

1. Every `interval_ms` → POST `/api/telemetry/heartbeat` with current map and config_version
2. If response `config_version` differs → refetch GET `/config`

### Offline Queue

When any API call fails (network error, 5xx), the event is persisted to a local file (`telemetry_queue.json`). On next successful heartbeat, queued events are replayed in order. MVP kills are rare and valuable — they must not be lost.

Queue entries include the full request payload + target endpoint + timestamp. Entries older than 24h are discarded (the data is too stale to be useful).

### Multiple Game Clients

The sniffer already tracks game connections by PID (destination port → PID via `GetExtendedTcpTable`). Each PID maps to a different `character_id` via `ReceivedCharIdAndMap` packets. Telemetry events include the correct `X-CHARACTER-ID` header per connection, so each character's events route to the correct group.

---

## Deduplication & Conflict Resolution

| Scenario | Resolution |
|----------|------------|
| Two sniffers see same MVP die (same group, same map) | 30-second dedup window on `mvp_id` + `group_id`. Second request returns `{ "action": "dedup" }` |
| Duplicate loot from two sniffers | Kill dedup prevents the second kill, so second loot batch never arrives |
| Telemetry kill arrives but manual kill exists for same MVP | Telemetry overwrites (sniffer is more reliable and has loots + coords) |
| Manual kill arrives but telemetry kill exists | Manual kill overwrites (user explicitly chose to register) |
| Tomb coords for a kill that doesn't exist | Ignored (kill might belong to another group) |
| Killer name doesn't match any group member | Stored as metadata text, `killer_character_id` left null |

---

## UI Changes

### Telemetry Status in Group Members

When a member has an active telemetry session (`last_heartbeat` < 2 minutes):

- Pulsing green dot next to their name in the group member list
- Tooltip: "Telemetria ativa — beach_dun" (current map from heartbeat)
- If multiple characters from the same user: show each with its map

### Loot Suggestion Badge on Timer

When a telemetry kill has pending loots (`accepted = null`):

- Small badge on the timer row: "3 drops" in secondary color
- Clicking the timer opens the kill modal with loots pre-selected for confirmation
- User can accept all, reject individually, or edit
- Accepting copies loots to active state (`accepted = true`)

### Source Indicator on Timer

Kills from telemetry show a subtle antenna/signal icon next to the timestamp. Tooltip: "Registrado via telemetria por [character_name]".

### Telemetry Settings Page

Accessible from group settings or user profile:

- List of active tokens: name, created date, last used
- "Gerar novo token" button → opens pairing flow instructions
- "Revogar" button per token (with displaced confirmation pattern)
- Active sessions: character name, current map, last heartbeat
- Download link for the sniffer (Phase 2)

---

## Packet Discovery Reference

Confirmed via live packet capture (2026-03-28):

### MVP Kill — ActorDied (0x0080)

```
Packet: 4 bytes actor_id + 1 byte death_type
death_type == 1 → actual death
ActorCache lookup → monster_id, name, x, y
```

Already implemented in `ActorDied.cpp`. Needs: API call when monster_id is in config's MVP list.

### MVP Loot — ItemAppeared (0x009E and variants)

```
Packet: 4 bytes object_id + 2 bytes item_id + 1 byte identified + 2 bytes x + 2 bytes y + ...
```

Already implemented in `ItemAppeared.cpp`. `DropTracker` correlates drops to deaths by proximity (≤5 tiles) and time (≤2s). Needs: forwarding correlated MVP drops to the batch.

### MVP Tomb — ActorInfo NPC 565

```
ActorInfo extended packet, actor_type == NPC, type_id == 565
Coordinates extracted from packet (same as monster position fields)
```

Already detected in `ActorInfo.cpp` (`report_npc()`, MVP_TOMB_NPC_ID = 565). Needs: API call with coordinates.

### Tomb Click — NPC_TALK (0x00B4) + NPC_TALK_CLOSE (0x00B6)

Clicking a tomb produces 5 NPC_TALK messages followed by NPC_TALK_CLOSE:

```
NPC_TALK #1: MVP name (encoded, 1C/1D delimiters — not needed, we know MVP from kill)
NPC_TALK #2: Unknown short field (encoded)
NPC_TALK #3: Kill time (encoded — not needed, we have timestamp from ActorDied)
NPC_TALK #4: Unknown short field (encoded)
NPC_TALK #5: Killer character name (PLAINTEXT — this is what we extract)
NPC_TALK_CLOSE: end of dialog
```

The killer name is always the last NPC_TALK before CLOSE, and it is not encoded. The sniffer needs to buffer NPC_TALK messages per NPC actor_id and extract the last one on CLOSE.

---

## Security

- API tokens stored as SHA-256 hash in database, never plaintext
- Pairing codes expire after 5 minutes
- Localhost callback only accepts the expected pairing code
- 401 response triggers automatic re-pairing (token revoked or expired)
- Rate limiting on all telemetry endpoints (to be defined per endpoint)
- Server-side validation: character must belong to the group, mvp_id must exist for the server
- Pairing page requires authenticated Instanceiro session

## Resilience

- Local offline queue with disk persistence and 24h TTL
- Server-side dedup (30s window) protects against multiple sniffers
- Heartbeat with `config_version` detects group changes without restart
- Graceful degradation: if telemetry is down, manual kill registration still works

---

## Open Questions

### Party Members Auto-Detection

The sniffer receives party-related packets (`PARTY_MEMBER_INFO`, `PARTY_MEMBER_LIST`, etc. in `ReceivePacketTable`). If a party cache exists or can be built (similar to `ActorCache`), the sniffer can auto-fill `party_character_ids` in the mvp-kill event. If not available, this field is omitted and the user fills it manually.

**Status**: Not verified in code. Needs investigation of party packet handlers before implementation. The feature works without it (manual fallback), so it's not blocking.

---

## Phase 2 Constraints: Sniffer Packaging

Phase 2 is a separate implementation cycle focused on making the sniffer installable by non-technical users:

- **Single .exe installer** (NSIS or similar): next → next → finish
- **Npcap bundled** or auto-installed as dependency (with driver signing)
- **Auto-detect network interface**: find the interface with traffic to the RO server IPs (no manual device_id selection)
- **Zero manual configuration**: no editing config.json, no pasting tokens, no choosing interfaces
- **First-run UX**: sniffer detects no token → opens browser for pairing → receives token → fetches config → running. Three clicks total.
- **Token stored in user-scoped location** (AppData) rather than next to the executable
- **Auto-update mechanism** (for the rare cases where a sniffer redeploy is needed)
