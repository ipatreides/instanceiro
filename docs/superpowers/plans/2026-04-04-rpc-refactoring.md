# RPC Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `telemetry_register_kill` RPC (10 migrations) with 3 specialized RPCs + 1 helper function, fixing sentinel/dedup bugs.

**Architecture:** Internal helper `_find_kill_for_mvp` handles 3-tier kill lookup (sentinel → tomb coords → time window). Three public RPCs (`register_kill_from_event`, `update_kill_from_tomb`, `update_kill_from_killer`) each call the helper and apply their specific create/update logic. `reconstructKilledAt` gains respawn_ms validation.

**Tech Stack:** PostgreSQL (plpgsql RPCs), TypeScript (Next.js API routes), Supabase CLI (`db query --linked`)

**Spec:** `docs/superpowers/specs/2026-04-04-rpc-refactoring-design.md`

---

### Task 0: Improve `reconstructKilledAt` with respawn validation

**Files:**
- Modify: `src/lib/telemetry/validate-payload.ts:27-55`
- Modify: `src/lib/__tests__/telemetry-validate-payload.test.ts:26-44`

- [ ] **Step 1: Write failing tests for respawn window validation**

Add to `src/lib/__tests__/telemetry-validate-payload.test.ts`:

```typescript
test('rejects time outside respawn window', () => {
  // Pharaoh respawn = 3600000ms (1h). Kill hour says 15:00 BRT but now is 20:00 BRT
  // That's 5h ago — outside 1h + 10min window → reject
  const reference = new Date('2026-04-04T23:00:00Z') // 20:00 BRT
  const result = reconstructKilledAt(15, 0, reference, 3600000)
  expect(result).toBeNull()
})

test('accepts time within respawn window', () => {
  // Kill hour says 19:30 BRT, now is 20:00 BRT → 30min ago, within 1h+10min
  const reference = new Date('2026-04-04T23:00:00Z') // 20:00 BRT
  const result = reconstructKilledAt(19, 30, reference, 3600000)
  expect(result).not.toBeNull()
})

test('crosses midnight within respawn window', () => {
  // Kill hour says 23:50 BRT, now is 00:10 BRT next day → 20min ago, within window
  const reference = new Date('2026-04-05T03:10:00Z') // 00:10 BRT Apr 5
  const result = reconstructKilledAt(23, 50, reference, 3600000)
  expect(result).not.toBeNull()
  // Should be yesterday 23:50 BRT = Apr 5 02:50 UTC
  expect(result!.toISOString()).toBe('2026-04-05T02:50:00.000Z')
})

test('backward compat: no respawnMs means no window check', () => {
  // Old callers that don't pass respawnMs should still work
  const reference = new Date('2026-04-04T23:00:00Z')
  const result = reconstructKilledAt(15, 0, reference)
  expect(result).not.toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/rag/instance-tracker && npx vitest run src/lib/__tests__/telemetry-validate-payload.test.ts`
Expected: FAIL — `reconstructKilledAt` doesn't accept 4th parameter

- [ ] **Step 3: Update `reconstructKilledAt` signature and add validation**

In `src/lib/telemetry/validate-payload.ts`, replace lines 27-55:

```typescript
export function reconstructKilledAt(
  killHour: number | null | undefined,
  killMinute: number | null | undefined,
  reference: Date,
  respawnMs?: number
): Date | null {
  if (killHour == null || killMinute == null || killHour < 0 || killMinute < 0) {
    return null
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BRT_TIMEZONE,
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(reference)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT-3'
  const offsetMatch = offsetPart.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3

  const brtDateStr = reference.toLocaleDateString('en-CA', { timeZone: BRT_TIMEZONE })
  const isoStr = `${brtDateStr}T${String(killHour).padStart(2, '0')}:${String(killMinute).padStart(2, '0')}:00Z`
  const result = new Date(isoStr)
  result.setHours(result.getHours() - offsetHours)

  if (result.getTime() > reference.getTime()) {
    result.setDate(result.getDate() - 1)
  }

  // Validate against respawn window if provided
  if (respawnMs != null) {
    const maxAge = respawnMs + 10 * 60 * 1000 // respawn + 10min
    const age = reference.getTime() - result.getTime()
    if (age < 0 || age > maxAge) {
      return null // Time is outside valid window
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd D:/rag/instance-tracker && npx vitest run src/lib/__tests__/telemetry-validate-payload.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd D:/rag/instance-tracker
git add src/lib/telemetry/validate-payload.ts src/lib/__tests__/telemetry-validate-payload.test.ts
git commit -m "feat: add respawn window validation to reconstructKilledAt"
```

