# Telemetry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the RO-PacketSniffer-CPP to automatically register MVP kills, tomb coordinates, killer identity, and loot in Instanceiro via HTTP telemetry API.

**Architecture:** The sniffer sends events to Next.js API routes that validate tokens, resolve user/character/group context, and write to Supabase. Server-driven config controls sniffer behavior. Pairing uses a browser redirect + exchange code pattern for zero-config auth.

**Tech Stack:** Next.js 16 API routes, Supabase (PostgreSQL), C++20 with libcurl, Npcap

**Spec:** `docs/superpowers/specs/2026-03-28-telemetry-integration-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260328000000_telemetry_tables.sql` | Create | telemetry_tokens, telemetry_sessions, alter mvp_kills + mvp_kill_loots |
| `supabase/migrations/20260328100000_items_reference.sql` | Create | items reference table + seed data |
| `src/lib/telemetry.ts` | Create | Shared auth: resolve token → user → character → group |
| `src/lib/types.ts` | Modify | Add telemetry-related types |
| `src/app/api/telemetry/config/route.ts` | Create | GET — return server-driven config |
| `src/app/api/telemetry/heartbeat/route.ts` | Create | POST — upsert session, return config_version |
| `src/app/api/telemetry/mvp-kill/route.ts` | Create | POST — register kill + loots + party |
| `src/app/api/telemetry/mvp-tomb/route.ts` | Create | POST — update kill with tomb coords |
| `src/app/api/telemetry/mvp-killer/route.ts` | Create | POST — update kill with killer name |
| `src/app/api/telemetry/pair/route.ts` | Create | POST — confirm pairing from browser |
| `src/app/api/telemetry/pair/exchange/route.ts` | Create | POST — exchange code → token |
| `src/app/api/telemetry/pair/initiate/route.ts` | Create | POST — create pairing code + callback |
| `src/app/telemetry/pair/page.tsx` | Create | Pairing confirmation UI page |
| `src/hooks/use-telemetry-sessions.ts` | Create | Hook to query active telemetry sessions for group |
| `src/hooks/use-mvp-timers.ts` | Modify | Add loot accept/reject functions |
| `src/components/mvp/mvp-timer-row.tsx` | Modify | Source indicator + loot suggestion badge |
| `src/components/mvp/mvp-group-hub.tsx` | Modify | Telemetry status dots on members |
| `src/components/mvp/telemetry-settings.tsx` | Create | Token management UI |
| `src/components/mvp/mvp-kill-modal.tsx` | Modify | Show/accept/reject telemetry loot suggestions |

**Sniffer files (D:\rag\RO-PacketSniffer-CPP\):**

| File | Action | Responsibility |
|------|--------|---------------|
| `src/public/telemetry/TelemetryClient.h` | Create | Main telemetry singleton: config, auth, send events |
| `src/private/telemetry/TelemetryClient.cpp` | Create | Implementation |
| `src/public/telemetry/TelemetryQueue.h` | Create | Offline queue with disk persistence |
| `src/private/telemetry/TelemetryQueue.cpp` | Create | Implementation |
| `src/public/telemetry/PairingServer.h` | Create | Local HTTP server for pairing callback |
| `src/private/telemetry/PairingServer.cpp` | Create | Implementation |
| `src/public/telemetry/TombTracker.h` | Create | Buffers NPC_TALK per actor_id, extracts killer on CLOSE |
| `src/private/telemetry/TombTracker.cpp` | Create | Implementation |
| `src/private/packets/receive/ActorDied.cpp` | Modify | Add telemetry MVP kill event |
| `src/private/packets/receive/ActorInfo.cpp` | Modify | Add telemetry tomb event |
| `src/private/packets/receive/GameMessage.cpp` | Modify | Buffer NPC_TALK, detect tomb click killer |
| `src/private/packets/receive/ItemAppeared.cpp` | Modify | Notify telemetry of MVP drops |
| `src/private/gameplay/DropTracker.cpp` | Modify | Expose MVP drop correlation to telemetry |
| `src/main.cpp` | Modify | Add telemetry init + --telemetry flag |
| `CMakeLists.txt` | Modify | Add new telemetry source files |

---

## Part A: Instanceiro Backend

### Task 1: Database migration — telemetry tables

**Files:**
- Create: `supabase/migrations/20260328000000_telemetry_tables.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- Telemetry: tokens, sessions, and alterations to existing tables
-- ============================================================

-- Telemetry API tokens (one per sniffer instance)
CREATE TABLE telemetry_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  pairing_code TEXT,
  pairing_callback TEXT,
  pairing_expires_at TIMESTAMPTZ,
  exchange_code TEXT,
  exchange_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_telemetry_tokens_user ON telemetry_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_telemetry_tokens_pairing ON telemetry_tokens(pairing_code) WHERE pairing_code IS NOT NULL;
CREATE INDEX idx_telemetry_tokens_exchange ON telemetry_tokens(exchange_code) WHERE exchange_code IS NOT NULL;

-- Telemetry sessions (one per active character per token)
CREATE TABLE telemetry_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES telemetry_tokens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id INT NOT NULL,
  account_id INT NOT NULL,
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  current_map TEXT,
  config_version INT NOT NULL DEFAULT 1,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token_id, character_id)
);

CREATE INDEX idx_telemetry_sessions_group ON telemetry_sessions(group_id);
CREATE INDEX idx_telemetry_sessions_heartbeat ON telemetry_sessions(last_heartbeat);

-- Alter mvp_kills: add source tracking
ALTER TABLE mvp_kills
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN telemetry_session_id UUID REFERENCES telemetry_sessions(id) ON DELETE SET NULL,
  ADD COLUMN killer_name_raw TEXT;

-- Alter mvp_kill_loots: add source + acceptance tracking
ALTER TABLE mvp_kill_loots
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN accepted BOOLEAN;

-- No RLS on telemetry tables — accessed only via service role from API routes
-- (same pattern as mvp_alert_queue)
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard)
Expected: Tables created, columns added.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260328000000_telemetry_tables.sql
git commit -m "feat: add telemetry tables and alter mvp_kills/loots"
```

---

### Task 2: Items reference table

**Files:**
- Create: `supabase/migrations/20260328100000_items_reference.sql`

- [ ] **Step 1: Create the items table migration**

