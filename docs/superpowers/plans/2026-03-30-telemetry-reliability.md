# Telemetry Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix MVP kill data inconsistencies by refactoring the telemetry pipeline, adding a kill validation system, and providing observability tools.

**Architecture:** Extract shared telemetry logic from duplicated route handlers into `src/lib/telemetry/`. Add `telemetry_event_log` table for observability, `validation_status` + `mvp_kill_witnesses` for kill validation. Fix 6 identified bugs in timestamp reconstruction, dedup, and race conditions. Clean up existing bad data via migration.

**Tech Stack:** Next.js 16 API routes, Supabase (PostgreSQL RPCs, Realtime), React 19 hooks, Tailwind CSS v4, Jest

**Spec:** `docs/superpowers/specs/2026-03-30-telemetry-reliability-design.md`

**Out of scope (separate plan):** Sniffer C++ changes (kill buffer, config reload) — different repo (`RO-PacketSniffer-CPP`). The backend changes in this plan are designed to work with both old and new sniffer versions.

---

## File Structure

### New Files
- `src/lib/telemetry/resolve-context.ts` — token validation + user→group resolution (extracted from `src/lib/telemetry.ts`)
- `src/lib/telemetry/resolve-mvp.ts` — monster_id→mvp_ids lookup with map whitelist
- `src/lib/telemetry/validate-payload.ts` — timestamp sanity checks + payload validation
- `src/lib/telemetry/log-event.ts` — fire-and-forget event log insertion
- `src/lib/telemetry/index.ts` — re-exports
- `src/lib/__tests__/telemetry-validate-payload.test.ts` — unit tests for validation
- `src/lib/__tests__/telemetry-resolve-mvp.test.ts` — unit tests for MVP resolution
- `src/app/api/telemetry/mvp-event/route.ts` — consolidated kill endpoint
- `src/app/api/mvp-kills/validate/route.ts` — confirm/correct kill endpoint
- `supabase/migrations/20260330100000_telemetry_event_log.sql` — event log table
- `supabase/migrations/20260330200000_kill_validation.sql` — validation fields + witnesses table + updated RPCs
- `supabase/migrations/20260330300000_cleanup_bad_data.sql` — dedup + ghost kill cleanup
- `supabase/migrations/20260330400000_config_version_tracking.sql` — config version trigger

### Modified Files
- `src/lib/telemetry.ts` → gutted, re-exports from `src/lib/telemetry/index.ts` for backward compat
- `src/app/api/telemetry/mvp-kill/route.ts` — use shared lib + bugfix (Bug 3)
- `src/app/api/telemetry/mvp-killer/route.ts` — use shared lib + bugfixes (Bugs 1, 2, 5)
- `src/app/api/telemetry/mvp-tomb/route.ts` — use RPC instead of raw UPDATE (Bug 4)
- `src/app/api/telemetry/mvp-spotted/route.ts` — use shared lib
- `src/app/api/telemetry/heartbeat/route.ts` — add config_stale detection + event logging
- `src/app/api/telemetry/config/route.ts` — config version from new tracking
- `src/lib/types.ts` — add validation fields to `MvpActiveKill`, add `TelemetryEventLog` type
- `src/hooks/use-mvp-timers.ts` — add `confirmKill`, `correctKill` methods + handle validation_status in realtime
- `src/components/mvp/mvp-timer-row.tsx` — validation badges + confirm/correct buttons
- `src/components/mvp/mvp-tab.tsx` — pass witnesses to timer rows

---

## Task 1: Shared Telemetry Lib — Validation & MVP Resolution

**Files:**
- Create: `src/lib/telemetry/validate-payload.ts`
- Create: `src/lib/telemetry/resolve-mvp.ts`
- Create: `src/lib/__tests__/telemetry-validate-payload.test.ts`

- [ ] **Step 1: Write failing tests for timestamp validation**

```typescript
// src/lib/__tests__/telemetry-validate-payload.test.ts
import { validateTimestamp, reconstructKilledAt } from '../telemetry/validate-payload'

describe('validateTimestamp', () => {
  it('accepts timestamp within valid range', () => {
    const now = Date.now()
    const fiveMinAgo = Math.floor((now - 5 * 60 * 1000) / 1000)
    expect(validateTimestamp(fiveMinAgo)).toEqual({ valid: true, date: expect.any(Date) })
  })

  it('rejects timestamp more than 60s in the future', () => {
    const future = Math.floor((Date.now() + 120_000) / 1000)
    expect(validateTimestamp(future)).toEqual({ valid: false, reason: 'timestamp_future' })
  })

  it('rejects timestamp more than 24h in the past', () => {
    const old = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000)
    expect(validateTimestamp(old)).toEqual({ valid: false, reason: 'timestamp_stale' })
  })

  it('rejects non-numeric timestamp', () => {
    expect(validateTimestamp(null as any)).toEqual({ valid: false, reason: 'timestamp_invalid' })
    expect(validateTimestamp(NaN)).toEqual({ valid: false, reason: 'timestamp_invalid' })
  })
})

describe('reconstructKilledAt', () => {
  it('builds UTC date from BRT hour:minute anchored to reference date', () => {
    // Reference: 2026-03-30T14:30:00Z, tomb says 11:00 BRT (= 14:00 UTC)
    const ref = new Date('2026-03-30T14:30:00Z')
    const result = reconstructKilledAt(11, 0, ref)
    expect(result.getUTCHours()).toBe(14)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCDate()).toBe(30)
  })

  it('subtracts a day if inferred time is after reference', () => {
    // Reference: 2026-03-30T01:00:00Z (= 29/03 22:00 BRT), tomb says 23:50 BRT
    // 23:50 BRT on 30/03 = 02:50 UTC on 30/03 -> after reference, so go back a day
    const ref = new Date('2026-03-30T01:00:00Z')
    const result = reconstructKilledAt(23, 50, ref)
    // Should be 29/03 23:50 BRT = 30/03 02:50 UTC... minus 1 day = 29/03 02:50 UTC
    expect(result.getUTCDate()).toBe(29)
  })

  it('returns null if no hour/minute provided', () => {
    expect(reconstructKilledAt(null as any, null as any, new Date())).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/lib/__tests__/telemetry-validate-payload.test.ts --no-cache`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement validate-payload.ts**