---

### Task 1: Create the SQL migration with helper + 3 RPCs

**Files:**
- Create: `supabase/migrations/20260404100000_specialized_kill_rpcs.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260404100000_specialized_kill_rpcs.sql`:

```sql
-- Refactor: Replace monolithic telemetry_register_kill with 3 specialized RPCs.
-- See docs/superpowers/specs/2026-04-04-rpc-refactoring-design.md

-- ============================================================
-- Helper: Find existing kill for an MVP (3-tier lookup)
-- ============================================================
CREATE OR REPLACE FUNCTION _find_kill_for_mvp(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_reference_time TIMESTAMPTZ DEFAULT NOW()
) RETURNS UUID AS $$
DECLARE
  v_existing_id UUID;
  v_respawn_ms INT;
  v_delay_ms INT;
  v_dedup_cutoff TIMESTAMPTZ;
BEGIN
  SELECT respawn_ms, delay_ms INTO v_respawn_ms, v_delay_ms
  FROM mvps WHERE id = p_mvp_ids[1];
  v_respawn_ms := COALESCE(v_respawn_ms, 3540000);
  v_delay_ms := COALESCE(v_delay_ms, 600000);

  -- Tier 1: Sentinel kills (epoch 0 = time unknown from standalone tomb)
  SELECT id INTO v_existing_id
  FROM mvp_kills
  WHERE group_id = p_group_id
    AND mvp_id = ANY(p_mvp_ids)
    AND killed_at < '1970-01-02T00:00:00Z'::TIMESTAMPTZ
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Tier 2: Same tomb coordinates (same kill cycle)
  IF p_tomb_x IS NOT NULL AND p_tomb_y IS NOT NULL THEN
    v_dedup_cutoff := p_reference_time
      - make_interval(secs := (v_respawn_ms + v_delay_ms + 600000) / 1000.0);

    SELECT id INTO v_existing_id
    FROM mvp_kills
    WHERE group_id = p_group_id
      AND mvp_id = ANY(p_mvp_ids)
      AND killed_at >= v_dedup_cutoff
      AND tomb_x = p_tomb_x
      AND tomb_y = p_tomb_y
    ORDER BY killed_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Tier 3: Time window (respawn - 1min)
  v_dedup_cutoff := p_reference_time
    - make_interval(secs := GREATEST((v_respawn_ms - 60000) / 1000.0, 60));

  SELECT id INTO v_existing_id
  FROM mvp_kills
  WHERE group_id = p_group_id
    AND mvp_id = ANY(p_mvp_ids)
    AND killed_at >= v_dedup_cutoff
  ORDER BY killed_at DESC
  LIMIT 1
  FOR UPDATE;

  RETURN v_existing_id; -- NULL if not found
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- RPC 1: register_kill_from_event
-- Called by: mvp-event (Rustro saw MVP die)
-- ============================================================
CREATE OR REPLACE FUNCTION register_kill_from_event(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_killer_name TEXT DEFAULT NULL,
  p_killer_char_id UUID DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
  v_was_sentinel BOOLEAN := FALSE;
  v_map_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  SELECT map_name INTO v_map_name FROM mvps WHERE id = p_mvp_ids[1];

  v_existing_id := _find_kill_for_mvp(p_group_id, p_mvp_ids, p_tomb_x, p_tomb_y, p_killed_at);

  IF v_existing_id IS NOT NULL THEN
    -- Check if it was a sentinel
    SELECT killed_at < '1970-01-02'::TIMESTAMPTZ INTO v_was_sentinel
    FROM mvp_kills WHERE id = v_existing_id;

    UPDATE mvp_kills SET
      killer_name_raw = COALESCE(p_killer_name, killer_name_raw),
      killer_character_id = COALESCE(p_killer_char_id, killer_character_id),
      tomb_x = COALESCE(p_tomb_x, tomb_x),
      tomb_y = COALESCE(p_tomb_y, tomb_y),
      killed_at = p_killed_at,
      updated_at = NOW()
    WHERE id = v_existing_id;

    -- If was sentinel, populate witnesses now
    IF v_was_sentinel AND v_map_name IS NOT NULL THEN
      INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
      SELECT DISTINCT v_existing_id, mgm.character_id, ts.user_id, ts.current_map
      FROM telemetry_sessions ts
      JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
      WHERE ts.group_id = p_group_id
        AND ts.current_map = v_map_name
        AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
      ON CONFLICT (kill_id, user_id) DO NOTHING;
    END IF;

    DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
    DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
      SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
    ) AND group_id = p_group_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id, 'was_sentinel', v_was_sentinel, 'killed_at', p_killed_at);
  END IF;

  -- Create new kill
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    killer_character_id, killer_name_raw, registered_by, source, validation_status)
  VALUES (p_group_id, p_mvp_ids[1], p_killed_at, p_tomb_x, p_tomb_y,
    p_killer_char_id, p_killer_name, p_registered_by, 'telemetry', 'pending')
  RETURNING id INTO v_kill_id;

  -- Populate witnesses
  IF v_map_name IS NOT NULL THEN
    INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
    SELECT DISTINCT v_kill_id, mgm.character_id, ts.user_id, ts.current_map
    FROM telemetry_sessions ts
    JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
    WHERE ts.group_id = p_group_id
      AND ts.current_map = v_map_name
      AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
    ON CONFLICT (kill_id, user_id) DO NOTHING;
  END IF;

  DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
  DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
    SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
  ) AND group_id = p_group_id;

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id, 'was_sentinel', FALSE, 'killed_at', p_killed_at);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- RPC 2: update_kill_from_tomb
-- Called by: mvp-tomb (Rustro saw tomb NPC, no kill time)
-- ============================================================
CREATE OR REPLACE FUNCTION update_kill_from_tomb(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_tomb_x INT,
  p_tomb_y INT,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  v_existing_id := _find_kill_for_mvp(p_group_id, p_mvp_ids, p_tomb_x, p_tomb_y, NOW());

  IF v_existing_id IS NOT NULL THEN
    -- Update tomb coords only, do NOT touch killed_at
    UPDATE mvp_kills SET
      tomb_x = p_tomb_x,
      tomb_y = p_tomb_y,
      updated_at = NOW()
    WHERE id = v_existing_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id, 'was_sentinel', FALSE, 'killed_at', NULL);
  END IF;

  -- No existing kill: create with sentinel (time unknown)
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    registered_by, source, validation_status)
  VALUES (p_group_id, p_mvp_ids[1], '1970-01-01T00:00:00Z'::TIMESTAMPTZ, p_tomb_x, p_tomb_y,
    p_registered_by, 'telemetry', 'pending')
  RETURNING id INTO v_kill_id;

  -- Clean sightings (tomb proves MVP is dead)
  DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
  -- Do NOT clean broadcasts (no confirmed kill yet)

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id, 'was_sentinel', TRUE, 'killed_at', '1970-01-01T00:00:00Z');
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- RPC 3: update_kill_from_killer
-- Called by: mvp-killer (Rustro clicked tomb, has BRT hour:minute + killer)
-- ============================================================
CREATE OR REPLACE FUNCTION update_kill_from_killer(
  p_group_id UUID,
  p_mvp_ids INT[],
  p_killed_at TIMESTAMPTZ,
  p_killer_name TEXT,
  p_killer_char_id UUID DEFAULT NULL,
  p_tomb_x INT DEFAULT NULL,
  p_tomb_y INT DEFAULT NULL,
  p_registered_by UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_existing_id UUID;
  v_kill_id UUID;
  v_was_sentinel BOOLEAN := FALSE;
  v_map_name TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_group_id::text || p_mvp_ids[1]::text));

  SELECT map_name INTO v_map_name FROM mvps WHERE id = p_mvp_ids[1];

  v_existing_id := _find_kill_for_mvp(p_group_id, p_mvp_ids, p_tomb_x, p_tomb_y, p_killed_at);

  IF v_existing_id IS NOT NULL THEN
    SELECT killed_at < '1970-01-02'::TIMESTAMPTZ INTO v_was_sentinel
    FROM mvp_kills WHERE id = v_existing_id;

    UPDATE mvp_kills SET
      killer_name_raw = p_killer_name,
      killer_character_id = COALESCE(p_killer_char_id, killer_character_id),
      tomb_x = COALESCE(p_tomb_x, tomb_x),
      tomb_y = COALESCE(p_tomb_y, tomb_y),
      killed_at = p_killed_at,
      updated_at = NOW()
    WHERE id = v_existing_id;

    -- If was sentinel, now we have real time — populate witnesses
    IF v_was_sentinel AND v_map_name IS NOT NULL THEN
      INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
      SELECT DISTINCT v_existing_id, mgm.character_id, ts.user_id, ts.current_map
      FROM telemetry_sessions ts
      JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
      WHERE ts.group_id = p_group_id
        AND ts.current_map = v_map_name
        AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
      ON CONFLICT (kill_id, user_id) DO NOTHING;
    END IF;

    DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
    DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
      SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
    ) AND group_id = p_group_id;

    RETURN json_build_object('action', 'updated', 'kill_id', v_existing_id, 'was_sentinel', v_was_sentinel, 'killed_at', p_killed_at);
  END IF;

  -- No existing kill: create new with real time
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, tomb_x, tomb_y,
    killer_character_id, killer_name_raw, registered_by, source, validation_status)
  VALUES (p_group_id, p_mvp_ids[1], p_killed_at, p_tomb_x, p_tomb_y,
    p_killer_char_id, p_killer_name, p_registered_by, 'telemetry', 'pending')
  RETURNING id INTO v_kill_id;

  IF v_map_name IS NOT NULL THEN
    INSERT INTO mvp_kill_witnesses (kill_id, character_id, user_id, map_name)
    SELECT DISTINCT v_kill_id, mgm.character_id, ts.user_id, ts.current_map
    FROM telemetry_sessions ts
    JOIN mvp_group_members mgm ON mgm.user_id = ts.user_id AND mgm.group_id = p_group_id
    WHERE ts.group_id = p_group_id
      AND ts.current_map = v_map_name
      AND ts.last_heartbeat >= NOW() - INTERVAL '2 minutes'
    ON CONFLICT (kill_id, user_id) DO NOTHING;
  END IF;

  DELETE FROM mvp_sightings WHERE mvp_id = ANY(p_mvp_ids) AND group_id = p_group_id;
  DELETE FROM mvp_broadcast_events WHERE cooldown_group IN (
    SELECT DISTINCT cooldown_group FROM mvps WHERE id = ANY(p_mvp_ids) AND cooldown_group IS NOT NULL
  ) AND group_id = p_group_id;

  RETURN json_build_object('action', 'created', 'kill_id', v_kill_id, 'was_sentinel', FALSE, 'killed_at', p_killed_at);
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- Drop the old monolithic function
-- ============================================================
DROP FUNCTION IF EXISTS telemetry_register_kill(UUID, INT[], TIMESTAMPTZ, INT, INT, UUID, TEXT, UUID, TEXT, UUID, BOOLEAN);
```

