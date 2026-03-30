# Multi-Client Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the heartbeat report per-client state (map, character, instance) so multiple game clients are tracked independently.

**Architecture:** The C++ sniffer collects active clients from `ExpCalculator::all_accounts` and `Character::map_location`, sends them as a `clients` array in the heartbeat. The API upserts one session per game-level character_id (instead of one per token). Instance state moves from a global bool to a per-PID map.

**Tech Stack:** C++20 (sniffer), Next.js 16 (API), Supabase (Postgres)

---

## File Map

**C++ Sniffer (D:\rag\RO-PacketSniffer-CPP):**
- `src/public/telemetry/TelemetryClient.h` — add `get_active_clients()`, change instance state to per-PID
- `src/private/telemetry/TelemetryClient.cpp` — refactor `heartbeat_loop` to send clients array, implement per-PID instance
- `src/private/packets/receive/InstanceWindow.cpp` — pass `pid` to `set_in_instance`

**Next.js API (instance-tracker):**
- `src/app/api/telemetry/heartbeat/route.ts` — handle `clients` array, upsert per character
- `src/lib/telemetry.ts` — session upsert no longer in context resolution (moved to heartbeat)
- `supabase/migrations/` — update unique constraint on telemetry_sessions

---

### Task 1: Make instance state per-PID in C++ sniffer

