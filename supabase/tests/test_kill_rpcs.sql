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