- [ ] **Step 2: Commit migration file (not yet applied)**

```bash
cd D:/rag/instance-tracker
git add supabase/migrations/20260404100000_specialized_kill_rpcs.sql
git commit -m "feat: migration for 3 specialized kill RPCs + helper"
```

---

### Task 2: Write SQL tests via ROLLBACK

**Files:**
- Create: `supabase/tests/test_kill_rpcs.sql`

- [ ] **Step 1: Write test SQL file**

Create `supabase/tests/test_kill_rpcs.sql`:

```sql
-- Test suite for specialized kill RPCs
-- Run via: supabase db query --linked < supabase/tests/test_kill_rpcs.sql
-- Uses ROLLBACK — nothing persisted

BEGIN;

-- Setup: grab a real group and MVP for testing
-- (uses existing data, cleaned up by ROLLBACK)
DO $$
DECLARE
  v_group_id UUID;
  v_mvp_id INT;
  v_mvp_ids INT[];
  v_result JSON;
  v_kill_id UUID;
  v_killed_at TIMESTAMPTZ;
  v_count INT;
BEGIN
  -- Use first available group + MVP
  SELECT g.id INTO v_group_id FROM mvp_groups g LIMIT 1;
  SELECT m.id INTO v_mvp_id FROM mvps m WHERE m.server_id = 1 LIMIT 1;
  v_mvp_ids := ARRAY[v_mvp_id];

  IF v_group_id IS NULL OR v_mvp_id IS NULL THEN
    RAISE EXCEPTION 'No test data: need at least 1 group and 1 MVP';
  END IF;

  -- Clean slate for this MVP
  DELETE FROM mvp_kills WHERE group_id = v_group_id AND mvp_id = v_mvp_id;

  -- ============================================================
  -- TEST 1: update_kill_from_tomb — creates sentinel
  -- ============================================================
  v_result := update_kill_from_tomb(v_group_id, v_mvp_ids, 100, 200, NULL);
  ASSERT (v_result->>'action') = 'created', 'T1: should create sentinel kill';
  ASSERT (v_result->>'was_sentinel')::BOOLEAN = TRUE, 'T1: was_sentinel should be true';

  v_kill_id := (v_result->>'kill_id')::UUID;
  SELECT killed_at INTO v_killed_at FROM mvp_kills WHERE id = v_kill_id;
  ASSERT v_killed_at < '1970-01-02'::TIMESTAMPTZ, 'T1: killed_at should be epoch sentinel';

  RAISE NOTICE 'TEST 1 PASSED: update_kill_from_tomb creates sentinel';

  -- ============================================================
  -- TEST 2: update_kill_from_tomb — dedup same coords
  -- ============================================================
  v_result := update_kill_from_tomb(v_group_id, v_mvp_ids, 100, 200, NULL);
  ASSERT (v_result->>'action') = 'updated', 'T2: same coords should update not create';
  ASSERT (v_result->>'kill_id')::UUID = v_kill_id, 'T2: should be same kill_id';

  RAISE NOTICE 'TEST 2 PASSED: update_kill_from_tomb dedup same coords';

  -- ============================================================
  -- TEST 3: update_kill_from_killer — updates sentinel with real time
  -- ============================================================
  v_result := update_kill_from_killer(
    v_group_id, v_mvp_ids,
    NOW() - INTERVAL '30 minutes',
    'TestKiller', NULL, 100, 200, NULL
  );
  ASSERT (v_result->>'action') = 'updated', 'T3: should update sentinel kill';
  ASSERT (v_result->>'was_sentinel')::BOOLEAN = TRUE, 'T3: was_sentinel should be true';

  SELECT killed_at INTO v_killed_at FROM mvp_kills WHERE id = v_kill_id;
  ASSERT v_killed_at > '1970-01-02'::TIMESTAMPTZ, 'T3: killed_at should be real now';

  RAISE NOTICE 'TEST 3 PASSED: update_kill_from_killer updates sentinel';

  -- ============================================================
  -- TEST 4: register_kill_from_event — dedup with existing
  -- ============================================================
  v_result := register_kill_from_event(
    v_group_id, v_mvp_ids,
    NOW() - INTERVAL '29 minutes',
    100, 200, NULL, NULL, NULL
  );
  ASSERT (v_result->>'action') = 'updated', 'T4: should find existing kill in dedup window';

  RAISE NOTICE 'TEST 4 PASSED: register_kill_from_event dedup';

  -- ============================================================
  -- TEST 5: register_kill_from_event — new kill (clean slate)
  -- ============================================================
  DELETE FROM mvp_kills WHERE group_id = v_group_id AND mvp_id = v_mvp_id;

  v_result := register_kill_from_event(
    v_group_id, v_mvp_ids,
    NOW(), NULL, NULL, 'EventKiller', NULL, NULL
  );
  ASSERT (v_result->>'action') = 'created', 'T5: should create new kill';
  ASSERT (v_result->>'was_sentinel')::BOOLEAN = FALSE, 'T5: was_sentinel should be false';

  v_kill_id := (v_result->>'kill_id')::UUID;
  SELECT count(*) INTO v_count FROM mvp_kills WHERE id = v_kill_id AND killer_name_raw = 'EventKiller';
  ASSERT v_count = 1, 'T5: killer name should be set';

  RAISE NOTICE 'TEST 5 PASSED: register_kill_from_event creates new kill';

  -- ============================================================
  -- TEST 6: update_kill_from_tomb — does NOT overwrite killed_at
  -- ============================================================
  SELECT killed_at INTO v_killed_at FROM mvp_kills WHERE id = v_kill_id;
  v_result := update_kill_from_tomb(v_group_id, v_mvp_ids, 150, 250, NULL);
  ASSERT (v_result->>'action') = 'updated', 'T6: should update existing';

  DECLARE v_new_killed_at TIMESTAMPTZ;
  BEGIN
    SELECT killed_at INTO v_new_killed_at FROM mvp_kills WHERE id = v_kill_id;
    ASSERT v_new_killed_at = v_killed_at, 'T6: killed_at should NOT change from tomb update';
  END;

  RAISE NOTICE 'TEST 6 PASSED: update_kill_from_tomb preserves killed_at';

  -- ============================================================
  -- TEST 7: update_kill_from_killer — creates new when no existing
  -- ============================================================
  DELETE FROM mvp_kills WHERE group_id = v_group_id AND mvp_id = v_mvp_id;

  v_result := update_kill_from_killer(
    v_group_id, v_mvp_ids,
    NOW() - INTERVAL '10 minutes',
    'NewKiller', NULL, 80, 90, NULL
  );
  ASSERT (v_result->>'action') = 'created', 'T7: should create new kill';

  RAISE NOTICE 'TEST 7 PASSED: update_kill_from_killer creates new when no existing';

  -- ============================================================
  -- TEST 8: _find_kill_for_mvp — returns NULL when nothing
  -- ============================================================
  DELETE FROM mvp_kills WHERE group_id = v_group_id AND mvp_id = v_mvp_id;

  DECLARE v_found UUID;
  BEGIN
    v_found := _find_kill_for_mvp(v_group_id, v_mvp_ids, NULL, NULL, NOW());
    ASSERT v_found IS NULL, 'T8: should return NULL when no kills';
  END;

  RAISE NOTICE 'TEST 8 PASSED: _find_kill_for_mvp returns NULL';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ALL 8 TESTS PASSED';
  RAISE NOTICE '========================================';

END $$;

ROLLBACK;
```