**Files:**
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\public\telemetry\TelemetryClient.h`
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\private\telemetry\TelemetryClient.cpp`
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\private\packets\receive\InstanceWindow.cpp`

- [ ] **Step 1: Change instance state from global bool to per-PID map**

In `TelemetryClient.h`, replace the instance tracking section:

```cpp
// Instance tracking — per PID
void set_in_instance(uint32_t pid, bool in_instance, const std::string& name) {
    std::lock_guard<std::mutex> lock(m_mtx);
    if (in_instance) {
        m_instance_pids[pid] = name;
    } else {
        m_instance_pids.erase(pid);
    }
}
bool is_in_instance(uint32_t pid) const {
    std::lock_guard<std::mutex> lock(m_mtx);
    return m_instance_pids.count(pid) > 0;
}
// Legacy: check if ANY client is in instance (for global checks without PID)
bool is_any_in_instance() const {
    std::lock_guard<std::mutex> lock(m_mtx);
    return !m_instance_pids.empty();
}
std::string get_instance_name(uint32_t pid) const {
    std::lock_guard<std::mutex> lock(m_mtx);
    auto it = m_instance_pids.find(pid);
    return it != m_instance_pids.end() ? it->second : "";
}
```

Replace `m_in_instance` and `m_instance_name` member variables with:

```cpp
std::unordered_map<uint32_t, std::string> m_instance_pids; // pid -> instance name
```

- [ ] **Step 2: Update InstanceWindow.cpp to pass pid**

Replace `TelemetryClient::instance().set_in_instance(true, name)` calls with:

```cpp
TelemetryClient::instance().set_in_instance(static_cast<uint32_t>(pid), true, name);
```

And for LEAVE:

```cpp
TelemetryClient::instance().set_in_instance(static_cast<uint32_t>(pid), false, "");
```

- [ ] **Step 3: Update event dispatchers to check instance per-PID**

The event dispatchers (`on_mvp_kill`, `on_mvp_spotted`, etc.) don't currently receive a PID. They get the map from `Character::get_map(pid)` at the call site. The simplest fix: keep `is_instance_map(map)` as the primary check (it works for `digit@name` maps) and remove the global `is_in_instance()` check. The API-side map mismatch check (from the previous fix) handles the rest.

Actually, a better approach: the call sites already have the PID. Pass it through to the telemetry methods. But that's a bigger refactor.

Simplest for now: replace `is_in_instance()` (global) with a check that looks up the PID from the map. Since we can't easily get PID in the telemetry methods, use the `is_instance_map` check plus the API-side protection.

In `TelemetryClient.cpp`, replace all `is_in_instance() || is_instance_map(map)` with just `is_instance_map(map)`:

```cpp
// on_mvp_kill
if (is_instance_map(map)) {

// on_mvp_tomb
if (is_instance_map(map)) return;

// on_mvp_spotted — remove is_in_instance() line, keep is_instance_map
if (is_instance_map(clean_map)) return;

// on_mvp_killer
if (is_instance_map(map)) return;
```

The per-PID instance state will be used in the heartbeat (Task 2) to report which clients are in instances, and the API-side map mismatch check prevents false sightings/kills.

- [ ] **Step 4: Build and verify**

```bash
cd D:\rag\RO-PacketSniffer-CPP
cmake --build build-release --config Release
```

- [ ] **Step 5: Commit**

```bash
cd D:\rag\RO-PacketSniffer-CPP
git add src/public/telemetry/TelemetryClient.h src/private/telemetry/TelemetryClient.cpp src/private/packets/receive/InstanceWindow.cpp
git commit -m "feat: per-PID instance tracking instead of global bool"
```

---

### Task 2: C++ heartbeat sends clients array

**Files:**
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\public\telemetry\TelemetryClient.h`
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\private\telemetry\TelemetryClient.cpp`

- [ ] **Step 1: Add get_active_clients method to TelemetryClient**

In `TelemetryClient.h`, add a public struct and method:

```cpp
struct ActiveClient {
    uint32_t pid;
    uint32_t character_id;
    uint32_t account_id;
    std::string map;
    std::string name;
    bool in_instance;
    std::string instance_name;
};

std::vector<ActiveClient> get_active_clients() const;
```

In `TelemetryClient.cpp`, implement it. This reads from `ExpCalculator::all_accounts` and `Character::map_location`:

```cpp
std::vector<TelemetryClient::ActiveClient> TelemetryClient::get_active_clients() const
{
    std::vector<ActiveClient> clients;

    // Get all known accounts from ExpCalculator
    // We need to access the static map — add a friend or a static getter
    // For now, iterate Character::map_location (all PIDs with known maps)
    // and cross-reference with ExpCalculator for character info

    auto& accounts = ExpCalculator::get_all_accounts();
    std::lock_guard<std::mutex> lock(m_mtx);

    for (const auto& [pid, account] : accounts)
    {
        auto active_char = account->active_character.load();
        if (!active_char) continue;

        std::string map;
        Character::get_map(pid, map);

        bool in_inst = m_instance_pids.count(pid) > 0;
        std::string inst_name;
        if (in_inst) {
            auto it = m_instance_pids.find(pid);
            inst_name = it->second;
        }

        clients.push_back({
            pid,
            active_char->get_character_id(),
            account->account_id,
            strip_gat(map),
            active_char->get_name(),
            in_inst,
            inst_name,
        });
    }

    return clients;
}
```

- [ ] **Step 2: Expose all_accounts from ExpCalculator**

In `ExpCalculator.h`, add a public static getter:

```cpp
static const std::pmr::unordered_map<uint32_t, std::unique_ptr<SyncAccount>>& get_all_accounts() { return all_accounts; }
```

- [ ] **Step 3: Refactor heartbeat_loop to send clients array**

In `TelemetryClient.cpp`, replace the heartbeat body construction:

```cpp
auto clients = get_active_clients();

nlohmann::json clients_json = nlohmann::json::array();
for (const auto& c : clients)
{
    clients_json.push_back({
        {"character_id", c.character_id},
        {"account_id", c.account_id},
        {"map", c.map},
        {"name", c.name},
        {"in_instance", c.in_instance},
        {"instance_name", c.instance_name},
    });
}

nlohmann::json body = {
    {"config_version", config_ver},
    {"client_version", CLAUDINHO_VERSION},
    {"clients", clients_json}
};
```

Remove the old `current_map` field from the heartbeat body.

- [ ] **Step 4: Build and verify**

```bash
cd D:\rag\RO-PacketSniffer-CPP
cmake --build build-release --config Release
```

- [ ] **Step 5: Commit**

```bash
cd D:\rag\RO-PacketSniffer-CPP
git add src/public/telemetry/TelemetryClient.h src/private/telemetry/TelemetryClient.cpp src/public/gameplay/exp_calculator/ExpCalculator.h
git commit -m "feat: heartbeat sends per-client array with map, character, instance state"
```

---

### Task 3: Update telemetry_sessions table for per-character sessions

**Files:**
- Create: `supabase/migrations/20260330000000_per_character_sessions.sql`

- [ ] **Step 1: Create migration**

The current unique constraint is `(token_id, character_id)` where `character_id` is always 0. We need to change it so each game-level character gets its own session row.

```sql
-- Drop old unique constraint and recreate for per-character sessions
ALTER TABLE telemetry_sessions DROP CONSTRAINT IF EXISTS telemetry_sessions_token_id_character_id_key;

-- character_id will now hold the actual game-level character ID
-- One session per token per game character
ALTER TABLE telemetry_sessions ADD CONSTRAINT telemetry_sessions_token_character_key UNIQUE (token_id, character_id);

-- Add columns for character name and instance tracking
ALTER TABLE telemetry_sessions ADD COLUMN IF NOT EXISTS character_name TEXT;
ALTER TABLE telemetry_sessions ADD COLUMN IF NOT EXISTS in_instance BOOLEAN DEFAULT false;
ALTER TABLE telemetry_sessions ADD COLUMN IF NOT EXISTS instance_name TEXT;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db query --linked -f supabase/migrations/20260330000000_per_character_sessions.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260330000000_per_character_sessions.sql
git commit -m "feat: per-character telemetry sessions with instance tracking"
```

---

### Task 4: Update heartbeat API to handle clients array

**Files:**
- Modify: `src/app/api/telemetry/heartbeat/route.ts`
- Modify: `src/lib/telemetry.ts`

- [ ] **Step 1: Simplify resolveTelemetryContext — remove session upsert**

In `src/lib/telemetry.ts`, the session upsert (lines 92-107) creates a single session with `character_id: 0`. Remove this upsert block and the `sessionId` from the returned context. The heartbeat endpoint will handle sessions directly.

Replace the session upsert with a simpler approach — just return token and group info:

```typescript
// Remove the session upsert block entirely
// Change the return to not include sessionId:

return {
  ctx: {
    userId: tokenRow.user_id,
    characterUuid,
    characterId,
    accountId,
    groupId,
    serverId,
    tokenId: tokenRow.id,
  },
}
```

Remove `sessionId` from the `TelemetryContext` interface.

Note: Other endpoints that use `ctx.sessionId` (like `mvp-kill`) need to be updated to not rely on it. Check usages and remove references to `ctx.sessionId` — it was only used as a FK in `mvp_kills.telemetry_session_id` which is nullable.

- [ ] **Step 2: Rewrite heartbeat endpoint to upsert per-client sessions**

Replace `src/app/api/telemetry/heartbeat/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

interface HeartbeatClient {
  character_id: number
  account_id: number
  map: string
  name: string
  in_instance: boolean
  instance_name: string
}

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { config_version, client_version, clients, current_map } = body

  // Support both old format (current_map) and new format (clients array)
  const clientList: HeartbeatClient[] = clients ?? (current_map ? [{
    character_id: 0,
    account_id: 0,
    map: current_map,
    name: '',
    in_instance: false,
    instance_name: '',
  }] : [])

  const now = new Date().toISOString()

  // Upsert one session per client
  for (const client of clientList) {
    await supabase
      .from('telemetry_sessions')
      .upsert(
        {
          token_id: ctx.tokenId,
          user_id: ctx.userId,
          character_id: client.character_id,
          account_id: client.account_id,
          group_id: ctx.groupId,
          current_map: client.in_instance ? null : (client.map || null),
          character_name: client.name || null,
          client_version: client_version ?? null,
          in_instance: client.in_instance ?? false,
          instance_name: client.instance_name || null,
          last_heartbeat: now,
        },
        { onConflict: 'token_id,character_id' }
      )
  }

  // Clean stale sessions for this token (clients that disconnected)
  // Get character_ids from current heartbeat
  const activeCharIds = clientList.map(c => c.character_id)
  if (activeCharIds.length > 0) {
    // Delete sessions for this token that aren't in the current client list
    const { data: allSessions } = await supabase
      .from('telemetry_sessions')
      .select('id, character_id')
      .eq('token_id', ctx.tokenId)

    const staleIds = (allSessions ?? [])
      .filter(s => !activeCharIds.includes(s.character_id))
      .map(s => s.id)

    if (staleIds.length > 0) {
      await supabase
        .from('telemetry_sessions')
        .delete()
        .in('id', staleIds)
    }
  }

  // Get config version
  const { data: configRow } = await supabase
    .from('telemetry_sessions')
    .select('config_version')
    .eq('token_id', ctx.tokenId)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    status: 'ok',
    config_version: configRow?.config_version ?? 1,
  })
}
```

- [ ] **Step 3: Remove sessionId references from other endpoints**

Search for `ctx.sessionId` in all telemetry endpoints and replace with `null`:

- `src/app/api/telemetry/mvp-kill/route.ts` — `p_session_id: null`
- `src/app/api/telemetry/mvp-killer/route.ts` — `p_session_id: null`
- Any other endpoint using `ctx.sessionId`

- [ ] **Step 4: Verify build**

```bash
npx next build 2>&1 | head -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/telemetry/heartbeat/route.ts src/lib/telemetry.ts src/app/api/telemetry/mvp-kill/route.ts src/app/api/telemetry/mvp-killer/route.ts
git commit -m "feat: heartbeat upserts per-character sessions, cleans stale clients"
```

---

### Task 5: Update telemetry-tab.tsx for multi-client display

**Files:**
- Modify: `src/components/mvp/telemetry-tab.tsx`

- [ ] **Step 1: Update SessionsList to show multiple sessions per token**

The sessions list currently shows one entry per token. Now each token may have multiple sessions (one per character). Group sessions by token and show each character under the token:

In the `SessionsList` component, group sessions by `token_id`:

```tsx
{tokens.map((token) => {
  const tokenSessions = sessions.filter((s) => s.token_id === token.id);
  const anyOnline = tokenSessions.some((s) => isOnline(s.last_heartbeat));

  return (
    <div key={token.id} className="bg-bg border border-border rounded-md px-3 py-2 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            anyOnline ? "bg-status-available animate-pulse" : "bg-text-secondary"
          }`} />
          <span className="text-sm text-text-primary">{token.name ?? "Sniffer"}</span>
        </div>
        {/* revoke button stays here */}
      </div>
      {tokenSessions.map((s) => (
        <div key={s.id} className="flex items-center gap-2 pl-4">
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline(s.last_heartbeat) ? "bg-status-available" : "bg-text-secondary"}`} />
          <span className="text-xs text-text-secondary">
            {s.character_name ?? `Char #${s.character_id}`}
            {s.in_instance ? ` · ${s.instance_name || 'Instância'}` : s.current_map ? ` · ${s.current_map}` : ''}
          </span>
        </div>
      ))}
      {tokenSessions.length === 0 && (
        <span className="text-xs text-text-secondary pl-4">Último uso: {formatDateTimeBRT(token.last_used_at)}</span>
      )}
    </div>
  );
})}
```

- [ ] **Step 2: Add new fields to TelemetrySession interface**

```typescript
interface TelemetrySession {
  id: string;
  token_id: string;
  current_map: string | null;
  client_version: string | null;
  last_heartbeat: string;
  started_at: string;
  character_id: number;
  character_name: string | null;
  in_instance: boolean;
  instance_name: string | null;
}
```

Update the `fetchSessions` select to include the new fields:

```typescript
.select("id, token_id, current_map, client_version, last_heartbeat, started_at, character_id, character_name, in_instance, instance_name")
```

- [ ] **Step 3: Verify build**

```bash
npx next build 2>&1 | head -5
```

- [ ] **Step 4: Commit**

```bash
git add src/components/mvp/telemetry-tab.tsx
git commit -m "feat: telemetry tab shows per-character sessions with instance status"
```

---

### Task 6: Update use-telemetry-sessions hook for group hub

**Files:**
- Modify: `src/hooks/use-telemetry-sessions.ts`

The group hub shows green dots on members. Now each user may have multiple sessions (one per character). The hook should return all active sessions.

- [ ] **Step 1: Add character_name and instance fields to the hook**

```typescript
export interface ActiveTelemetryMember {
  userId: string
  characterId: number
  characterName: string | null
  currentMap: string | null
  lastHeartbeat: string
  inInstance: boolean
}
```

Update the select and mapping:

```typescript
const { data } = await supabase
  .from('telemetry_sessions')
  .select('user_id, character_id, character_name, current_map, last_heartbeat, in_instance')
  .eq('group_id', groupId)
  .gte('last_heartbeat', cutoff)

