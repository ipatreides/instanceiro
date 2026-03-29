# Bio Lab Group Collapse + Broadcast Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse cooldown_group MVPs into single rows in the list, and capture Bio 5 broadcasts as pre-spawn alerts.

**Architecture:** Frontend groups MVPs by `cooldown_group` into representative rows. New telemetry endpoint receives broadcast codes from the C++ sniffer, stores them with 5-min TTL, and the frontend shows "Em breve" status for groups with active broadcasts.

**Tech Stack:** Next.js 16, React 19, Supabase (Postgres), C++ sniffer (Npcap/libpcap)

---

### Task 1: Collapse cooldown_group into single rows in the list

**Files:**
- Modify: `src/components/mvp/mvp-timer-list.tsx`

This is the highest-value change — reduces 19 Bio rows to 2.

- [ ] **Step 1: Add group display name map and grouping logic**

Add a constant map for group display names and a memo that collapses grouped MVPs into representative entries. Insert this after the existing `getEffectiveKill` callback (line ~50):

```tsx
const GROUP_DISPLAY_NAMES: Record<string, string> = {
  bio_lab_3: "Bio Lab 3",
  bio_lab_5: "Bio Lab 5",
};

// Collapse cooldown_group MVPs into a single representative per group
const { collapsedMvps, groupRepresentativeId } = useMemo(() => {
  const seen = new Set<string>();
  const representativeIds = new Map<string, number>();
  const result: Mvp[] = [];

  for (const mvp of mvps) {
    if (mvp.cooldown_group) {
      if (seen.has(mvp.cooldown_group)) continue;
      seen.add(mvp.cooldown_group);
      representativeIds.set(mvp.cooldown_group, mvp.id);
    }
    result.push(mvp);
  }

  return { collapsedMvps: result, groupRepresentativeId: representativeIds };
}, [mvps]);
```

- [ ] **Step 2: Use collapsedMvps for filtering and list rendering**

Replace all references to `mvps` in the filtering/active/inactive logic with `collapsedMvps`. Change the `filtered` memo:

```tsx
const filtered = useMemo(() => {
  return collapsedMvps.filter((m) => {
    if (!q) return true;
    const displayName = m.cooldown_group ? GROUP_DISPLAY_NAMES[m.cooldown_group] ?? m.name : m.name;
    return displayName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.map_name.toLowerCase().includes(q);
  });
}, [collapsedMvps, q]);
```

Change the active list loop (line ~66) to use `collapsedMvps`:

```tsx
for (const mvp of collapsedMvps) {
```

- [ ] **Step 3: Update row rendering to show group name**

In the active list rendering (line ~184), replace the name display:

```tsx
<div className="text-[11px] font-medium text-text-primary truncate">
  {mvp.cooldown_group ? GROUP_DISPLAY_NAMES[mvp.cooldown_group] ?? mvp.name : mvp.name}
</div>
```

Do the same in the inactive list (line ~231):

```tsx
<div className="text-[11px] text-text-secondary">
  {mvp.cooldown_group ? GROUP_DISPLAY_NAMES[mvp.cooldown_group] ?? mvp.name : mvp.name}
</div>
```