```sql
-- ============================================================
-- Items reference table for item_id → name resolution
-- ============================================================

CREATE TABLE items (
  item_id INT PRIMARY KEY,
  name_pt TEXT NOT NULL
);

-- Seed with MVP-relevant items (from Divine Pride bRO data)
-- This covers all known MVP drops + common valuable items
INSERT INTO items (item_id, name_pt) VALUES
  (604, 'Fruta de Yggdrasil'),
  (607, 'Baga de Yggdrasil'),
  (608, 'Semente de Yggdrasil'),
  (616, 'Album de Carta Antigo'),
  (617, 'Album de Carta Antigo'),
  (7444, 'Album de Carta Antigo'),
  (12103, 'Caixa de Velocidade'),
  (12016, 'Caixa de Velocidade Aprimorada'),
  -- MVP cards (add all known MVP card item IDs)
  (4134, 'Carta Baphomet'),
  (4142, 'Carta Doppelganger'),
  (4148, 'Carta Mistress'),
  (4147, 'Carta Maya'),
  (4131, 'Carta Osiris'),
  (4143, 'Carta Pharaoh'),
  (4146, 'Carta Moonlight Flower'),
  (4137, 'Carta Eddga'),
  (4153, 'Carta Golden Thief Bug'),
  (4135, 'Carta Drake'),
  (4168, 'Carta Orc Hero'),
  (4144, 'Carta Phreeoni'),
  (4154, 'Carta Orc Lord'),
  (4133, 'Carta Dark Lord'),
  (4305, 'Carta Tao Gunka'),
  (4357, 'Carta Detardeurus'),
  (4359, 'Carta Ktullanux'),
  (4361, 'Carta Thanatos'),
  (4363, 'Carta Lady Tanee'),
  (4365, 'Carta Ifrit'),
  (4367, 'Carta Beelzebub'),
  (4372, 'Carta Fallen Bishop'),
  (4374, 'Carta Bacsojin'),
  (4376, 'Carta Vesper'),
  (4386, 'Carta RSX-0806'),
  (4399, 'Carta Valkyrie Randgris'),
  (4302, 'Carta Turtle General'),
  (4318, 'Carta Lord of the Dead'),
  (4169, 'Carta Dracula'),
  (4330, 'Carta Evil Snake Lord'),
  (4352, 'Carta Amon Ra')
ON CONFLICT (item_id) DO NOTHING;
```

Note: This is a starter set. More items can be added incrementally via SQL INSERT. The fallback for unknown items is `'Item #<id>'`.

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260328100000_items_reference.sql
git commit -m "feat: add items reference table with MVP drop names"
```

---

### Task 3: Telemetry auth helper + types

**Files:**
- Create: `src/lib/telemetry.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add telemetry types to types.ts**

Append to `src/lib/types.ts`:

```typescript
// Telemetry
export interface TelemetryToken {
  id: string
  user_id: string
  name: string | null
  created_at: string
  last_used_at: string
  revoked_at: string | null
}

export interface TelemetrySession {
  id: string
  token_id: string
  user_id: string
  character_id: number
  account_id: number
  group_id: string
  current_map: string | null
  config_version: number
  last_heartbeat: string
  started_at: string
}

export interface TelemetryConfig {
  config_version: number
  server_id: number
  group_id: string
  events: {
    mvp_kill: { enabled: boolean; monster_ids: number[]; batch_window_ms: number }
    mvp_tomb: { enabled: boolean; npc_id: number }
    mvp_killer: { enabled: boolean }
    heartbeat: { interval_ms: number }
  }
}
```

- [ ] **Step 2: Create the telemetry auth helper**

Create `src/lib/telemetry.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { NextRequest } from 'next/server'

export interface TelemetryContext {
  userId: string
  characterId: number
  accountId: number
  groupId: string
  serverId: number
  sessionId: string
  tokenId: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Resolves telemetry request headers into full context:
 * token → user → character → group
 *
 * Returns null with appropriate error response if any step fails.
 */
export async function resolveTelemetryContext(
  request: NextRequest
): Promise<{ ctx: TelemetryContext } | { error: string; status: number }> {
  const token = request.headers.get('x-api-token')
  const accountId = Number(request.headers.get('x-account-id'))
  const characterId = Number(request.headers.get('x-character-id'))

  if (!token || !accountId || !characterId) {
    return { error: 'Missing required headers', status: 400 }
  }

  const supabase = createAdminClient()
  const tokenHash = hashToken(token)

  // Validate token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('telemetry_tokens')
    .select('id, user_id')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single()

  if (tokenErr || !tokenRow) {
    return { error: 'Invalid or revoked token', status: 401 }
  }

  // Update last_used_at
  await supabase
    .from('telemetry_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)

  // Find character's group membership
  const { data: membership, error: memberErr } = await supabase
    .from('mvp_group_members')
    .select('group_id, mvp_groups!inner(server_id)')
    .eq('character_id', String(characterId))
    .eq('user_id', tokenRow.user_id)
    .single()

  if (memberErr || !membership) {
    return { error: 'Character not in a group', status: 404 }
  }

  const groupId = membership.group_id as string
  const serverId = (membership as any).mvp_groups.server_id as number

  // Upsert session
  const { data: session, error: sessionErr } = await supabase
    .from('telemetry_sessions')
    .upsert(
      {
        token_id: tokenRow.id,
        user_id: tokenRow.user_id,
        character_id: characterId,
        account_id: accountId,
        group_id: groupId,
        last_heartbeat: new Date().toISOString(),
      },
      { onConflict: 'token_id,character_id' }
    )
    .select('id, config_version')
    .single()

  if (sessionErr || !session) {
    return { error: 'Failed to create session', status: 500 }
  }

  return {
    ctx: {
      userId: tokenRow.user_id,
      characterId,
      accountId,
      groupId,
      serverId,
      sessionId: session.id,
      tokenId: tokenRow.id,
    },
  }
}

export { hashToken }
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/telemetry.ts src/lib/types.ts
git commit -m "feat: add telemetry auth helper and types"
```

---

### Task 4: API routes — config + heartbeat

**Files:**
- Create: `src/app/api/telemetry/config/route.ts`
- Create: `src/app/api/telemetry/heartbeat/route.ts`

- [ ] **Step 1: Create GET /api/telemetry/config**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function GET(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  // Fetch MVP monster_ids for this server
  const { data: mvps } = await supabase
    .from('mvps')
    .select('monster_id')
    .eq('server_id', ctx.serverId)

  const monsterIds = mvps?.map((m) => m.monster_id) ?? []

  // Get current config_version from session
  const { data: session } = await supabase
    .from('telemetry_sessions')
    .select('config_version')
    .eq('id', ctx.sessionId)
    .single()

  return NextResponse.json({
    config_version: session?.config_version ?? 1,
    server_id: ctx.serverId,
    group_id: ctx.groupId,
    events: {
      mvp_kill: {
        enabled: true,
        monster_ids: monsterIds,
        batch_window_ms: 3000,
      },
      mvp_tomb: {
        enabled: true,
        npc_id: 565,
      },
      mvp_killer: {
        enabled: true,
      },
      heartbeat: {
        interval_ms: 60000,
      },
    },
  })
}
```

- [ ] **Step 2: Create POST /api/telemetry/heartbeat**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { current_map, config_version } = body

  // Update session with current map and heartbeat
  await supabase
    .from('telemetry_sessions')
    .update({
      current_map: current_map ?? null,
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', ctx.sessionId)

  // Get current config_version
  const { data: session } = await supabase
    .from('telemetry_sessions')
    .select('config_version')
    .eq('id', ctx.sessionId)
    .single()

  return NextResponse.json({
    status: 'ok',
    config_version: session?.config_version ?? 1,
  })
}
```