setSessions(
  data?.map((s) => ({
    userId: s.user_id,
    characterId: s.character_id,
    characterName: s.character_name,
    currentMap: s.current_map,
    lastHeartbeat: s.last_heartbeat,
    inInstance: s.in_instance ?? false,
  })) ?? []
)
```

- [ ] **Step 2: Update group hub tooltip to show character name and instance**

In `src/components/mvp/mvp-group-hub.tsx`, where the telemetry tooltip is rendered (search for `Telemetria ativa`), update to show character name and instance:

```tsx
title={`Telemetria ativa${session.characterName ? ` — ${session.characterName}` : ''}${session.inInstance ? ' (instância)' : session.currentMap ? ` — ${session.currentMap}` : ''}`}
```

- [ ] **Step 3: Verify build**

```bash
npx next build 2>&1 | head -5
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-telemetry-sessions.ts src/components/mvp/mvp-group-hub.tsx
git commit -m "feat: telemetry sessions show character name and instance status in group hub"
```

---

### Task 7: Merge, rebuild installer, deploy

- [ ] **Step 1: Merge web changes to main**

```bash
cd D:\rag\instance-tracker
git checkout main && git pull origin main
git merge worktree-golden-prancing-charm
git push origin main
```

- [ ] **Step 2: Rebuild installer (DO NOT publish — user decides)**

```bash
cd D:\rag\RO-PacketSniffer-CPP
cmake --build build-release --config Release
"/c/Program Files (x86)/Inno Setup 6/ISCC.exe" installer/claudinho.iss
```

Installer will be at: `D:\rag\RO-PacketSniffer-CPP\dist\Claudinho-1.1.0-setup.exe`

**NOTE:** Version bump and publishing requires explicit user approval.