Remove the `⟷` cooldown_group indicator spans from both active and inactive rows (they're no longer needed since the row IS the group).

- [ ] **Step 4: Verify build passes**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/components/mvp/mvp-timer-list.tsx
git commit -m "feat: collapse cooldown_group MVPs into single rows in list"
```

---

### Task 2: Show specific MVP name in detail view

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`

When a grouped MVP is selected, the detail view should show which specific MVP died last.

- [ ] **Step 1: Resolve last killed MVP name for grouped entries**

In `mvp-tab.tsx`, find where `selectedKill` is resolved (around line 110-130). After the group kill resolution, add logic to find the specific MVP name:

```tsx
// Resolve the specific MVP name that was killed (for grouped MVPs)
const killedMvpName = useMemo(() => {
  if (!selectedMvp?.cooldown_group || !selectedKill) return null;
  // Find the MVP entry that matches the kill's mvp_id
  const killedMvp = mvps.find(m => m.id === selectedKill.mvp_id);
  return killedMvp?.name ?? null;
}, [selectedMvp, selectedKill, mvps]);
```

- [ ] **Step 2: Display killed MVP name in the detail header**

Find the detail header section (around line 358) that shows `selectedMvp.map_name`. Add the killed MVP name:

```tsx
<p className="text-[11px] text-text-secondary">
  {selectedMvp.map_name} · Respawn: {formatRespawn(selectedMvp.respawn_ms)}
  {selectedKill && selectedKill.kill_count > 0 && ` · ×${selectedKill.kill_count} kills`}
</p>
{killedMvpName && (
  <p className="text-[10px] text-text-secondary">
    Último: {killedMvpName}
  </p>
)}
```

- [ ] **Step 3: Update the detail title for grouped MVPs**

Find where `selectedMvp.name` is used as the detail title and replace with group display name:

```tsx
{selectedMvp.cooldown_group
  ? (GROUP_DISPLAY_NAMES[selectedMvp.cooldown_group] ?? selectedMvp.name)
  : selectedMvp.name}
```

Add the same `GROUP_DISPLAY_NAMES` constant at the top of the file (or extract to a shared module if preferred).

- [ ] **Step 4: Verify build passes**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: show specific MVP name in detail view for grouped entries"
```

---

### Task 3: Add kill history with MVP name for grouped entries

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`

Kill history for grouped MVPs should fetch kills from ALL MVPs in the group and show which specific MVP each kill was for.

- [ ] **Step 1: Update history fetch to include all group MVP IDs**

Find the kill history fetch (search for `mvp_kill_history` or the history query). Modify it to fetch kills for all MVPs in the cooldown group:

```tsx
// Build MVP IDs for history query
const historyMvpIds = selectedMvp.cooldown_group
  ? mvps.filter(m => m.cooldown_group === selectedMvp.cooldown_group).map(m => m.id)
  : [selectedMvp.id];
```

Update the Supabase query to use `.in('mvp_id', historyMvpIds)` instead of `.eq('mvp_id', selectedMvp.id)`.

- [ ] **Step 2: Add mvp_id to history query select and display MVP name**

Add `mvp_id` to the history select fields. In the history rendering, show the specific MVP name:

```tsx
interface KillHistoryEntry {
  id: string;
  killed_at: string;
  killer_name: string | null;
  registered_by_name: string;
  tomb_x: number | null;
  tomb_y: number | null;
  mvp_id: number;
}
```

Build a name lookup map:

```tsx
const mvpNameMap = useMemo(() => {
  const map = new Map<number, string>();
  for (const m of mvps) map.set(m.id, m.name);
  return map;
}, [mvps]);
```

In the history row rendering, show the MVP name when it's a grouped entry:

```tsx
{selectedMvp.cooldown_group && entry.mvp_id && (
  <span className="text-[9px] text-text-secondary">
    {mvpNameMap.get(entry.mvp_id) ?? ""}
  </span>
)}
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: show grouped MVP kill history with individual MVP names"
```

---

### Task 4: Create broadcast events table and API endpoint

**Files:**
- Create: `supabase/migrations/20260329700000_broadcast_events.sql`
- Create: `src/app/api/telemetry/mvp-broadcast/route.ts`

- [ ] **Step 1: Create migration for broadcast_events table**

```sql
CREATE TABLE mvp_broadcast_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES mvp_groups(id) ON DELETE CASCADE,
  cooldown_group TEXT NOT NULL,
  code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  mvp_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX idx_broadcast_events_active
  ON mvp_broadcast_events (group_id, cooldown_group)
  WHERE expires_at > NOW();
```

- [ ] **Step 2: Apply migration to remote database**

Run: `npx supabase db query --linked -f supabase/migrations/20260329700000_broadcast_events.sql`

- [ ] **Step 3: Create the API endpoint**

Create `src/app/api/telemetry/mvp-broadcast/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

// Bio 5 broadcast codes → event types and MVP names
const BIO5_CODES: Record<string, { type: string; mvp?: string }> = {
  YGjm: { type: 'pre_spawn' },
  YWjm: { type: 'summon', mvp: 'Rune Knight Seyren' },
  Ymjm: { type: 'summon', mvp: 'Mechanic Howard' },
  Y2jm: { type: 'summon', mvp: 'Guillotine Cross Eremes' },
  ZGjm: { type: 'summon', mvp: 'Warlock Kathryne' },
  ZWjm: { type: 'summon', mvp: 'Archbishop Margaretha' },
  Zmjm: { type: 'summon', mvp: 'Ranger Cecil' },
  Z2jm: { type: 'summon', mvp: 'Royal Guard Randel' },
  aGjm: { type: 'summon', mvp: 'Genetic Flamel' },
  aWjm: { type: 'summon', mvp: 'Shadow Chaser Gertie' },
  amjm: { type: 'summon', mvp: 'Sorcerer Celia' },
  a2jm: { type: 'summon', mvp: 'Sura Chen' },
  bGjm: { type: 'summon', mvp: 'Wanderer Trentini' },
  bWjm: { type: 'summon', mvp: 'Minstrel Alphoccio' },
  gGjm: { type: 'mvp_spawn', mvp: 'Guillotine Cross Eremes' },
  gmjm: { type: 'mvp_spawn', mvp: 'Archbishop Margaretha' },
  hGjm: { type: 'mvp_spawn', mvp: 'Ranger Cecil' },
  hmjm: { type: 'mvp_spawn', mvp: 'Mechanic Howard' },
  iGjm: { type: 'mvp_spawn', mvp: 'Warlock Kathryne' },
  imjm: { type: 'mvp_spawn', mvp: 'Rune Knight Seyren' },
  jGjm: { type: 'mvp_spawn', mvp: 'Royal Guard Randel' },
  jmjm: { type: 'mvp_spawn', mvp: 'Genetic Flamel' },
  kGjm: { type: 'mvp_spawn', mvp: 'Sorcerer Celia' },
  kmjm: { type: 'mvp_spawn', mvp: 'Sura Chen' },
  lGjm: { type: 'mvp_spawn', mvp: 'Shadow Chaser Gertie' },
  lmjm: { type: 'mvp_spawn', mvp: 'Minstrel Alphoccio' },
  mGjm: { type: 'mvp_spawn', mvp: 'Wanderer Trentini' },
  mmjm: { type: 'mvp_killed_success' },
  mWjm: { type: 'mvp_killed_respawn' },
  fmjm: { type: 'failed' },
  fWjm: { type: 'waiting' },
}

// Map names the sniffer might send → cooldown_group
const MAP_TO_GROUP: Record<string, string> = {
  lhz_dun_n: 'bio_lab_5',
  lhz_dun05: 'bio_lab_5',
}

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const { code, map } = await request.json()

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const info = BIO5_CODES[code]
  if (!info) {
    return NextResponse.json({ action: 'ignored', reason: 'unknown code' })
  }

  const cleanMap = map?.replace('.gat', '') ?? ''
  const cooldownGroup = MAP_TO_GROUP[cleanMap]
  if (!cooldownGroup) {
    return NextResponse.json({ action: 'ignored', reason: 'unknown map' })
  }

  // Upsert: update expires_at on every broadcast (resets the 5-min TTL)
  const { error } = await supabase
    .from('mvp_broadcast_events')
    .upsert(
      {
        group_id: ctx.groupId,
        cooldown_group: cooldownGroup,
        code,
        event_type: info.type,
        mvp_name: info.mvp ?? null,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      { onConflict: 'group_id,cooldown_group' }
    )

  if (error) {
    return NextResponse.json({ error: 'Failed to store broadcast' }, { status: 500 })
  }

  return NextResponse.json({ action: 'stored', event_type: info.type }, { status: 200 })
}
```

- [ ] **Step 4: Add unique constraint for upsert**

Update the migration to include the unique constraint:

```sql
ALTER TABLE mvp_broadcast_events
  ADD CONSTRAINT uq_broadcast_group_cooldown UNIQUE (group_id, cooldown_group);
```

- [ ] **Step 5: Verify build passes**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260329700000_broadcast_events.sql src/app/api/telemetry/mvp-broadcast/route.ts
git commit -m "feat: broadcast events table and telemetry endpoint for Bio 5 alerts"
```

---

### Task 5: Clean broadcasts on kill registration

**Files:**
- Modify: `supabase/migrations/20260329800000_clean_broadcasts_on_kill.sql`

When a kill is registered for a cooldown_group, delete active broadcasts.

- [ ] **Step 1: Update telemetry_register_kill to clean broadcasts**

Create migration that replaces the function, adding broadcast cleanup after the sighting cleanup lines:

```sql
-- Add broadcast cleanup to kill registration
-- After: DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
-- Add:   DELETE FROM mvp_broadcast_events WHERE group_id = p_group_id AND cooldown_group = (SELECT cooldown_group FROM mvps WHERE id = p_mvp_ids[1]);
```

The full function replacement should include the existing body from the latest migration (`20260329500000`) plus the broadcast cleanup added after each `DELETE FROM mvp_sightings` line:

```sql
DELETE FROM mvp_broadcast_events
  WHERE group_id = p_group_id
    AND cooldown_group = (SELECT cooldown_group FROM mvps WHERE id = p_mvp_ids[1]);
```

Add this line in BOTH places (after the update path's sighting delete AND after the insert path's sighting delete).

- [ ] **Step 2: Apply migration and verify no overload**

Run the migration, then verify only one function exists:

```bash
npx supabase db query --linked -f supabase/migrations/20260329800000_clean_broadcasts_on_kill.sql
```

Then verify:

```sql
SELECT COUNT(*) FROM pg_proc WHERE proname = 'telemetry_register_kill';
-- Expected: 1
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260329800000_clean_broadcasts_on_kill.sql
git commit -m "feat: clean broadcast events when kill is registered"
```

---

### Task 6: Add broadcast capture to C++ sniffer

**Files:**
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\private\packets\receive\BroadcastChat.cpp`
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\private\telemetry\TelemetryClient.cpp`
- Modify: `D:\rag\RO-PacketSniffer-CPP\src\public\telemetry\TelemetryClient.h`

- [ ] **Step 1: Add on_broadcast method to TelemetryClient header**

In `TelemetryClient.h`, add the method declaration alongside the other `on_` methods:

```cpp
void on_broadcast(const std::string& code, const std::string& map);
```

- [ ] **Step 2: Implement on_broadcast in TelemetryClient.cpp**

Add after `on_mvp_killer`:

```cpp
void TelemetryClient::on_broadcast(const std::string& code, const std::string& map)
{
    if (!m_enabled) return;

    nlohmann::json body = {
        {"code", code},
        {"map", strip_gat(map)}
    };

    send_telemetry("POST", "telemetry/mvp-broadcast", body);
}
```

- [ ] **Step 3: Add Bio 5 broadcast detection to BroadcastChat.cpp**

Add includes and a static set at the top of BroadcastChat.cpp:

```cpp
#include "telemetry/TelemetryClient.h"
#include "gameplay/character/Character.h"
#include <unordered_set>

static const std::unordered_set<std::string> BIO5_CODES = {
    "YGjm", "YWjm", "Ymjm", "Y2jm", "ZGjm", "ZWjm", "Zmjm", "Z2jm",
    "aGjm", "aWjm", "amjm", "a2jm", "bGjm", "bWjm",
    "gGjm", "gmjm", "hGjm", "hmjm", "iGjm", "imjm", "jGjm", "jmjm",
    "kGjm", "kmjm", "lGjm", "lmjm", "mGjm",
    "mmjm", "mWjm", "fmjm", "fWjm",
};
```

At the end of `deserialize_internal`, before the log file write, add:

```cpp
    // Check for Bio 5 broadcast codes
    if ((pk_header == ReceivePacketTable::LOCAL_BROADCAST_0 ||
         pk_header == ReceivePacketTable::LOCAL_BROADCAST_1) &&
        TelemetryClient::instance().is_enabled())
    {
        // Extract the code (message content after stripping nulls)
        std::string code = message;
        // Remove any non-printable chars
        std::string clean_code;
        for (char c : code) {
            if (c >= 0x20 && c <= 0x7E) clean_code += c;
        }

        if (BIO5_CODES.count(clean_code) > 0) {
            std::string map;
            Character::get_map(pid, map);
            if (map.empty()) map = TelemetryClient::instance().get_current_map();
            TelemetryClient::instance().on_broadcast(clean_code, map);
        }
    }
```

- [ ] **Step 4: Build the sniffer**

Run: `cmake --build build --config Debug`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/private/packets/receive/BroadcastChat.cpp src/private/telemetry/TelemetryClient.cpp src/public/telemetry/TelemetryClient.h
git commit -m "feat: capture Bio 5 broadcasts and forward to telemetry API"
```

---

### Task 7: Frontend — show broadcast alerts in list

**Files:**
- Create: `src/hooks/use-mvp-broadcasts.ts`
- Modify: `src/components/mvp/mvp-timer-list.tsx`
- Modify: `src/components/mvp/mvp-tab.tsx`

- [ ] **Step 1: Create the broadcast hook**

Create `src/hooks/use-mvp-broadcasts.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface MvpBroadcast {
  cooldown_group: string;
  event_type: string;
  mvp_name: string | null;
  expires_at: string;
}

export function useMvpBroadcasts(groupId: string | null) {
  const [broadcasts, setBroadcasts] = useState<MvpBroadcast[]>([]);

  useEffect(() => {
    if (!groupId) return;

    const supabase = createClient();

    async function fetch() {
      const { data } = await supabase
        .from("mvp_broadcast_events")
        .select("cooldown_group, event_type, mvp_name, expires_at")
        .eq("group_id", groupId!)
        .gt("expires_at", new Date().toISOString());

      setBroadcasts(data ?? []);
    }

    fetch();

    const channel = supabase
      .channel("mvp-broadcasts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mvp_broadcast_events",
          filter: `group_id=eq.${groupId}`,
        },
        () => fetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  return broadcasts;
}
```

- [ ] **Step 2: Wire broadcasts into MvpTimerList**

Add a new prop to `MvpTimerListProps`:

```typescript
broadcasts?: MvpBroadcast[];
```

Import the type:

```typescript
import type { MvpBroadcast } from "@/hooks/use-mvp-broadcasts";
```

In the active sort logic, add broadcasts as highest priority (above sightings):

```typescript
active.sort((a, b) => {
  const aBroadcast = a.mvp.cooldown_group && broadcasts?.some(
    br => br.cooldown_group === a.mvp.cooldown_group && new Date(br.expires_at) > new Date()
  );
  const bBroadcast = b.mvp.cooldown_group && broadcasts?.some(
    br => br.cooldown_group === b.mvp.cooldown_group && new Date(br.expires_at) > new Date()
  );
  if (aBroadcast && !bBroadcast) return -1;
  if (!aBroadcast && bBroadcast) return 1;
  // ... existing sighting and timer sort
});
```

In the row rendering, show pulsing "Em breve" for broadcast-active groups:

```typescript
const hasBroadcast = mvp.cooldown_group && broadcasts?.some(
  br => br.cooldown_group === mvp.cooldown_group && new Date(br.expires_at) > new Date()
);
```

Use `hasBroadcast` alongside `hasSighting` for the timer color and display:

```tsx
{hasBroadcast ? (
  <span className="text-[11px] font-bold animate-pulse" style={{ color: "var(--status-available-text)" }}>
    Em breve
  </span>
) : hasSighting ? (
  // ... existing sighting display
```

- [ ] **Step 3: Wire hook in mvp-tab.tsx**

Import and call the hook:

```typescript
import { useMvpBroadcasts } from "@/hooks/use-mvp-broadcasts";

// Inside the component:
const broadcasts = useMvpBroadcasts(activeGroup?.id ?? null);
```

Pass to MvpTimerList:

```tsx
<MvpTimerList ... broadcasts={broadcasts} />
```

- [ ] **Step 4: Verify build passes**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-mvp-broadcasts.ts src/components/mvp/mvp-timer-list.tsx src/components/mvp/mvp-tab.tsx
git commit -m "feat: show Bio 5 broadcast alerts in MVP list with pulsing status"
```

---

### Task 8: Add broadcast MVP to inactive → active promotion

**Files:**
- Modify: `src/components/mvp/mvp-timer-list.tsx`

Groups with active broadcasts should appear in the active section even if they have no kill timer.

- [ ] **Step 1: Promote broadcast-active groups to active list**

After the sighting promotion loop (line ~79-87), add broadcast promotion:

```typescript
// Groups with active broadcasts → show in active list
if (broadcasts) {
  for (const br of broadcasts) {
    if (new Date(br.expires_at) <= new Date()) continue;
    // Find the representative MVP for this group
    const repId = groupRepresentativeId.get(br.cooldown_group);
    if (repId && !activeIds.has(repId)) {
      const mvp = collapsedMvps.find(m => m.id === repId);
      if (mvp) {
        active.push({ mvp, kill: getEffectiveKill(mvp) ?? null });
        activeIds.add(repId);
      }
    }
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build 2>&1 | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/components/mvp/mvp-timer-list.tsx
git commit -m "feat: promote broadcast-active groups to active section"
```

---

### Task 9: Merge to main and deploy

- [ ] **Step 1: Merge worktree to main and push**

```bash
cd D:\rag\instance-tracker
git checkout main && git pull origin main
git merge worktree-golden-prancing-charm
git push origin main
```

- [ ] **Step 2: Verify deployment**

Check Vercel deployment status and test the collapsed list in production.