- [ ] **Step 3: Test with curl**

```bash
# These will return 400/401 without valid headers, confirming the routes are wired up
curl -X GET http://localhost:3000/api/telemetry/config
# Expected: {"error":"Missing required headers"}

curl -X POST http://localhost:3000/api/telemetry/heartbeat \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: {"error":"Missing required headers"}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telemetry/config/route.ts src/app/api/telemetry/heartbeat/route.ts
git commit -m "feat: add telemetry config and heartbeat API routes"
```

---

### Task 5: API route — mvp-kill (main event)

**Files:**
- Create: `src/app/api/telemetry/mvp-kill/route.ts`

- [ ] **Step 1: Create POST /api/telemetry/mvp-kill**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { monster_id, map, x, y, timestamp, loots, party_character_ids } = body

  if (!monster_id || !map || timestamp == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve monster_id → mvp_id
  const { data: mvp } = await supabase
    .from('mvps')
    .select('id')
    .eq('monster_id', monster_id)
    .eq('server_id', ctx.serverId)
    .limit(1)
    .single()

  if (!mvp) {
    return NextResponse.json({ error: 'Unknown MVP for this server' }, { status: 400 })
  }

  const killedAt = new Date(timestamp * 1000).toISOString()

  // Dedup: same mvp_id in group within last 30 seconds
  const dedupCutoff = new Date(timestamp * 1000 - 30000).toISOString()
  const { data: existing } = await supabase
    .from('mvp_kills')
    .select('id')
    .eq('mvp_id', mvp.id)
    .eq('group_id', ctx.groupId)
    .gte('killed_at', dedupCutoff)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ action: 'dedup' })
  }

  // Overwrite: delete active kill for this MVP if exists (older than 30s)
  await supabase
    .from('mvp_kills')
    .delete()
    .eq('mvp_id', mvp.id)
    .eq('group_id', ctx.groupId)
    .lt('killed_at', dedupCutoff)

  // Insert new kill
  const { data: kill, error: killErr } = await supabase
    .from('mvp_kills')
    .insert({
      group_id: ctx.groupId,
      mvp_id: mvp.id,
      killed_at: killedAt,
      tomb_x: x ?? null,
      tomb_y: y ?? null,
      registered_by: ctx.userId,
      source: 'telemetry',
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

  if (killErr || !kill) {
    return NextResponse.json({ error: 'Failed to insert kill' }, { status: 500 })
  }

  // Insert loots as suggestions
  if (loots && Array.isArray(loots) && loots.length > 0) {
    // Resolve item names from items table
    const itemIds = loots.map((l: any) => l.item_id)
    const { data: items } = await supabase
      .from('items')
      .select('item_id, name_pt')
      .in('item_id', itemIds)

    const itemNameMap = new Map(items?.map((i) => [i.item_id, i.name_pt]) ?? [])

    const lootRows = loots.map((l: any) => ({
      kill_id: kill.id,
      item_id: l.item_id,
      item_name: itemNameMap.get(l.item_id) ?? `Item #${l.item_id}`,
      quantity: l.amount ?? 1,
      source: 'telemetry',
      accepted: null,
    }))

    await supabase.from('mvp_kill_loots').insert(lootRows)
  }

  // Insert party members
  if (party_character_ids && Array.isArray(party_character_ids) && party_character_ids.length > 0) {
    const partyRows = party_character_ids.map((charId: number) => ({
      kill_id: kill.id,
      character_id: String(charId),
    }))

    await supabase.from('mvp_kill_party').insert(partyRows)
  }

  // queue_mvp_alerts trigger fires automatically on insert

  return NextResponse.json({ action: 'created', kill_id: kill.id }, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/mvp-kill/route.ts
git commit -m "feat: add telemetry mvp-kill API route with dedup and loot suggestions"
```

---

### Task 6: API routes — mvp-tomb + mvp-killer

**Files:**
- Create: `src/app/api/telemetry/mvp-tomb/route.ts`
- Create: `src/app/api/telemetry/mvp-killer/route.ts`

- [ ] **Step 1: Create POST /api/telemetry/mvp-tomb**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const { map, tomb_x, tomb_y, timestamp } = await request.json()

  if (!map || tomb_x == null || tomb_y == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Find recent kill on this map without tomb coords (within 2 minutes)
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  const { data: kill } = await supabase
    .from('mvp_kills')
    .select('id, mvp_id')
    .eq('group_id', ctx.groupId)
    .is('tomb_x', null)
    .gte('killed_at', cutoff)
    .order('killed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (kill) {
    // Update existing kill with tomb coords
    await supabase
      .from('mvp_kills')
      .update({ tomb_x, tomb_y })
      .eq('id', kill.id)

    return NextResponse.json({ action: 'updated', kill_id: kill.id })
  }

  // No matching kill found — create new kill from tomb data
  // Resolve MVP by map (may match multiple MVPs)
  const { data: mvps } = await supabase
    .from('mvps')
    .select('id')
    .eq('map_name', map)
    .eq('server_id', ctx.serverId)

  if (!mvps || mvps.length === 0) {
    return NextResponse.json({ action: 'ignored', reason: 'no MVP on this map' })
  }

  // If exactly one MVP on this map, create the kill
  const mvpId = mvps.length === 1 ? mvps[0].id : null

  const { data: newKill } = await supabase
    .from('mvp_kills')
    .insert({
      group_id: ctx.groupId,
      mvp_id: mvpId,
      killed_at: new Date().toISOString(),
      tomb_x,
      tomb_y,
      registered_by: ctx.userId,
      source: 'telemetry',
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

  return NextResponse.json({
    action: 'created',
    kill_id: newKill?.id,
    needs_mvp_resolution: mvps.length > 1,
  }, { status: 201 })
}
```

- [ ] **Step 2: Create POST /api/telemetry/mvp-killer**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const { map, tomb_x, tomb_y, killer_name } = await request.json()

  if (!killer_name) {
    return NextResponse.json({ error: 'Missing killer_name' }, { status: 400 })
  }

  // Find kill by tomb coordinates + map in this group
  let query = supabase
    .from('mvp_kills')
    .select('id')
    .eq('group_id', ctx.groupId)

  if (tomb_x != null && tomb_y != null) {
    query = query.eq('tomb_x', tomb_x).eq('tomb_y', tomb_y)
  }

  const { data: kill } = await query
    .order('killed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!kill) {
    return NextResponse.json({ action: 'ignored', reason: 'no matching kill' })
  }

  // Try to resolve killer_name to a character_id in the group
  const { data: members } = await supabase
    .from('mvp_group_members')
    .select('character_id, characters!inner(name)')
    .eq('group_id', ctx.groupId)

  const match = members?.find(
    (m: any) => m.characters?.name === killer_name
  )

  const updates: Record<string, any> = { killer_name_raw: killer_name }
  if (match) {
    updates.killer_character_id = match.character_id
  }

  await supabase
    .from('mvp_kills')
    .update(updates)
    .eq('id', kill.id)

  return NextResponse.json({
    action: 'updated',
    kill_id: kill.id,
    killer_resolved: !!match,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/telemetry/mvp-tomb/route.ts src/app/api/telemetry/mvp-killer/route.ts
git commit -m "feat: add telemetry mvp-tomb and mvp-killer API routes"
```

---

### Task 7: API routes — pairing flow

**Files:**
- Create: `src/app/api/telemetry/pair/route.ts`
- Create: `src/app/api/telemetry/pair/exchange/route.ts`
- Create: `src/app/api/telemetry/pair/initiate/route.ts`

- [ ] **Step 1: Create POST /api/telemetry/pair/initiate (sniffer calls this)**

This creates the pairing code + callback record. Called by the sniffer before opening the browser.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function POST(request: NextRequest) {
  const { callback_url } = await request.json()

  if (!callback_url) {
    return NextResponse.json({ error: 'Missing callback_url' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const pairingCode = generatePairingCode()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  // Create a placeholder token row with pairing info (no user yet)
  const { data: token, error } = await supabase
    .from('telemetry_tokens')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000000', // placeholder, updated on confirm
      token_hash: 'pending-' + randomUUID(), // placeholder, updated on confirm
      pairing_code: pairingCode,
      pairing_callback: callback_url,
      pairing_expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error || !token) {
    return NextResponse.json({ error: 'Failed to create pairing' }, { status: 500 })
  }

  return NextResponse.json({
    pairing_code: pairingCode,
    expires_at: expiresAt,
  })
}
```

- [ ] **Step 2: Create POST /api/telemetry/pair (browser confirms)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/telemetry'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  // Authenticate the browser user via Supabase session
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { pairing_code } = await request.json()

  if (!pairing_code) {
    return NextResponse.json({ error: 'Missing pairing_code' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find the pairing record
  const { data: token, error } = await supabase
    .from('telemetry_tokens')
    .select('id, pairing_callback, pairing_expires_at')
    .eq('pairing_code', pairing_code)
    .is('revoked_at', null)
    .single()

  if (error || !token) {
    return NextResponse.json({ error: 'Invalid pairing code' }, { status: 400 })
  }

  // Check expiry
  if (new Date(token.pairing_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Pairing code expired' }, { status: 400 })
  }

  // Generate real API token + exchange code
  const apiToken = randomUUID()
  const exchangeCode = randomUUID()
  const exchangeExpiresAt = new Date(Date.now() + 60 * 1000).toISOString()

  // Update the token row with real data
  await supabase
    .from('telemetry_tokens')
    .update({
      user_id: user.id,
      token_hash: hashToken(apiToken),
      pairing_code: null,
      pairing_expires_at: null,
      exchange_code: exchangeCode,
      exchange_expires_at: exchangeExpiresAt,
    })
    .eq('id', token.id)

  // Return the callback URL with exchange code (browser redirects)
  const callbackUrl = `${token.pairing_callback}?exchange_code=${exchangeCode}`

  return NextResponse.json({ callback_url: callbackUrl })
}
```

- [ ] **Step 3: Create POST /api/telemetry/pair/exchange (sniffer exchanges code for token)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const { exchange_code } = await request.json()

  if (!exchange_code) {
    return NextResponse.json({ error: 'Missing exchange_code' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find token by exchange code
  const { data: token, error } = await supabase
    .from('telemetry_tokens')
    .select('id, token_hash, exchange_expires_at')
    .eq('exchange_code', exchange_code)
    .single()

  if (error || !token) {
    return NextResponse.json({ error: 'Invalid exchange code' }, { status: 400 })
  }

  // Check expiry
  if (new Date(token.exchange_expires_at) < new Date()) {
    return NextResponse.json({ error: 'Exchange code expired' }, { status: 400 })
  }

  // Clear exchange code (single use) — we can't return the actual token
  // since we only stored the hash. The API token was generated in the /pair
  // endpoint and needs to be passed through differently.
  //
  // DESIGN NOTE: The /pair endpoint returns the callback_url which the browser
  // navigates to. We need to store the plaintext token temporarily alongside
  // the exchange code. Let's use a separate column.

  // For this to work, we need to store the plaintext token temporarily
  // during the exchange window. Let's use the pairing_callback field
  // (it's no longer needed after pairing) to store the encrypted token.
  // Actually, simpler: store plaintext in a separate column with short TTL.

  // The /pair endpoint should store the plaintext token temporarily.
  // Since the migration already has exchange_code, we need to add
  // a temporary_token column, OR we redesign:
  //
  // Simpler approach: /pair endpoint returns { callback_url, api_token }
  // to the browser, and the browser passes it to the callback.
  // But that exposes the token in the browser.
  //
  // Better: /pair stores plaintext in a TTL column, /exchange retrieves + deletes it.

  // For now, we'll need to adjust the approach slightly.
  // We clear the exchange code and return success — the actual token
  // is returned inline to the sniffer via the exchange.

  await supabase
    .from('telemetry_tokens')
    .update({
      exchange_code: null,
      exchange_expires_at: null,
    })
    .eq('id', token.id)

  // NOTE: This requires storing the plaintext token temporarily.
  // See implementation note below for the DB adjustment.
  return NextResponse.json({ error: 'Implementation requires temporary_token column' }, { status: 501 })
}
```

**Implementation note:** The exchange flow requires temporarily storing the plaintext API token between the `/pair` call and the `/pair/exchange` call. Add a `temporary_token` TEXT column to `telemetry_tokens` (cleared after exchange). Update the migration in Task 1 to include this column:

```sql
ALTER TABLE telemetry_tokens ADD COLUMN temporary_token TEXT;
```

Then `/pair` stores: `temporary_token = apiToken` (plaintext, 60s TTL).
Then `/pair/exchange` reads it, returns it, and clears it:

```typescript
// In /pair/exchange, replace the placeholder:
const { data: token } = await supabase
  .from('telemetry_tokens')
  .select('id, temporary_token, exchange_expires_at')
  .eq('exchange_code', exchange_code)
  .single()

// ... expiry check ...

const apiToken = token.temporary_token

// Clear exchange code + temporary token
await supabase
  .from('telemetry_tokens')
  .update({
    exchange_code: null,
    exchange_expires_at: null,
    temporary_token: null,
  })
  .eq('id', token.id)

return NextResponse.json({ token: apiToken })
```

- [ ] **Step 4: Update migration to add temporary_token column**

Add to `supabase/migrations/20260328000000_telemetry_tables.sql` in the telemetry_tokens CREATE TABLE:

```sql
temporary_token TEXT,  -- plaintext API token, stored only during exchange window (~60s), cleared after
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/telemetry/pair/ supabase/migrations/20260328000000_telemetry_tables.sql
git commit -m "feat: add telemetry pairing API routes with exchange code flow"
```

---

### Task 8: Pairing confirmation page

**Files:**
- Create: `src/app/telemetry/pair/page.tsx`

- [ ] **Step 1: Create the pairing page**

```tsx
'use client'

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'

function PairContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const callback = searchParams.get('callback')
  const [status, setStatus] = useState<'idle' | 'confirming' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleConfirm() {
    setStatus('confirming')
    try {
      const res = await fetch('/api/telemetry/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairing_code: code }),
      })

      if (!res.ok) {
        const data = await res.json()
        setErrorMsg(data.error || 'Erro ao conectar')
        setStatus('error')
        return
      }

      const { callback_url } = await res.json()
      setStatus('success')

      // Redirect to sniffer's local callback
      window.location.href = callback_url
    } catch {
      setErrorMsg('Erro de conexao')
      setStatus('error')
    }
  }

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <p className="text-text-secondary">Codigo de pareamento nao encontrado.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full text-center">
        <h1 className="text-xl font-semibold text-text-primary mb-4">Conectar Sniffer</h1>
        <p className="text-text-secondary mb-6">
          Confirme o codigo abaixo para conectar seu sniffer ao Instanceiro.
        </p>
        <div className="bg-bg border border-border rounded-md p-4 mb-6">
          <span className="font-mono text-2xl font-bold text-primary tracking-wider">{code}</span>
        </div>

        {status === 'idle' && (
          <button
            onClick={handleConfirm}
            className="w-full bg-primary text-white font-semibold rounded-md py-3 hover:bg-primary-hover transition-colors"
          >
            Confirmar conexao
          </button>
        )}

        {status === 'confirming' && (
          <p className="text-text-secondary">Conectando...</p>
        )}

        {status === 'success' && (
          <p className="text-status-available-text font-semibold">
            Conectado! Voce pode fechar esta janela.
          </p>
        )}

        {status === 'error' && (
          <div>
            <p className="text-status-error-text mb-4">{errorMsg}</p>
            <button
              onClick={() => setStatus('idle')}
              className="text-primary underline text-sm"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PairingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-bg"><p className="text-text-secondary">Carregando...</p></div>}>
      <PairContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/telemetry/pair/page.tsx
git commit -m "feat: add telemetry pairing confirmation page"
```

---

### Task 9: Hook — telemetry sessions for group

**Files:**
- Create: `src/hooks/use-telemetry-sessions.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TelemetrySession } from '@/lib/types'

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

export interface ActiveTelemetryMember {
  userId: string
  characterId: number
  currentMap: string | null
  lastHeartbeat: string
}

export function useTelemetrySessions(groupId: string | null) {
  const [sessions, setSessions] = useState<ActiveTelemetryMember[]>([])

  useEffect(() => {
    if (!groupId) return

    const supabase = createClient()

    async function fetch() {
      const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString()

      const { data } = await supabase
        .from('telemetry_sessions')
        .select('user_id, character_id, current_map, last_heartbeat')
        .eq('group_id', groupId)
        .gte('last_heartbeat', cutoff)

      setSessions(
        data?.map((s) => ({
          userId: s.user_id,
          characterId: s.character_id,
          currentMap: s.current_map,
          lastHeartbeat: s.last_heartbeat,
        })) ?? []
      )
    }

    fetch()
    const interval = setInterval(fetch, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [groupId])

  return sessions
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-telemetry-sessions.ts
git commit -m "feat: add use-telemetry-sessions hook for group member status"
```

---

### Task 10: UI — telemetry indicator on group members

**Files:**
- Modify: `src/components/mvp/mvp-group-hub.tsx`

- [ ] **Step 1: Read the current component to find the member list rendering**

Read `src/components/mvp/mvp-group-hub.tsx` and locate where member pill badges are rendered. Look for the `members.map(...)` section that displays character names.

- [ ] **Step 2: Add telemetry status dot**

Import the hook and add a green pulsing dot next to members with active telemetry:

```tsx
// Add import at top:
import { useTelemetrySessions } from '@/hooks/use-telemetry-sessions'

// Inside the component, add:
const telemetrySessions = useTelemetrySessions(group?.id ?? null)

// In the member pill rendering, add a telemetry indicator:
// Find the member name span/div and add after it:
{telemetrySessions.some(s => s.userId === member.user_id) && (
  <span
    className="inline-block w-2 h-2 rounded-full bg-status-available-text animate-pulse ml-1"
    title={`Telemetria ativa — ${telemetrySessions.find(s => s.userId === member.user_id)?.currentMap ?? '?'}`}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/mvp/mvp-group-hub.tsx
git commit -m "feat: add telemetry status indicator on group members"
```

---

### Task 11: UI — source indicator + loot badge on timer row

**Files:**
- Modify: `src/components/mvp/mvp-timer-row.tsx`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Extend MvpActiveKill type**

Add to `MvpActiveKill` in `src/lib/types.ts`:

```typescript
// Add these fields to MvpActiveKill:
  source: 'manual' | 'telemetry'
  killer_name_raw: string | null
  pending_loots_count: number
```

Note: The `pending_loots_count` needs to come from the RPC `get_group_active_kills`. This requires updating the SQL function to include a count of loots where `accepted IS NULL`. If modifying the RPC is too invasive, query pending loots separately in the hook.

- [ ] **Step 2: Add source indicator to timer row**

In `src/components/mvp/mvp-timer-row.tsx`, find where the timestamp/registered-by info is displayed and add:

```tsx
{/* Telemetry source indicator — next to the timestamp */}
{kill.source === 'telemetry' && (
  <span
    className="text-text-secondary ml-1"
    title={`Registrado via telemetria${kill.registered_by_name ? ` por ${kill.registered_by_name}` : ''}`}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="inline">
      <path d="M12 20V10M8 14l4-4 4 4M4 4h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </span>
)}
```

- [ ] **Step 3: Add loot suggestion badge**

```tsx
{/* Loot suggestion badge — near the kill info */}
{kill.pending_loots_count > 0 && (
  <span className="text-xs bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-primary rounded-sm px-1.5 py-0.5 ml-2">
    {kill.pending_loots_count} drop{kill.pending_loots_count > 1 ? 's' : ''}
  </span>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/mvp/mvp-timer-row.tsx src/lib/types.ts
git commit -m "feat: add telemetry source indicator and loot badge to timer row"
```

---

### Task 12: UI — loot accept/reject in kill modal

**Files:**
- Modify: `src/hooks/use-mvp-timers.ts`
- Modify: `src/components/mvp/mvp-kill-modal.tsx`

- [ ] **Step 1: Add loot suggestion functions to use-mvp-timers**

Add two functions to the hook:

```typescript
async function acceptLootSuggestions(killId: string) {
  const supabase = createClient()
  await supabase
    .from('mvp_kill_loots')
    .update({ accepted: true })
    .eq('kill_id', killId)
    .eq('source', 'telemetry')
    .is('accepted', null)
  await fetchKills()
}

async function rejectLootSuggestion(lootId: string) {
  const supabase = createClient()
  await supabase
    .from('mvp_kill_loots')
    .update({ accepted: false })
    .eq('id', lootId)
  await fetchKills()
}
```

Return both from the hook.

- [ ] **Step 2: Show pending loots in kill modal**

In `mvp-kill-modal.tsx`, when opening a kill that has `source === 'telemetry'`, query pending loots:

```typescript
const { data: pendingLoots } = await supabase
  .from('mvp_kill_loots')
  .select('id, item_id, item_name, quantity')
  .eq('kill_id', killId)
  .eq('source', 'telemetry')
  .is('accepted', null)
```

Display them as pre-checked checkboxes in the loot section. "Aceitar todos" button calls `acceptLootSuggestions(killId)`. Individual reject via unchecking + "Rejeitar" on each item calls `rejectLootSuggestion(lootId)`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-mvp-timers.ts src/components/mvp/mvp-kill-modal.tsx
git commit -m "feat: add loot suggestion accept/reject in kill modal"
```

---

### Task 13: UI — telemetry settings

**Files:**
- Create: `src/components/mvp/telemetry-settings.tsx`

- [ ] **Step 1: Create the telemetry settings component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TelemetryToken } from '@/lib/types'

interface TelemetrySettingsProps {
  userId: string
}

export function TelemetrySettings({ userId }: TelemetrySettingsProps) {
  const [tokens, setTokens] = useState<TelemetryToken[]>([])
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    fetchTokens()
  }, [userId])

  async function fetchTokens() {
    const supabase = createClient()
    const { data } = await supabase
      .from('telemetry_tokens')
      .select('id, name, created_at, last_used_at, revoked_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    setTokens(data ?? [])
  }

  async function handleRevoke(tokenId: string) {
    const supabase = createClient()
    await supabase
      .from('telemetry_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenId)

    setRevoking(null)
    fetchTokens()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Telemetria</h3>

      {tokens.length === 0 ? (
        <p className="text-xs text-text-secondary">Nenhum sniffer conectado.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-bg border border-border rounded-md px-3 py-2">
              <div>
                <span className="text-sm text-text-primary">{t.name ?? 'Sniffer'}</span>
                <span className="text-xs text-text-secondary ml-2">
                  Ultimo uso: {formatDate(t.last_used_at)}
                </span>
              </div>
              {revoking !== t.id ? (
                <button
                  onClick={() => setRevoking(t.id)}
                  className="text-xs text-status-error-text hover:underline"
                >
                  Revogar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRevoke(t.id)}
                    className="text-xs text-white bg-status-error rounded-md px-2 py-1"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setRevoking(null)}
                    className="text-xs text-text-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Integrate into group settings or MVP tab**

Read `src/components/mvp/mvp-tab.tsx` and find where group settings are rendered. Add the `<TelemetrySettings userId={userId} />` component in the appropriate location (e.g., inside the group hub or as a collapsible section).

- [ ] **Step 3: Commit**

```bash
git add src/components/mvp/telemetry-settings.tsx src/components/mvp/mvp-tab.tsx
git commit -m "feat: add telemetry settings UI with token management"
```

---

## Part B: Sniffer C++ Integration

> **Note:** These tasks modify the RO-PacketSniffer-CPP codebase at `D:\rag\RO-PacketSniffer-CPP\`. They depend on Part A being deployed (API routes must be accessible).

### Task 14: TelemetryClient — config + auth + heartbeat

**Files:**
- Create: `src/public/telemetry/TelemetryClient.h`
- Create: `src/private/telemetry/TelemetryClient.cpp`
- Modify: `src/main.cpp`
- Modify: `CMakeLists.txt`

- [ ] **Step 1: Create TelemetryClient header**

```cpp
// src/public/telemetry/TelemetryClient.h
#pragma once

#include <atomic>
#include <chrono>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>
#include <nlohmann/json.hpp>

struct TelemetryMvpLoot {
    uint32_t item_id;
    uint16_t amount;
};

class TelemetryClient {
public:
    static TelemetryClient& instance();

    // Lifecycle
    void init();       // Reads token from config, fetches server config, starts heartbeat
    void shutdown();

    // Event dispatch (called from packet handlers)
    void on_mvp_kill(uint32_t monster_id, const std::string& map, uint16_t x, uint16_t y,
                     long timestamp, const std::vector<TelemetryMvpLoot>& loots);
    void on_mvp_tomb(const std::string& map, uint16_t x, uint16_t y, long timestamp);
    void on_mvp_killer(const std::string& map, uint16_t x, uint16_t y, const std::string& killer_name);

    // Query
    bool is_mvp(uint32_t monster_id) const;
    bool is_tomb_npc(uint32_t npc_id) const;
    bool is_enabled() const { return m_enabled.load(); }

private:
    TelemetryClient() = default;

    // Auth
    std::string m_api_token;
    std::string m_api_url;
    uint32_t m_account_id = 0;
    uint32_t m_character_id = 0;

    // Config from server
    std::unordered_set<uint32_t> m_mvp_monster_ids;
    uint32_t m_tomb_npc_id = 565;
    int m_batch_window_ms = 3000;
    int m_heartbeat_interval_ms = 60000;
    int m_config_version = 0;
    std::string m_current_map;

    // State
    std::atomic<bool> m_enabled{false};
    std::thread m_heartbeat_thread;
    std::atomic<bool> m_running{false};
    mutable std::mutex m_mtx;

    // Internal
    bool load_token();
    bool fetch_config();
    void heartbeat_loop();
    nlohmann::json send_telemetry(const std::string& method, const std::string& endpoint,
                                   const nlohmann::json& body = {});

    static std::string strip_gat(const std::string& map_name);
};
```

- [ ] **Step 2: Create TelemetryClient implementation**

Create `src/private/telemetry/TelemetryClient.cpp` with:
- `init()`: Read token from config.json `api_token` field. If missing, log warning and return (pairing flow is Phase 2 sniffer work). Call `fetch_config()`. Start heartbeat thread.
- `fetch_config()`: GET `/api/telemetry/config` with headers. Parse response into `m_mvp_monster_ids`, `m_tomb_npc_id`, etc. Set `m_enabled = true`.
- `heartbeat_loop()`: Every `m_heartbeat_interval_ms`, POST `/api/telemetry/heartbeat`. If `config_version` changed, call `fetch_config()`. On 401, set `m_enabled = false`.
- `on_mvp_kill()`: POST `/api/telemetry/mvp-kill` via curl thread pool (reuse `DeserializeHandler::curl_pool` pattern).
- `on_mvp_tomb()`: POST `/api/telemetry/mvp-tomb`.
- `on_mvp_killer()`: POST `/api/telemetry/mvp-killer`.
- `send_telemetry()`: Shared curl helper. Sets headers `X-API-TOKEN`, `X-ACCOUNT-ID`, `X-CHARACTER-ID`. Returns parsed JSON response.
- `strip_gat()`: `map_name.replace(".gat", "")`.
- `is_mvp()`: `m_mvp_monster_ids.count(monster_id) > 0`.
- `is_tomb_npc()`: `npc_id == m_tomb_npc_id`.

- [ ] **Step 3: Update main.cpp**

Add `--telemetry` flag and call `TelemetryClient::instance().init()` before `capture(save)`:

```cpp
#include "telemetry/TelemetryClient.h"

// In argument parsing:
bool telemetry_mode = false;
// ...
else if (arg == "--telemetry") { telemetry_mode = true; }

// Before capture:
if (telemetry_mode) {
    TelemetryClient::instance().init();
}
```

- [ ] **Step 4: Update CMakeLists.txt**

Add the new source files to the build.

- [ ] **Step 5: Build and verify**

Run: `cmake --build build --config Debug`
Expected: Compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add src/public/telemetry/ src/private/telemetry/ src/main.cpp CMakeLists.txt
git commit -m "feat: add TelemetryClient with config fetch and heartbeat"
```

---

### Task 15: MVP kill handler + loot batching

**Files:**
- Modify: `src/private/packets/receive/ActorDied.cpp`
- Modify: `src/private/packets/receive/ItemAppeared.cpp`
- Modify: `src/private/gameplay/DropTracker.h`
- Modify: `src/private/gameplay/DropTracker.cpp`

- [ ] **Step 1: Add MVP drop collection to DropTracker**

Add a method to retrieve recent MVP drops:

```cpp
// In DropTracker.h, add:
static std::vector<std::pair<uint32_t, uint16_t>> get_recent_drops_for(uint32_t monster_id);

// In DropTracker.cpp, implement:
std::vector<std::pair<uint32_t, uint16_t>> DropTracker::get_recent_drops_for(uint32_t monster_id) {
    std::lock_guard<std::mutex> lock(mtx);
    std::vector<std::pair<uint32_t, uint16_t>> result;
    auto it = monster_drops.find(monster_id);
    if (it != monster_drops.end()) {
        for (const auto& [item_id, stats] : it->second.items) {
            result.emplace_back(item_id, static_cast<uint16_t>(stats.drop_count));
        }
    }
    return result;
}
```

- [ ] **Step 2: Modify ActorDied to trigger telemetry**

```cpp
// In ActorDied::deserialize_internal(), after the existing KillCounter/DropTracker calls:

#include "telemetry/TelemetryClient.h"

// After: DropTracker::record_death(actor.monster_id, actor.name, actor.x, actor.y);
if (TelemetryClient::instance().is_enabled() &&
    TelemetryClient::instance().is_mvp(actor.monster_id))
{
    // Delay to allow ItemAppeared packets to arrive (batch window)
    auto monster_id = actor.monster_id;
    auto map = Character::get_map(pid); // current map for this PID
    auto x = actor.x;
    auto y = actor.y;
    auto ts = timestamp;

    std::thread([=]() {
        // Wait for batch window to collect drops
        auto& tc = TelemetryClient::instance();
        std::this_thread::sleep_for(std::chrono::milliseconds(3000));

        auto drops = DropTracker::get_recent_drops_for(monster_id);
        std::vector<TelemetryMvpLoot> loots;
        for (const auto& [item_id, amount] : drops) {
            loots.push_back({item_id, amount});
        }

        tc.on_mvp_kill(monster_id, map, x, y, ts, loots);
    }).detach();
}

ActorCache::remove(actor_id);
```

- [ ] **Step 3: Commit**

```bash
git add src/private/packets/receive/ActorDied.cpp src/private/gameplay/DropTracker.h src/private/gameplay/DropTracker.cpp
git commit -m "feat: trigger telemetry on MVP kill with batched loot"
```

---

### Task 16: Tomb + killer handlers

**Files:**
- Modify: `src/private/packets/receive/ActorInfo.cpp`
- Create: `src/public/telemetry/TombTracker.h`
- Create: `src/private/telemetry/TombTracker.cpp`
- Modify: `src/private/packets/receive/GameMessage.cpp`
- Modify: `src/private/packets/PacketDatabase.cpp`

- [ ] **Step 1: Add tomb telemetry to ActorInfo**

In `ActorInfo::report_npc()`, after the existing tomb detection:

```cpp
#include "telemetry/TelemetryClient.h"
#include "telemetry/TombTracker.h"

// After the existing console/log output for tomb:
if (is_tomb && TelemetryClient::instance().is_enabled()) {
    std::string map_clean = coord_map;
    // strip .gat handled by TelemetryClient
    TelemetryClient::instance().on_mvp_tomb(coord_map, coord_x, coord_y, 0);
    // Track this tomb's actor_id for killer extraction on click
    TombTracker::instance().register_tomb(actor_id, coord_map, coord_x, coord_y);
}
```

- [ ] **Step 2: Create TombTracker**

```cpp
// src/public/telemetry/TombTracker.h
#pragma once

#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

struct TombInfo {
    std::string map;
    uint16_t x;
    uint16_t y;
};

class TombTracker {
public:
    static TombTracker& instance();

    void register_tomb(uint32_t actor_id, const std::string& map, uint16_t x, uint16_t y);
    bool get_tomb(uint32_t actor_id, TombInfo& out) const;

    // NPC_TALK buffering per actor_id
    void buffer_npc_talk(uint32_t npc_id, const std::string& message);
    std::string get_last_talk_and_clear(uint32_t npc_id);

private:
    TombTracker() = default;
    mutable std::mutex m_mtx;
    std::unordered_map<uint32_t, TombInfo> m_tombs;
    std::unordered_map<uint32_t, std::vector<std::string>> m_npc_talks;
};
```

Implement in `src/private/telemetry/TombTracker.cpp`:
- `register_tomb()`: Store tomb info keyed by actor_id.
- `buffer_npc_talk()`: Append message to vector for this NPC actor_id.
- `get_last_talk_and_clear()`: Return last message in buffer, clear all messages for this NPC.

- [ ] **Step 3: Modify GameMessage for tomb click killer extraction**

In `GameMessage::deserialize_internal()`, the `NPC_TALK` case already extracts the message. Add buffering:

```cpp
// After the existing clean/display logic in NPC_TALK case:
#include "telemetry/TombTracker.h"

// In NPC_TALK case, after extracting npc_id (first 4 bytes):
uint32_t npc_id = pkt_data[0] | (pkt_data[1] << 8) | (pkt_data[2] << 16) | (pkt_data[3] << 24);
// ... existing message extraction ...

// Buffer for tomb killer extraction
if (!clean.empty()) {
    TombTracker::instance().buffer_npc_talk(npc_id, clean);
}
```

- [ ] **Step 4: Add NPC_TALK_CLOSE handler**

Register `NPC_TALK_CLOSE` (0x00B6) to also use `GameMessage` handler in PacketDatabase.cpp, or create a small dedicated handler. On CLOSE, check if the NPC is a known tomb and extract killer:

```cpp
// In GameMessage, add handling for NPC_TALK_CLOSE:
case ReceivePacketTable::NPC_TALK_CLOSE:
{
    if (pkt_data.size() >= 4) {
        uint32_t npc_id = pkt_data[0] | (pkt_data[1] << 8) | (pkt_data[2] << 16) | (pkt_data[3] << 24);

        TombInfo tomb;
        if (TombTracker::instance().get_tomb(npc_id, tomb)) {
            std::string killer = TombTracker::instance().get_last_talk_and_clear(npc_id);
            if (!killer.empty() && TelemetryClient::instance().is_enabled()) {
                TelemetryClient::instance().on_mvp_killer(tomb.map, tomb.x, tomb.y, killer);
            }
        } else {
            TombTracker::instance().get_last_talk_and_clear(npc_id); // cleanup
        }
    }
    return; // Don't log CLOSE
}
```

- [ ] **Step 5: Register NPC_TALK_CLOSE handler in PacketDatabase**

In `PacketDatabase.cpp`, change the existing `NPC_TALK_CLOSE` entry to use `GameMessage`:

```cpp
packet_map[ReceivePacketTable::NPC_TALK_CLOSE] = {
    .desc = "Npc Talk Close", .size = 6, .type = PacketSizeType::FIXED,
    .handler = []() -> std::unique_ptr<DeserializeHandler> { return std::make_unique<GameMessage>(); },
    .category = "npc"
};
```

- [ ] **Step 6: Build and verify**

Run: `cmake --build build --config Debug`

- [ ] **Step 7: Commit**

```bash
git add src/public/telemetry/TombTracker.h src/private/telemetry/TombTracker.cpp \
  src/private/packets/receive/ActorInfo.cpp src/private/packets/receive/GameMessage.cpp \
  src/private/packets/PacketDatabase.cpp CMakeLists.txt
git commit -m "feat: add tomb and killer telemetry handlers"
```

---

### Task 17: Offline queue

**Files:**
- Create: `src/public/telemetry/TelemetryQueue.h`
- Create: `src/private/telemetry/TelemetryQueue.cpp`
- Modify: `src/private/telemetry/TelemetryClient.cpp`

- [ ] **Step 1: Create TelemetryQueue**

```cpp
// src/public/telemetry/TelemetryQueue.h
#pragma once

#include <mutex>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

struct QueuedEvent {
    std::string method;    // "POST" or "GET"
    std::string endpoint;  // e.g., "/api/telemetry/mvp-kill"
    nlohmann::json body;
    long queued_at;        // unix timestamp
};

class TelemetryQueue {
public:
    static TelemetryQueue& instance();

    void enqueue(const std::string& method, const std::string& endpoint, const nlohmann::json& body);
    std::vector<QueuedEvent> drain();  // Returns and removes all events
    void load_from_disk();
    void save_to_disk();

private:
    TelemetryQueue() = default;
    std::vector<QueuedEvent> m_queue;
    std::mutex m_mtx;
    static constexpr const char* QUEUE_FILE = "telemetry_queue.json";
    static constexpr long MAX_AGE_SECONDS = 24 * 60 * 60; // 24h
};
```

- [ ] **Step 2: Implement queue with disk persistence**

`TelemetryQueue.cpp`:
- `enqueue()`: Add to vector, call `save_to_disk()`.
- `drain()`: Move all events out, clear vector, save empty.
- `save_to_disk()`: Write JSON array to `telemetry_queue.json`.
- `load_from_disk()`: Read from file, discard events older than 24h.

- [ ] **Step 3: Integrate into TelemetryClient**

In `TelemetryClient::send_telemetry()`, if the curl request fails (network error or 5xx), call `TelemetryQueue::instance().enqueue(...)` instead of dropping the event.

In `heartbeat_loop()`, after a successful heartbeat, call:
```cpp
auto queued = TelemetryQueue::instance().drain();
for (const auto& event : queued) {
    send_telemetry(event.method, event.endpoint, event.body);
}
```

- [ ] **Step 4: Load queue on init**

In `TelemetryClient::init()`, call `TelemetryQueue::instance().load_from_disk()`.

- [ ] **Step 5: Build and verify**

Run: `cmake --build build --config Debug`

- [ ] **Step 6: Commit**

```bash
git add src/public/telemetry/TelemetryQueue.h src/private/telemetry/TelemetryQueue.cpp \
  src/private/telemetry/TelemetryClient.cpp CMakeLists.txt
git commit -m "feat: add offline queue with disk persistence for telemetry events"
```

---

### Task 18: End-to-end smoke test

- [ ] **Step 1: Start Instanceiro dev server**

Run: `npm run dev`

- [ ] **Step 2: Create a test token manually in Supabase**

Insert a `telemetry_tokens` row with a known token hash for testing. Use the Supabase dashboard or a SQL query.

- [ ] **Step 3: Test the config endpoint**

```bash
curl -X GET http://localhost:3000/api/telemetry/config \
  -H "X-API-TOKEN: <test-token>" \
  -H "X-ACCOUNT-ID: 123" \
  -H "X-CHARACTER-ID: 456"
```

Expected: 200 with config JSON including monster_ids array.

- [ ] **Step 4: Test the mvp-kill endpoint**

```bash
curl -X POST http://localhost:3000/api/telemetry/mvp-kill \
  -H "X-API-TOKEN: <test-token>" \
  -H "X-ACCOUNT-ID: 123" \
  -H "X-CHARACTER-ID: 456" \
  -H "Content-Type: application/json" \
  -d '{"monster_id": 1583, "map": "beach_dun", "x": 153, "y": 90, "timestamp": 1711612800, "loots": [{"item_id": 7444, "amount": 1}]}'
```

Expected: 201 with `{ "action": "created", "kill_id": "..." }`

- [ ] **Step 5: Verify in the UI**

Open Instanceiro in the browser. The kill should appear in the MVP timer list with the telemetry source indicator.

- [ ] **Step 6: Test dedup**

Send the same curl request again within 30 seconds.
Expected: 200 with `{ "action": "dedup" }`

- [ ] **Step 7: Start sniffer with telemetry**

Run: `ROSniffer.exe --telemetry`
Expected: Fetches config, starts heartbeat. When an MVP dies in-game, a kill appears in Instanceiro automatically.