```typescript
// src/lib/telemetry/validate-payload.ts

const MAX_FUTURE_MS = 60_000      // 60 seconds
const MAX_AGE_MS = 24 * 3600_000  // 24 hours
const BRT_TIMEZONE = 'America/Sao_Paulo'

type TimestampResult =
  | { valid: true; date: Date }
  | { valid: false; reason: 'timestamp_future' | 'timestamp_stale' | 'timestamp_invalid' }

export function validateTimestamp(epochSeconds: number): TimestampResult {
  if (epochSeconds == null || typeof epochSeconds !== 'number' || isNaN(epochSeconds)) {
    return { valid: false, reason: 'timestamp_invalid' }
  }

  const ms = epochSeconds * 1000
  const now = Date.now()

  if (ms > now + MAX_FUTURE_MS) {
    return { valid: false, reason: 'timestamp_future' }
  }
  if (ms < now - MAX_AGE_MS) {
    return { valid: false, reason: 'timestamp_stale' }
  }

  return { valid: true, date: new Date(ms) }
}

/**
 * Reconstruct a full UTC Date from tomb hour:minute (BRT) using a reference date as anchor.
 * The reference date determines which calendar day to use.
 * If the inferred time is after the reference, subtracts one day (tomb read from previous day's kill).
 */
export function reconstructKilledAt(
  killHour: number | null | undefined,
  killMinute: number | null | undefined,
  reference: Date
): Date | null {
  if (killHour == null || killMinute == null || killHour < 0 || killMinute < 0) {
    return null
  }

  // Get current BRT offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BRT_TIMEZONE,
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(reference)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT-3'
  const offsetMatch = offsetPart.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3

  // Get reference date in BRT
  const brtDateStr = reference.toLocaleDateString('en-CA', { timeZone: BRT_TIMEZONE })
  const isoStr = `${brtDateStr}T${String(killHour).padStart(2, '0')}:${String(killMinute).padStart(2, '0')}:00Z`
  const result = new Date(isoStr)
  result.setHours(result.getHours() - offsetHours)

  // If inferred time is after the reference, it's from the previous day
  if (result.getTime() > reference.getTime()) {
    result.setDate(result.getDate() - 1)
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/telemetry-validate-payload.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Implement resolve-mvp.ts**

```typescript
// src/lib/telemetry/resolve-mvp.ts
import type { SupabaseClient } from '@supabase/supabase-js'

interface ResolveMvpResult {
  mvpIds: number[]
  ignored: boolean
  reason?: string
}

/**
 * Resolve monster_id + map → mvp_ids using map whitelist.
 * If map doesn't exist in mvps table, returns ignored (likely instance).
 * Single source of truth for MVP resolution across all telemetry endpoints.
 */