- [ ] **Step 2: Commit test file**

```bash
cd D:/rag/instance-tracker
git add supabase/tests/test_kill_rpcs.sql
git commit -m "test: SQL tests for specialized kill RPCs (ROLLBACK-safe)"
```

---

### Task 3: Apply migration and run tests

- [ ] **Step 1: Apply migration to live database**

```bash
cd D:/rag/instance-tracker
npx supabase db query --linked < supabase/migrations/20260404100000_specialized_kill_rpcs.sql
```

Expected: Empty result (function creation succeeds silently)

- [ ] **Step 2: Run SQL tests**

```bash
cd D:/rag/instance-tracker
npx supabase db query --linked < supabase/tests/test_kill_rpcs.sql
```

Expected: 8x `NOTICE: TEST N PASSED` + `ALL 8 TESTS PASSED`

- [ ] **Step 3: Commit (tests passed)**

```bash
cd D:/rag/instance-tracker
git commit --allow-empty -m "test: SQL tests passed against live DB"
```

---

### Task 4: Update mvp-event endpoint

**Files:**
- Modify: `src/app/api/telemetry/mvp-event/route.ts:69-80`

- [ ] **Step 1: Replace RPC call in mvp-event**

In `src/app/api/telemetry/mvp-event/route.ts`, replace the `supabase.rpc('telemetry_register_kill', ...)` call (around line 69) with:

