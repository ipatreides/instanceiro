# Game Identity Mapping

## Problem

The sniffer sends `char_id` (numeric) and `char_name` from game packets, but the Instanceiro backend has no way to link these to the registered characters (`characters` table) and accounts (`accounts` table). This causes:

- `character_name: null` in telemetry sessions
- `account_id: 0` when only 0x0AC5 is received (no 0x01F2)
- No way to attribute kills/sightings to specific registered characters
- "Char #0" phantom sessions

## Design

### Schema Changes

**Existing tables — new columns:**

```sql
ALTER TABLE accounts ADD COLUMN game_account_id INT UNIQUE;
ALTER TABLE characters ADD COLUMN game_char_id INT UNIQUE;
```

**New table:**

```sql
CREATE TABLE unresolved_game_characters (
  game_char_id    INT PRIMARY KEY,
  game_account_id INT,
  char_name       TEXT NOT NULL,
  char_level      INT,
  char_class      TEXT,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  group_id        UUID NOT NULL REFERENCES mvp_groups(id),
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Note: `game_account_id` is nullable in unresolved — the sniffer may not have the account_id yet when the CharacterList arrives.

### Resolution Prerequisites

The sniffer should wait for complete data before reporting:
- `char_id` + `char_name` (from 0x099D CharacterList — available immediately)
- `account_id` (from 0x01F2 — may arrive later)

The sniffer waits up to **30 seconds** after CharacterList for the 0x01F2 with matching char_id. If account_id arrives → report with full data. If timeout → report anyway with `account_id: 0`. The backend accepts both cases:
- With account_id: full resolution (name match + account link)
- Without account_id: name match only, account link deferred until account_id arrives (via heartbeat or later report)

### Resolution Flow

When the sniffer reports characters (via `report-characters`):

**Step 1: Match char by name**
- Search `characters` where `LOWER(name) = LOWER(char_name)` AND `user_id` = sniffer owner (from token)
- If found → set `characters.game_char_id` → resolved
- Then if `account_id != 0`: find the character's `account_id` FK → set `accounts.game_account_id` on that account row
  - If `accounts.game_account_id` already set to a DIFFERENT value by another user → do not overwrite, log warning
  - If `accounts.game_account_id UNIQUE` constraint fails → account already registered by another user, show "Conta já registrada por outro usuário. Contate o suporte."
- Emit config_stale event

**Step 2: Account known (game_account_id exists in accounts), char name no match**
- If `game_account_id` is already linked to an `accounts` row but the char name doesn't match any `characters` → insert into `unresolved_game_characters`
- Frontend shows: "Personagem não encontrado. Criar ou associar a existente?"

**Step 3: Account unknown, char name no match**
- Neither `game_account_id` nor `char_name` match anything → insert into `unresolved_game_characters`
- Frontend shows: "Personagem não encontrado. Criar personagem na sua conta?"

**Manual resolution (frontend):**
- User picks "Criar" → creates `characters` row + sets `game_char_id`, creates/updates `accounts` row + sets `game_account_id` → emit config_stale
- User picks "Associar a existente" → updates existing `characters.game_char_id` + renames character to match game name, sets `accounts.game_account_id` → emit config_stale
- On resolution → delete from `unresolved_game_characters`

### Config Stale Events

Both automatic resolution (name match) and manual resolution must mark the config as stale so the sniffer reloads its cache. Implementation: set a flag/timestamp on the telemetry token or user record that the heartbeat endpoint checks.

### API Changes

**New endpoint: `POST telemetry/report-characters`**

Called by sniffer after CharacterList (0x099D) AND account_id are available.

Request:
```json
{
  "account_id": 1595739,
  "characters": [
    { "char_id": 333489, "name": "spk.Detox", "level": 190, "class_id": 70 },
    { "char_id": 646186, "name": "spk.Methyd", "level": 93, "class_id": 66 }
  ]
}
```

Response:
```json
{
  "resolved": [
    { "game_char_id": 333489, "character_id": "uuid-...", "name": "spk.Detox", "game_account_id": 1595739 }
  ],
  "unresolved": [
    { "game_char_id": 646186, "char_name": "spk.Methyd", "game_account_id": 1595739 }
  ]
}
```

Endpoint is idempotent — calling twice with same data produces same result.

**Expanded: `GET telemetry/config`**

Adds to existing response:
```json
{
  "resolved_characters": [
    { "game_char_id": 333489, "game_account_id": 1595739, "character_id": "uuid-...", "name": "spk.Detox" }
  ],
  "unresolved_characters": [
    { "game_char_id": 646186, "game_account_id": 1595739, "char_name": "spk.Methyd" }
  ]
}
```

### Sniffer Changes

**Cache:**
- On startup: `GET telemetry/config` → populate `HashMap<u32, CachedCharInfo>` keyed by `game_char_id`
- `CachedCharInfo`: `{ game_account_id, name, character_id: Option<String> }`

**CharacterList (0x099D) + account_id collection:**
- When CharacterList received: store chars in memory, start 30s timer for account_id
- When 0x01F2 arrives with matching char_id: now have account_id → call report-characters immediately
- If 30s timeout with no account_id → call report-characters with account_id=0 (name match only)
- Update cache with response

**Heartbeat:**
- For each client: lookup `char_id` in cache → enrich with `account_id`, `name`
- If not in cache: send raw `char_id` with `account_id` from 0x01F2 (if available) or 0

**Config reload:**
- On `config_stale: true` from heartbeat → re-fetch config → update cache

### Frontend Changes (Telemetry Tab)

Show unresolved characters with actions:
- "Criar personagem" → creates character + account if needed, resolves
- "Associar a existente" → dropdown of user's characters, renames if needed, resolves

### Constraints

- `characters.game_char_id` is UNIQUE — one game char maps to one Instanceiro char
- `accounts.game_account_id` is UNIQUE — one game account maps to one Instanceiro account
- Match by name is case-insensitive and scoped to `user_id` from token
- `report-characters` is idempotent
- Sniffer only calls `report-characters` when it has both char list AND account_id (never with incomplete data)

### Future Work (TODO)

- `class_id` → `class_name` mapping (e.g., 70 → "Bioquímico"). Needs a reference table or hardcoded map.
- Shared accounts: currently `game_account_id UNIQUE` means only one Instanceiro account row can link to a game account. If the constraint fails, user sees "Conta já registrada por outro usuário. Contate o suporte." Future redesign needed for proper shared account support.

### Testing

**SQL (ROLLBACK):**
- Match by name → sets game_char_id + game_account_id on correct rows
- Known account, new char → creates unresolved
- Unknown account + char → creates unresolved
- Manual resolution (create) → deletes unresolved, creates character, sets game_char_id
- Manual resolution (associate) → deletes unresolved, updates existing character name + game_char_id
- Idempotent: same report twice → no duplicates, no errors
- Name match is case-insensitive
- report-characters with account_id=0 → name match only, no account link
- report-characters with account_id → full resolution (name + account)
- report-characters account_id UNIQUE conflict → error message, no overwrite

**TypeScript:**
- `report-characters` endpoint: full match, partial match, no match, idempotent
- `config` endpoint: returns resolved + unresolved lists
- Resolution API: create char, associate existing, config_stale emitted
- Heartbeat: config_stale flag set when resolution happened

**Rust (sniffer):**
- Cache populated from config response
- CharacterList stored, waits for account_id before reporting
- report-characters called with complete data only
- Heartbeat enriched from cache (account_id, name)
- Cache miss → sends raw char_id
- Config reload on config_stale updates cache