export async function resolveMvpIds(
  supabase: SupabaseClient,
  serverId: number,
  monsterId: number,
  map: string | null | undefined
): Promise<ResolveMvpResult> {
  const resolvedMap = (map && map !== 'unknown') ? map : null

  if (resolvedMap) {
    // Map-specific lookup (strict whitelist)
    const { data: mvpRows } = await supabase
      .from('mvps')
      .select('id')
      .eq('monster_id', monsterId)
      .eq('server_id', serverId)
      .eq('map_name', resolvedMap)

    if (!mvpRows || mvpRows.length === 0) {
      return { mvpIds: [], ignored: true, reason: 'map not in mvps whitelist (likely instance)' }
    }

    return { mvpIds: mvpRows.map(m => m.id), ignored: false }
  }

  // No map provided — cannot verify, ignore
  return { mvpIds: [], ignored: true, reason: 'no map provided' }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/telemetry/validate-payload.ts src/lib/telemetry/resolve-mvp.ts src/lib/__tests__/telemetry-validate-payload.test.ts
git commit -m "feat: add shared telemetry validation and MVP resolution"
```

---

## Task 2: Shared Telemetry Lib — Event Logging & Context Resolution

**Files:**
- Create: `src/lib/telemetry/log-event.ts`
- Create: `src/lib/telemetry/resolve-context.ts`
- Create: `src/lib/telemetry/index.ts`
- Modify: `src/lib/telemetry.ts`

- [ ] **Step 1: Create log-event.ts**

```typescript
// src/lib/telemetry/log-event.ts
import type { SupabaseClient } from '@supabase/supabase-js'

interface LogEventParams {
  endpoint: string
  tokenId: string | null
  characterId: string | null
  payloadSummary: Record<string, unknown>
  result: 'created' | 'updated' | 'ignored' | 'error'
  reason?: string
  killId?: string | null
}

/**
 * Fire-and-forget telemetry event log insertion.
 * Never throws — failures are silently dropped.
 */
export function logTelemetryEvent(supabase: SupabaseClient, params: LogEventParams): void {
  supabase
    .from('telemetry_event_log')
    .insert({
      endpoint: params.endpoint,
      token_id: params.tokenId,
      character_id: params.characterId,
      payload_summary: params.payloadSummary,
      result: params.result,
      reason: params.reason ?? null,
      kill_id: params.killId ?? null,
    })
    .then(() => {})
}
```

- [ ] **Step 2: Move resolve-context.ts from telemetry.ts**

```typescript
// src/lib/telemetry/resolve-context.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { NextRequest } from 'next/server'

export interface TelemetryContext {
  userId: string
  characterUuid: string
  characterId: string
  accountId: string
  groupId: string
  serverId: number
  tokenId: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function resolveTelemetryContext(
  request: NextRequest
): Promise<{ ctx: TelemetryContext } | { error: string; status: number }> {
  const token = request.headers.get('x-api-token')
  const accountId = request.headers.get('x-account-id') ?? ''
  const characterId = request.headers.get('x-character-id') ?? ''

  if (!token) {
    return { error: 'Missing required headers', status: 400 }
  }

  const supabase = createAdminClient()
  const tokenHash = hashToken(token)

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('telemetry_tokens')
    .select('id, user_id, last_used_at')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .single()

  if (tokenErr || !tokenRow) {
    return { error: 'Invalid or revoked token', status: 401 }
  }

  if (tokenRow.last_used_at) {
    const lastUsed = new Date(tokenRow.last_used_at).getTime()
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    if (lastUsed < oneHourAgo) {
      await supabase
        .from('telemetry_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenRow.id)
      return { error: 'Token expired due to inactivity', status: 401 }
    }
  }

  // Fire and forget
  supabase
    .from('telemetry_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id)
    .then(() => {})

  const { data: membership, error: memberErr } = await supabase
    .from('mvp_group_members')
    .select('group_id, character_id, mvp_groups!inner(server_id)')
    .eq('user_id', tokenRow.user_id)
    .limit(1)
    .single()

  if (memberErr || !membership) {
    return { error: 'Character not in a group', status: 404 }
  }

  const groupId = membership.group_id as string
  const characterUuid = membership.character_id as string
  const serverId = (membership as any).mvp_groups.server_id as number

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
}

export { hashToken }
```

- [ ] **Step 3: Create index.ts re-exports**

```typescript
// src/lib/telemetry/index.ts
export { resolveTelemetryContext, hashToken } from './resolve-context'
export type { TelemetryContext } from './resolve-context'
export { resolveMvpIds } from './resolve-mvp'
export { validateTimestamp, reconstructKilledAt } from './validate-payload'
export { logTelemetryEvent } from './log-event'
```

- [ ] **Step 4: Update old telemetry.ts to re-export**

Replace `src/lib/telemetry.ts` with:

```typescript
// src/lib/telemetry.ts
// Backward compatibility — all logic moved to src/lib/telemetry/
export { resolveTelemetryContext, hashToken } from './telemetry/resolve-context'
export type { TelemetryContext } from './telemetry/resolve-context'
```

- [ ] **Step 5: Run existing tests to verify nothing broke**

Run: `npx jest --no-cache`
Expected: All existing tests pass (the re-export preserves the same API)

- [ ] **Step 6: Commit**

```bash
git add src/lib/telemetry/ src/lib/telemetry.ts
git commit -m "refactor: extract telemetry lib into shared modules"
```

---

## Task 3: Database Migrations — Event Log + Validation Schema

**Files:**
- Create: `supabase/migrations/20260330100000_telemetry_event_log.sql`
- Create: `supabase/migrations/20260330200000_kill_validation.sql`

- [ ] **Step 1: Create event log migration**

```sql
-- supabase/migrations/20260330100000_telemetry_event_log.sql
-- Telemetry event log for observability (7-day retention)

CREATE TABLE telemetry_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint TEXT NOT NULL,
  token_id UUID REFERENCES telemetry_tokens(id) ON DELETE SET NULL,
  character_id UUID,
  payload_summary JSONB,
  result TEXT NOT NULL,
  reason TEXT,
  kill_id UUID REFERENCES mvp_kills(id) ON DELETE SET NULL
);

CREATE INDEX idx_tel_event_log_timestamp ON telemetry_event_log(timestamp DESC);
CREATE INDEX idx_tel_event_log_token ON telemetry_event_log(token_id);
CREATE INDEX idx_tel_event_log_result ON telemetry_event_log(result);

-- No RLS — accessed only via service role from API routes

-- Retention: delete events older than 7 days
-- Called from heartbeat endpoint as fire-and-forget cleanup
CREATE OR REPLACE FUNCTION cleanup_telemetry_event_log()
RETURNS void AS $$
BEGIN
  DELETE FROM telemetry_event_log WHERE timestamp < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Create validation schema migration**

```sql
-- supabase/migrations/20260330200000_kill_validation.sql
-- Kill validation system: status + witnesses

-- Add validation fields to mvp_kills
ALTER TABLE mvp_kills
  ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN validated_by UUID REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN validated_at TIMESTAMPTZ;

-- Set existing telemetry kills to 'pending' (manual stays 'confirmed')
UPDATE mvp_kills SET validation_status = 'pending' WHERE source = 'telemetry';

-- Witnesses table
CREATE TABLE mvp_kill_witnesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kill_id UUID NOT NULL REFERENCES mvp_kills(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_name TEXT NOT NULL,
  UNIQUE(kill_id, user_id)
);

CREATE INDEX idx_kill_witnesses_kill ON mvp_kill_witnesses(kill_id);
CREATE INDEX idx_kill_witnesses_user ON mvp_kill_witnesses(user_id);

-- Update get_group_active_kills to include validation fields
CREATE OR REPLACE FUNCTION get_group_active_kills(p_group_id UUID, p_server_id INT)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT DISTINCT ON (k.mvp_id)
      k.id AS kill_id,
      k.mvp_id,
      k.killed_at,
      k.tomb_x,
      k.tomb_y,
      k.killer_character_id,
      k.registered_by,
      k.edited_by,
      k.source,
      k.killer_name_raw,
      k.validation_status,
      k.validated_by,
      k.validated_at,
      kc.name AS killer_name,
      rc.name AS registered_by_name,
      ec.name AS edited_by_name,
      vc.name AS validated_by_name,
      (SELECT count(*) FROM mvp_kills k2
       WHERE k2.mvp_id = k.mvp_id
       AND k2.group_id IS NOT DISTINCT FROM p_group_id)::int AS kill_count,
      (SELECT count(*) FROM mvp_kill_loots l
       WHERE l.kill_id = k.id
       AND l.source = 'telemetry'
       AND l.accepted IS NULL)::int AS pending_loots_count
    FROM mvp_kills k
    LEFT JOIN characters kc ON kc.id = k.killer_character_id
    LEFT JOIN characters rc ON rc.id = k.registered_by
    LEFT JOIN characters ec ON ec.id = k.edited_by
    LEFT JOIN characters vc ON vc.id = k.validated_by
    JOIN mvps m ON m.id = k.mvp_id AND m.server_id = p_server_id
    WHERE k.group_id IS NOT DISTINCT FROM p_group_id
    ORDER BY k.mvp_id, k.killed_at DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Update telemetry_register_kill to populate witnesses and set validation_status
CREATE OR REPLACE FUNCTION telemetry_register_kill(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'telemetry',
  p_session_id UUID DEFAULT NULL,
  p_killer_name TEXT DEFAULT NULL,
  p_killer_char_id UUID DEFAULT NULL,
  p_update_only BOOLEAN DEFAULT FALSE
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
  v_dedup_cutoff TIMESTAMPTZ;
  v_respawn_ms INT;
  v_map_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  SELECT respawn_ms, map_name INTO v_respawn_ms, v_map_name FROM mvps WHERE id = p_mvp_ids[1];
  v_respawn_ms := COALESCE(v_respawn_ms, 3540000);

  v_dedup_cutoff := p_killed_at - make_interval(secs := GREATEST((v_respawn_ms - 60000) / 1000.0, 60));

  SELECT id INTO v_existing_id
  FROM mvp_kills
  WHERE group_id = p_group_id
    AND mvp_id = ANY(p_mvp_ids)
    AND killed_at >= v_dedup_cutoff
  ORDER BY killed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE mvp_kills SET
      killer_name_raw = COALESCE(p_killer_name, killer_name_raw),
      killer_character_id = COALESCE(p_killer_char_id, killer_character_id),
      tomb_x = COALESCE(p_tomb_x, tomb_x),
      tomb_y = COALESCE(p_tomb_y, tomb_y),
      killed_at = CASE
        WHEN p_killer_name IS NOT NULL AND p_killed_at IS NOT NULL THEN p_killed_at
        ELSE killed_at
      END,
      updated_at = NOW()
    WHERE id = v_existing_id;

    DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id);
  END IF;

  IF p_update_only THEN
    RETURN json_build_object('action', 'ignored', 'kill_id', NULL);
  END IF;

  -- Set validation_status based on source
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    killer_character_id, killer_name_raw, registered_by, source, telemetry_session_id,
    validation_status)
  VALUES (p_group_id, p_mvp_ids[1], p_killed_at, p_tomb_x, p_tomb_y,
    p_killer_char_id, p_killer_name, p_registered_by, p_source, p_session_id,
    CASE WHEN p_source = 'telemetry' THEN 'pending' ELSE 'confirmed' END)
  RETURNING id INTO v_kill_id;

  -- Populate witnesses from active telemetry sessions on the same map
  -- Grace window: include sessions on this map with heartbeat in last 2 minutes
  IF v_map_name IS NOT NULL THEN
    INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
    SELECT DISTINCT v_kill_id, mgm.character_id, ts.user_id, ts.current_map
    FROM telemetry_sessions ts
    JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
    WHERE ts.group_id = p_group_id
      AND ts.current_map = v_map_name
      AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
      AND ts.user_id != (SELECT user_id FROM telemetry_tokens WHERE id = (
        SELECT token_id FROM telemetry_sessions WHERE user_id = (
          SELECT user_id FROM characters WHERE id = p_registered_by
        ) LIMIT 1
      ))
    ON CONFLICT (kill_id, user_id) DO NOTHING;
  END IF;

  DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id);
END;
$$ LANGUAGE plpgsql;

-- Function to expire unvalidated kills past their respawn window
-- Called from a cron job or API endpoint every 5 minutes
CREATE OR REPLACE FUNCTION expire_unvalidated_kills()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE mvp_kills k
  SET validation_status = 'expired_unvalidated'
  FROM mvps m
  WHERE k.mvp_id = m.id
    AND k.validation_status = 'pending'
    AND k.killed_at + make_interval(secs := m.respawn_ms / 1000.0) < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Apply migrations to Supabase**

Run: `npx supabase db push` or apply via Supabase dashboard SQL editor.
Verify: Tables `telemetry_event_log` and `mvp_kill_witnesses` exist. `mvp_kills.validation_status` column exists.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260330100000_telemetry_event_log.sql supabase/migrations/20260330200000_kill_validation.sql
git commit -m "feat: add event log table and kill validation schema"
```

---

## Task 4: Data Cleanup Migration

**Files:**
- Create: `supabase/migrations/20260330300000_cleanup_bad_data.sql`

- [ ] **Step 1: Create cleanup migration**

```sql
-- supabase/migrations/20260330300000_cleanup_bad_data.sql
-- Clean up ghost kills and duplicates from existing data

-- 1. Remove kills with mvp_id = 0 (ghost kills from Bug 2)
-- CASCADE will clean mvp_kill_loots, mvp_kill_party, mvp_alert_queue
DELETE FROM mvp_kills WHERE mvp_id = 0;

-- 2. Deduplicate kills with identical (mvp_id, group_id, killed_at)
-- Keep the oldest by created_at, remove duplicates
DELETE FROM mvp_kills
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY mvp_id, group_id, killed_at
      ORDER BY created_at ASC
    ) AS rn
    FROM mvp_kills
  ) ranked
  WHERE rn > 1
);
```

- [ ] **Step 2: Apply migration**

Run: Apply via Supabase dashboard SQL editor (review the DELETE counts before committing).
Verify: `SELECT count(*) FROM mvp_kills WHERE mvp_id = 0` returns 0. No duplicate `(mvp_id, group_id, killed_at)` tuples exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260330300000_cleanup_bad_data.sql
git commit -m "fix: clean up ghost kills and duplicates from telemetry bugs"
```

---

## Task 5: Refactor mvp-kill Endpoint (Bug 3 Fix)

**Files:**
- Modify: `src/app/api/telemetry/mvp-kill/route.ts`

- [ ] **Step 1: Rewrite mvp-kill using shared lib**

```typescript
// src/app/api/telemetry/mvp-kill/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMvpIds } from '@/lib/telemetry/resolve-mvp'
import { validateTimestamp } from '@/lib/telemetry/validate-payload'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { monster_id, map, x, y, timestamp, loots, party_character_ids } = body

  if (!monster_id || timestamp == null) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-kill', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'error', reason: 'missing required fields' })
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Bug 3 fix: validate timestamp sanity
  const tsResult = validateTimestamp(timestamp)
  if (!tsResult.valid) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-kill', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, timestamp }, result: 'ignored', reason: tsResult.reason })
    return NextResponse.json({ action: 'ignored', reason: tsResult.reason })
  }
  const killedAt = tsResult.date.toISOString()

  // Shared MVP resolution with map whitelist
  const mvpResult = await resolveMvpIds(supabase, ctx.serverId, monster_id, map)
  if (mvpResult.ignored) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-kill', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'ignored', reason: mvpResult.reason })
    return NextResponse.json({ action: 'ignored', reason: mvpResult.reason })
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mvpResult.mvpIds,
    p_killed_at: killedAt,
    p_tomb_x: x ?? null,
    p_tomb_y: y ?? null,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: null,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-kill', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'error', reason: rpcErr.message })
    return NextResponse.json({ error: 'Failed to register kill' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'created'
  const killId = rpcResult?.kill_id

  // Insert loots (only for new kills)
  if (action === 'created' && killId && loots && Array.isArray(loots) && loots.length > 0) {
    const itemIds = loots.map((l: any) => l.item_id)
    const { data: items } = await supabase.from('items').select('item_id, name_pt').in('item_id', itemIds)
    const itemNameMap = new Map(items?.map((i) => [i.item_id, i.name_pt]) ?? [])

    const lootRows = loots.map((l: any) => ({
      kill_id: killId,
      item_id: l.item_id,
      item_name: itemNameMap.get(l.item_id) ?? `Item #${l.item_id}`,
      quantity: l.amount ?? 1,
      source: 'telemetry',
      accepted: null,
    }))
    await supabase.from('mvp_kill_loots').insert(lootRows)
  }

  // Insert party members
  if (action === 'created' && killId && party_character_ids && Array.isArray(party_character_ids) && party_character_ids.length > 0) {
    const { data: groupMembers } = await supabase
      .from('mvp_group_members')
      .select('character_id, characters!inner(id, user_id)')
      .eq('group_id', ctx.groupId)
    const memberCharMap = new Map<string, string>(
      (groupMembers ?? []).map((m: any) => [m.characters.user_id, m.character_id as string])
    )
    const { data: sessions } = await supabase
      .from('telemetry_sessions')
      .select('user_id, character_id')
      .eq('group_id', ctx.groupId)
      .in('character_id', party_character_ids)
    const resolvedIds = (sessions ?? [])
      .map((s: any) => memberCharMap.get(s.user_id))
      .filter((id): id is string => id !== undefined)
    if (resolvedIds.length > 0) {
      await supabase.from('mvp_kill_party').insert(
        resolvedIds.map((charUuid) => ({ kill_id: killId, character_id: charUuid }))
      )
    }
  }

  logTelemetryEvent(supabase, { endpoint: 'mvp-kill', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, timestamp }, result: action, killId })

  return NextResponse.json({ action, kill_id: killId }, { status: action === 'created' ? 201 : 200 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/mvp-kill/route.ts
git commit -m "fix: add timestamp validation and event logging to mvp-kill (Bug 3)"
```

---

## Task 6: Refactor mvp-killer Endpoint (Bugs 1, 2, 5)

**Files:**
- Modify: `src/app/api/telemetry/mvp-killer/route.ts`

- [ ] **Step 1: Rewrite mvp-killer using shared lib**

```typescript
// src/app/api/telemetry/mvp-killer/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMvpIds } from '@/lib/telemetry/resolve-mvp'
import { reconstructKilledAt } from '@/lib/telemetry/validate-payload'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const { map, tomb_x, tomb_y, killer_name, kill_hour, kill_minute } = await request.json()

  if (!killer_name) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-killer', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, killer_name }, result: 'error', reason: 'missing killer_name' })
    return NextResponse.json({ error: 'Missing killer_name' }, { status: 400 })
  }

  // Bug 2 fix: resolve MVPs by map only (killer endpoint has no monster_id)
  // If no MVP on this map, ignore instead of sending [0] to RPC
  let matchMvpIds: number[] = []
  if (map && map !== 'unknown') {
    const { data: mapMvps } = await supabase
      .from('mvps')
      .select('id')
      .eq('map_name', map)
      .eq('server_id', ctx.serverId)
    matchMvpIds = mapMvps?.map(m => m.id) ?? []
  }

  if (matchMvpIds.length === 0) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-killer', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, killer_name }, result: 'ignored', reason: 'no MVP on map' })
    return NextResponse.json({ action: 'ignored', reason: 'no MVP on map' })
  }

  // Bug 1 + 5 fix: reconstruct killed_at using reference, or use update_only
  const now = new Date()
  const killedAt = reconstructKilledAt(kill_hour, kill_minute, now)

  // Bug 5 fix: if no time from tomb, only update existing kill (don't create)
  const updateOnly = killedAt === null

  // Resolve killer character
  const { data: members } = await supabase
    .from('mvp_group_members')
    .select('character_id, characters!inner(name)')
    .eq('group_id', ctx.groupId)
  const killerMatch = members?.find((m: any) => m.characters?.name === killer_name)

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: matchMvpIds,
    p_killed_at: killedAt?.toISOString() ?? now.toISOString(),
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: null,
    p_killer_name: killer_name,
    p_killer_char_id: killerMatch?.character_id ?? null,
    p_update_only: updateOnly,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-killer', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, killer_name, kill_hour, kill_minute }, result: 'error', reason: rpcErr.message })
    return NextResponse.json({ error: 'Failed to register kill' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'created'
  logTelemetryEvent(supabase, { endpoint: 'mvp-killer', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, killer_name, kill_hour, kill_minute, update_only: updateOnly }, result: action, killId: rpcResult?.kill_id })

  return NextResponse.json({
    action,
    kill_id: rpcResult?.kill_id,
    killer_resolved: !!killerMatch,
  }, { status: action === 'created' ? 201 : 200 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/mvp-killer/route.ts
git commit -m "fix: fix timestamp reconstruction, ghost kills, and fallback timing (Bugs 1,2,5)"
```

---

## Task 7: Refactor mvp-tomb Endpoint (Bug 4)

**Files:**
- Modify: `src/app/api/telemetry/mvp-tomb/route.ts`

- [ ] **Step 1: Rewrite mvp-tomb to use RPC instead of raw UPDATE**

```typescript
// src/app/api/telemetry/mvp-tomb/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const { map, tomb_x, tomb_y } = await request.json()

  if (!map || tomb_x == null || tomb_y == null) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-tomb', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, tomb_x, tomb_y }, result: 'error', reason: 'missing required fields' })
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Get MVP IDs on this map
  const { data: mapMvps } = await supabase
    .from('mvps')
    .select('id')
    .eq('map_name', map)
    .eq('server_id', ctx.serverId)

  const mapMvpIds = mapMvps?.map(m => m.id) ?? []

  if (mapMvpIds.length === 0) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-tomb', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map }, result: 'ignored', reason: 'no MVP on this map' })
    return NextResponse.json({ action: 'ignored', reason: 'no MVP on this map' })
  }

  // Bug 4 fix: use RPC with update_only instead of raw UPDATE
  // This uses the advisory lock to prevent race conditions
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mapMvpIds,
    p_killed_at: new Date().toISOString(), // placeholder — won't be used since update_only
    p_tomb_x: tomb_x,
    p_tomb_y: tomb_y,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: null,
    p_update_only: true,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-tomb', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, tomb_x, tomb_y }, result: 'error', reason: rpcErr.message })
    return NextResponse.json({ error: 'Failed to update kill' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'ignored'
  logTelemetryEvent(supabase, { endpoint: 'mvp-tomb', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, tomb_x, tomb_y }, result: action, killId: rpcResult?.kill_id })

  return NextResponse.json({ action, kill_id: rpcResult?.kill_id })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/mvp-tomb/route.ts
git commit -m "fix: use RPC with advisory lock for mvp-tomb updates (Bug 4)"
```

---

## Task 8: Refactor mvp-spotted Endpoint

**Files:**
- Modify: `src/app/api/telemetry/mvp-spotted/route.ts`

- [ ] **Step 1: Add shared lib imports and event logging to mvp-spotted**

Replace the MVP resolution block (lines 21-39) and add logging throughout. The logic stays the same but uses `resolveMvpIds` and `logTelemetryEvent`. This is a straightforward replacement — see `src/app/api/telemetry/mvp-kill/route.ts` for the pattern. Key changes:
- Replace inline MVP query with `resolveMvpIds(supabase, ctx.serverId, monster_id, map)`
- Add `logTelemetryEvent` calls for each return path (ignored, updated, created)

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/mvp-spotted/route.ts
git commit -m "refactor: use shared lib for mvp-spotted endpoint"
```

---

## Task 9: New Consolidated mvp-event Endpoint

**Files:**
- Create: `src/app/api/telemetry/mvp-event/route.ts`

- [ ] **Step 1: Create the consolidated endpoint**

```typescript
// src/app/api/telemetry/mvp-event/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMvpIds } from '@/lib/telemetry/resolve-mvp'
import { validateTimestamp, reconstructKilledAt } from '@/lib/telemetry/validate-payload'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { monster_id, map, timestamp, tomb_x, tomb_y, killer_name, kill_hour, kill_minute, loots, party_account_ids } = body

  if (!monster_id || !map || timestamp == null) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'error', reason: 'missing required fields' })
    return NextResponse.json({ error: 'Missing required fields (monster_id, map, timestamp)' }, { status: 400 })
  }

  // Validate sniffer timestamp
  const tsResult = validateTimestamp(timestamp)
  if (!tsResult.valid) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, timestamp }, result: 'ignored', reason: tsResult.reason })
    return NextResponse.json({ action: 'ignored', reason: tsResult.reason })
  }

  // Resolve MVP (map whitelist)
  const mvpResult = await resolveMvpIds(supabase, ctx.serverId, monster_id, map)
  if (mvpResult.ignored) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'ignored', reason: mvpResult.reason })
    return NextResponse.json({ action: 'ignored', reason: mvpResult.reason })
  }

  // Timestamp priority: tomb time > sniffer timestamp (tomb comes from game server)
  // Use sniffer timestamp as date anchor for tomb hour:minute
  let killedAt: string
  const tombTime = reconstructKilledAt(kill_hour, kill_minute, tsResult.date)
  if (tombTime) {
    killedAt = tombTime.toISOString()
  } else {
    killedAt = tsResult.date.toISOString()
  }

  // Resolve killer
  let killerCharId: string | null = null
  if (killer_name) {
    const { data: members } = await supabase
      .from('mvp_group_members')
      .select('character_id, characters!inner(name)')
      .eq('group_id', ctx.groupId)
    const match = members?.find((m: any) => m.characters?.name === killer_name)
    killerCharId = match?.character_id ?? null
  }

  // Atomic kill registration
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mvpResult.mvpIds,
    p_killed_at: killedAt,
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: null,
    p_killer_name: killer_name ?? null,
    p_killer_char_id: killerCharId,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'error', reason: rpcErr.message })
    return NextResponse.json({ error: 'Failed to register kill' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'created'
  const killId = rpcResult?.kill_id

  // Insert loots
  if (action === 'created' && killId && loots && Array.isArray(loots) && loots.length > 0) {
    const itemIds = loots.map((l: any) => l.item_id)
    const { data: items } = await supabase.from('items').select('item_id, name_pt').in('item_id', itemIds)
    const itemNameMap = new Map(items?.map((i) => [i.item_id, i.name_pt]) ?? [])
    await supabase.from('mvp_kill_loots').insert(
      loots.map((l: any) => ({
        kill_id: killId,
        item_id: l.item_id,
        item_name: itemNameMap.get(l.item_id) ?? `Item #${l.item_id}`,
        quantity: l.amount ?? 1,
        source: 'telemetry',
        accepted: null,
      }))
    )
  }

  // Insert party members
  if (action === 'created' && killId && party_account_ids && Array.isArray(party_account_ids) && party_account_ids.length > 0) {
    const { data: groupMembers } = await supabase
      .from('mvp_group_members')
      .select('character_id, characters!inner(id, user_id)')
      .eq('group_id', ctx.groupId)
    const memberCharMap = new Map<string, string>(
      (groupMembers ?? []).map((m: any) => [m.characters.user_id, m.character_id as string])
    )
    const { data: sessions } = await supabase
      .from('telemetry_sessions')
      .select('user_id, character_id')
      .eq('group_id', ctx.groupId)
      .in('account_id', party_account_ids)
    const resolvedIds = (sessions ?? [])
      .map((s: any) => memberCharMap.get(s.user_id))
      .filter((id): id is string => id !== undefined)
    if (resolvedIds.length > 0) {
      await supabase.from('mvp_kill_party').insert(
        resolvedIds.map((charUuid) => ({ kill_id: killId, character_id: charUuid }))
      )
    }
  }

  logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, has_tomb: !!tomb_x, has_killer: !!killer_name, loot_count: loots?.length ?? 0 }, result: action, killId })

  return NextResponse.json({ action, kill_id: killId }, { status: action === 'created' ? 201 : 200 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/mvp-event/route.ts
git commit -m "feat: add consolidated mvp-event endpoint"
```

---

## Task 10: Config Version Tracking + Heartbeat Staleness

**Files:**
- Create: `supabase/migrations/20260330400000_config_version_tracking.sql`
- Modify: `src/app/api/telemetry/heartbeat/route.ts`
- Modify: `src/app/api/telemetry/config/route.ts`

- [ ] **Step 1: Create config version tracking migration**

```sql
-- supabase/migrations/20260330400000_config_version_tracking.sql
-- Track config version changes for sniffer staleness detection

CREATE TABLE telemetry_config_versions (
  server_id INT PRIMARY KEY REFERENCES servers(id),
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with current servers
INSERT INTO telemetry_config_versions (server_id, version)
SELECT id, 1 FROM servers
ON CONFLICT DO NOTHING;

-- Auto-increment version when mvps table changes
CREATE OR REPLACE FUNCTION bump_config_version()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE telemetry_config_versions
  SET version = version + 1, updated_at = NOW()
  WHERE server_id = COALESCE(NEW.server_id, OLD.server_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_config_version
AFTER INSERT OR UPDATE OR DELETE ON mvps
FOR EACH ROW EXECUTE FUNCTION bump_config_version();
```

- [ ] **Step 2: Update config endpoint to use tracked version**

In `src/app/api/telemetry/config/route.ts`, replace the session config_version lookup with:

```typescript
// Replace session config_version lookup with:
const { data: configVer } = await supabase
  .from('telemetry_config_versions')
  .select('version')
  .eq('server_id', ctx.serverId)
  .single()

// In the response:
return NextResponse.json({
  config_version: configVer?.version ?? 1,
  // ... rest stays the same
})
```

- [ ] **Step 3: Update heartbeat to detect config staleness and add logging**

In `src/app/api/telemetry/heartbeat/route.ts`, after the session upsert loop, add:

```typescript
// Check config staleness
const { data: configVer } = await supabase
  .from('telemetry_config_versions')
  .select('version')
  .eq('server_id', ctx.serverId)
  .single()

const currentVersion = configVer?.version ?? 1
const clientVersion = config_version ?? 0
const configStale = clientVersion < currentVersion

if (configStale) {
  logTelemetryEvent(supabase, { endpoint: 'heartbeat', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { client_config: clientVersion, server_config: currentVersion }, result: 'ignored', reason: 'config_stale' })
}

return NextResponse.json({
  status: 'ok',
  config_version: currentVersion,
  config_stale: configStale,
})
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260330400000_config_version_tracking.sql src/app/api/telemetry/config/route.ts src/app/api/telemetry/heartbeat/route.ts
git commit -m "feat: add config version tracking and heartbeat staleness detection"
```

---

## Task 11: Update Types and Hook for Validation

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/use-mvp-timers.ts`

- [ ] **Step 1: Add validation fields to MvpActiveKill type**

In `src/lib/types.ts`, add to the `MvpActiveKill` interface after `pending_loots_count`:

```typescript
  validation_status: 'pending' | 'confirmed' | 'corrected' | 'expired_unvalidated';
  validated_by: string | null;
  validated_at: string | null;
  validated_by_name: string | null;
```

- [ ] **Step 2: Add confirmKill and correctKill to useMvpTimers hook**

In `src/hooks/use-mvp-timers.ts`, add after `rejectLootSuggestion`:

```typescript
const confirmKill = useCallback(async (killId: string, characterId: string) => {
  const supabase = createClient();
  await supabase.from("mvp_kills").update({
    validation_status: 'confirmed',
    validated_by: characterId,
    validated_at: new Date().toISOString(),
  }).eq("id", killId);
  await fetchKills();
}, [fetchKills]);

const correctKill = useCallback(async (killId: string, data: {
  killedAt: string;
  tombX: number | null;
  tombY: number | null;
  killerCharacterId: string | null;
  editedBy: string;
}) => {
  const supabase = createClient();
  await supabase.from("mvp_kills").update({
    killed_at: data.killedAt,
    tomb_x: data.tombX,
    tomb_y: data.tombY,
    killer_character_id: data.killerCharacterId,
    edited_by: data.editedBy,
    validation_status: 'corrected',
    validated_by: data.editedBy,
    validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", killId);
  await fetchKills();
}, [fetchKills]);
```

Also update the realtime UPDATE handler to include validation fields:

```typescript
// In the UPDATE handler, add to the merge:
validation_status: updated.validation_status ?? k.validation_status,
validated_by: updated.validated_by ?? k.validated_by,
validated_at: updated.validated_at ?? k.validated_at,
```

And update the `UseMvpTimersReturn` interface and return statement to include `confirmKill` and `correctKill`.

- [ ] **Step 3: Run tests**

Run: `npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/hooks/use-mvp-timers.ts
git commit -m "feat: add validation status to types and kill confirmation/correction to hook"
```

---

## Task 12: Validation UI — Badges and Buttons

**Files:**
- Modify: `src/components/mvp/mvp-timer-row.tsx`

- [ ] **Step 1: Add validation badge and confirm/correct buttons**

In `MvpTimerRow`, add props for the current user's character and witnesses:

```typescript
interface MvpTimerRowProps {
  mvp: Mvp;
  kill: MvpActiveKill | null;
  onEdit?: (mvp: Mvp, kill: MvpActiveKill) => void;
  onConfirm?: (killId: string) => void;
  onCorrect?: (mvp: Mvp, kill: MvpActiveKill) => void;
  currentUserIsWitness?: boolean;
  canValidate?: boolean; // true if witness or no witnesses exist
}
```

After the existing `pending_loots_count` badge (line ~111-115), add:

```tsx
{kill.source === 'telemetry' && kill.validation_status === 'pending' && (
  <span className="text-xs bg-[color-mix(in_srgb,var(--status-soon)_15%,transparent)] text-status-soon-text rounded-sm px-1.5 py-0.5 ml-1">
    Pendente
  </span>
)}
{kill.validation_status === 'corrected' && (
  <span
    className="text-xs bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] text-status-available-text rounded-sm px-1.5 py-0.5 ml-1"
    title={kill.validated_by_name ? `Corrigido por ${kill.validated_by_name}` : 'Corrigido'}
  >
    Corrigido
  </span>
)}
```

Before the edit button (line ~121), add confirm/correct buttons:

```tsx
{canValidate && kill.source === 'telemetry' && kill.validation_status === 'pending' && (
  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
    <button
      onClick={() => onConfirm?.(kill.kill_id)}
      className="text-[10px] text-status-available-text hover:underline cursor-pointer"
      title="Confirmar kill"
    >
      ✓
    </button>
    <button
      onClick={() => onCorrect?.(mvp, kill)}
      className="text-[10px] text-status-soon-text hover:underline cursor-pointer"
      title="Corrigir dados"
    >
      ✎
    </button>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-timer-row.tsx
git commit -m "feat: add validation badges and confirm/correct buttons to MvpTimerRow"
```

---

## Task 13: Wire Validation into MvpTab

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`

- [ ] **Step 1: Fetch witnesses and pass validation props to MvpTimerRow**

In `MvpTab`, add a state for witnesses and fetch them when kills load. Pass `onConfirm`, `onCorrect`, `canValidate`, and `currentUserIsWitness` props to each `MvpTimerRow`.

Key changes:
- After kills load, fetch witnesses for pending kills: `supabase.from('mvp_kill_witnesses').select('kill_id, user_id').in('kill_id', pendingKillIds)`
- For each kill row, compute `canValidate`: user is a witness for that kill, OR no witnesses exist for that kill, OR kill has no witnesses at all (any member can validate)
- Pass `onConfirm={() => confirmKill(kill.kill_id, currentCharacterId)}` and `onCorrect` that opens the edit modal in correction mode

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: wire kill validation into MvpTab with witnesses"
```

---

## Task 14: Telemetry Hub — Event Log UI

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx` (Telemetria tab section)

- [ ] **Step 1: Add event log fetching and display to the Telemetria tab**

In the existing Telemetria tab content (which already shows sessions), add a section below it:

```tsx
// Event log section
const [eventLog, setEventLog] = useState<any[]>([])
const [logFilter, setLogFilter] = useState<string>('all') // 'all' | 'error' | 'ignored'

// Fetch recent events
useEffect(() => {
  if (!groupId || activeTab !== 'telemetria') return
  const supabase = createClient()
  async function fetchLog() {
    const query = supabase
      .from('telemetry_event_log')
      .select('id, timestamp, endpoint, result, reason, kill_id, character_id')
      .order('timestamp', { ascending: false })
      .limit(50)
    // Note: event_log has token_id, we'd need to join or filter by group's tokens
    // For now fetch all recent and filter client-side
    const { data } = await query
    setEventLog(data ?? [])
  }
  fetchLog()
  const interval = setInterval(fetchLog, 30000)
  return () => clearInterval(interval)
}, [groupId, activeTab])
```

Display as a compact table with timestamp, endpoint, result (color-coded), and reason.

- [ ] **Step 2: Add sniffer health indicators**

Enhance the existing session list to show health status colors:
- Green dot: heartbeat < 2min
- Yellow dot: 2-5min
- Red dot: > 5min

```tsx
function heartbeatStatus(lastHeartbeat: string): 'green' | 'yellow' | 'red' {
  const diff = Date.now() - new Date(lastHeartbeat).getTime()
  if (diff < 2 * 60 * 1000) return 'green'
  if (diff < 5 * 60 * 1000) return 'yellow'
  return 'red'
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: add event log and sniffer health indicators to Telemetria tab"
```

---

## Task 15: Add Event Logging to Remaining Endpoints

**Files:**
- Modify: `src/app/api/telemetry/mvp-broadcast/route.ts`
- Modify: `src/app/api/telemetry/heartbeat/route.ts`

- [ ] **Step 1: Add event logging to mvp-broadcast**

Add `import { logTelemetryEvent } from '@/lib/telemetry/log-event'` and add `logTelemetryEvent` calls for each return path (ignored: unknown_code, ignored: unknown_map, stored, error).

- [ ] **Step 2: Add event logging to heartbeat (error cases)**

The heartbeat already has the `try-catch` block. Add logging for catch errors and for stale session cleanup.

- [ ] **Step 3: Run all tests**

Run: `npx jest --no-cache`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telemetry/mvp-broadcast/route.ts src/app/api/telemetry/heartbeat/route.ts
git commit -m "feat: add event logging to broadcast and heartbeat endpoints"
```

---

## Task 16: Validation Timeout — Expire Unvalidated Kills

**Files:**
- Create: `src/app/api/mvp-kills/expire/route.ts`

- [ ] **Step 1: Create the expire endpoint**

This endpoint is called by a cron job (Vercel Cron or external scheduler) every 5 minutes.

```typescript
// src/app/api/mvp-kills/expire/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = createAdminClient()

  // Expire pending kills past respawn window
  const { data: expireCount, error: expireErr } = await supabase.rpc('expire_unvalidated_kills')

  // Clean old event log entries (7-day retention)
  await supabase.rpc('cleanup_telemetry_event_log')

  if (expireErr) {
    return NextResponse.json({ error: expireErr.message }, { status: 500 })
  }

  return NextResponse.json({ expired: expireCount ?? 0 })
}
```

- [ ] **Step 2: Add Vercel cron config (if using Vercel)**

In `vercel.json` (or create it), add:

```json
{
  "crons": [
    {
      "path": "/api/mvp-kills/expire",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mvp-kills/expire/route.ts vercel.json
git commit -m "feat: add cron endpoint for expiring unvalidated kills and event log cleanup"
```

---

## Task 17: Correction Notification Toast

**Files:**
- Modify: `src/components/mvp/mvp-tab.tsx`

- [ ] **Step 1: Add correction notification state and display**

In the existing realtime subscription handler for `mvp_kills` UPDATEs (inside `useMvpTimers` or `MvpTab`), detect when `validation_status` changes to `corrected`:

```tsx
// Add state for correction notifications
const [correctionNotice, setCorrectionNotice] = useState<string | null>(null)

// In the realtime UPDATE handler, after merging the kill data:
if (payload.eventType === 'UPDATE') {
  const updated = payload.new
  if (updated.validation_status === 'corrected') {
    // Find the MVP name for the notification
    const mvp = mvpData.find(m => m.id === updated.mvp_id)
    const editorName = updated.edited_by // will need character name lookup
    if (mvp) {
      setCorrectionNotice(`Kill de ${mvp.name} foi corrigido`)
      setTimeout(() => setCorrectionNotice(null), 8000)
    }
  }
}
```

In the JSX, show the notification as a toast at the top of the MVP panel:

```tsx
{correctionNotice && (
  <div className="px-3 py-2 bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] text-status-available-text text-sm rounded-md mb-2 flex items-center justify-between">
    <span>{correctionNotice}</span>
    <button onClick={() => setCorrectionNotice(null)} className="text-text-secondary hover:text-text-primary ml-2">×</button>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/mvp/mvp-tab.tsx
git commit -m "feat: add correction notification toast in MVP panel"
```

---

## Task 18: Version Bump

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version**

Increment the patch version in `package.json`.

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: bump version for telemetry reliability release"
```