```typescript
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('register_kill_from_event', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mvpResult.mvpIds,
    p_killed_at: killedAt,
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_killer_name: killer_name ?? null,
    p_killer_char_id: killerCharId,
    p_registered_by: ctx.characterUuid,
  })
```

Remove `p_source`, `p_session_id` (hardcoded in RPC now).

- [ ] **Step 2: Verify build**

```bash
cd D:/rag/instance-tracker && npx tsc --noEmit 2>&1 | grep -i "mvp-event"
```

Expected: No errors for mvp-event

- [ ] **Step 3: Commit**

```bash
git add src/app/api/telemetry/mvp-event/route.ts
git commit -m "refactor: mvp-event uses register_kill_from_event RPC"
```

---

### Task 5: Update mvp-tomb endpoint

**Files:**
- Modify: `src/app/api/telemetry/mvp-tomb/route.ts:66-115`

- [ ] **Step 1: Replace both RPC calls with single call**

Replace the two `supabase.rpc('telemetry_register_kill', ...)` calls and the `if (action === 'ignored')` block with:

```typescript
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('update_kill_from_tomb', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mapMvpIds,
    p_tomb_x: tomb_x,
    p_tomb_y: tomb_y,
    p_registered_by: ctx.characterUuid,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-tomb', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, tomb_x, tomb_y }, result: 'error', reason: rpcErr.message })
    return NextResponse.json({ error: 'Failed to process tomb' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'ignored'
  const killId = rpcResult?.kill_id
  const wasSentinel = rpcResult?.was_sentinel ?? false

  logTelemetryEvent(supabase, {
    endpoint: 'mvp-tomb',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { map, tomb_x, tomb_y, unknown_time: wasSentinel },
    result: action,
    killId: killId ?? null,
  })

  return NextResponse.json({ action, kill_id: killId, mvp_name: mvpName, was_sentinel: wasSentinel })
```

- [ ] **Step 2: Verify build**

```bash
cd D:/rag/instance-tracker && npx tsc --noEmit 2>&1 | grep -i "mvp-tomb"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/telemetry/mvp-tomb/route.ts
git commit -m "refactor: mvp-tomb uses update_kill_from_tomb RPC (single call)"
```

---

### Task 6: Update mvp-killer endpoint with respawn validation

**Files:**
- Modify: `src/app/api/telemetry/mvp-killer/route.ts:23-98`

- [ ] **Step 1: Fetch respawn_ms and pass to reconstructKilledAt**

After resolving MVPs (after the `matchMvpIds` block), add:

```typescript
  // Fetch respawn_ms for time validation
  let respawnMs: number | undefined
  if (matchMvpIds.length > 0) {
    const { data: mvpData } = await supabase
      .from('mvps')
      .select('respawn_ms')
      .eq('id', matchMvpIds[0])
      .maybeSingle()
    respawnMs = mvpData?.respawn_ms ?? undefined
  }

  const killedAtDate = reconstructKilledAt(kill_hour, kill_minute, new Date(), respawnMs)
  const killedAt = killedAtDate ? killedAtDate.toISOString() : null
```

- [ ] **Step 2: Replace RPC call**

Replace the `supabase.rpc('telemetry_register_kill', ...)` with:

```typescript
  if (!killedAt) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-killer',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { map, killer_name, kill_hour, kill_minute },
      result: 'ignored',
      reason: 'invalid_time',
    })
    return NextResponse.json({ action: 'ignored', reason: 'invalid_time' })
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('update_kill_from_killer', {
    p_group_id: ctx.groupId,
    p_mvp_ids: matchMvpIds,
    p_killed_at: killedAt,
    p_killer_name: killer_name,
    p_killer_char_id: killerMatch?.character_id ?? null,
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_registered_by: ctx.characterUuid,
  })
```

Remove `p_update_only`, `p_source`, `p_session_id`.

- [ ] **Step 3: Verify build**

```bash
cd D:/rag/instance-tracker && npx tsc --noEmit 2>&1 | grep -i "mvp-killer"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telemetry/mvp-killer/route.ts
git commit -m "refactor: mvp-killer uses update_kill_from_killer RPC with respawn validation"
```

---

### Task 7: Deprecate mvp-kill endpoint

**Files:**
- Modify: `src/app/api/telemetry/mvp-kill/route.ts`

- [ ] **Step 1: Replace with 410 Gone response**

Replace the entire POST handler body with:

```typescript
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use mvp-event instead.' },
    { status: 410 }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telemetry/mvp-kill/route.ts
git commit -m "deprecate: mvp-kill endpoint returns 410 Gone"
```

---

### Task 8: Push and deploy

- [ ] **Step 1: Push all changes**

```bash
cd D:/rag/instance-tracker
git push
```

- [ ] **Step 2: Redeploy Vercel**

```bash
npx vercel --prod -y
```

- [ ] **Step 3: Verify version endpoint still works**

```bash
curl -s "https://instanceiro.vercel.app/api/telemetry/version"
```

Expected: JSON with latest_version, download_url

- [ ] **Step 4: Live test with Rustro sniffer**

Run the sniffer, find a tomb, click it. Verify:
1. Tomb creates sentinel (timer shows "?")
2. Clicking tomb updates with real time
3. Kill shows correct BRT-reconstructed time

---

### Task 9: Rebuild and redeploy Claudinho installer

Only needed if sniffer code changed. Current sniffer code sends the same payloads — the endpoint changes are backward compatible. **This task can be skipped** unless testing reveals issues.
