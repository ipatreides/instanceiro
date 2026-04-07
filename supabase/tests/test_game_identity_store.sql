-- Tests for game_identity_store migration: backfill triggers
-- Uses high IDs (99999, 88888) to avoid conflicts with real data.
-- ROLLBACK-safe: all changes are reverted at the end.

BEGIN;

DO $$
DECLARE
  v_group_id UUID;
  v_mvp_id   INT;
  v_kill_id  UUID;
  v_count    INT;
  v_name     TEXT;
BEGIN
  -- ============================================================
  -- Setup: get real FK references for mvp_kills
  -- ============================================================
  SELECT id INTO v_group_id FROM mvp_groups LIMIT 1;
  SELECT id INTO v_mvp_id   FROM mvps LIMIT 1;

  IF v_group_id IS NULL OR v_mvp_id IS NULL THEN
    RAISE EXCEPTION 'No test data: need at least one mvp_group and one mvp';
  END IF;

  -- Create a test kill with placeholder names
  INSERT INTO mvp_kills (id, group_id, mvp_id, killed_at, killer_name_raw, first_hitter_name, source)
  VALUES (
    gen_random_uuid(),
    v_group_id,
    v_mvp_id,
    now(),
    'actor_99999',
    'actor_99999',
    'test'
  )
  RETURNING id INTO v_kill_id;

  -- Create a test damage hit with placeholder source_name
  INSERT INTO mvp_kill_damage_hits (kill_id, source_name, damage, source_id, server_tick, elapsed_ms)
  VALUES (v_kill_id, 'actor_99999', 500, 99999, 0, 0);

  -- Also create a kill with char_ placeholder
  INSERT INTO mvp_kills (id, group_id, mvp_id, killed_at, killer_name_raw, first_hitter_name, source)
  VALUES (
    gen_random_uuid(),
    v_group_id,
    v_mvp_id,
    now(),
    'char_88888',
    'char_88888',
    'test'
  );

  -- Create an unrelated kill that should NOT be touched
  INSERT INTO mvp_kills (id, group_id, mvp_id, killed_at, killer_name_raw, first_hitter_name, source)
  VALUES (
    gen_random_uuid(),
    v_group_id,
    v_mvp_id,
    now(),
    'SomeRealPlayer',
    'SomeRealPlayer',
    'test'
  );

  -- ============================================================
  -- TEST 1: game_accounts trigger backfills actor_NNNNN in killer_name_raw
  -- ============================================================
  INSERT INTO game_accounts (account_id, server_id, name)
  VALUES (99999, 2, 'ResolvedAccountName');

  SELECT killer_name_raw INTO v_name
    FROM mvp_kills WHERE id = v_kill_id;
  ASSERT v_name = 'ResolvedAccountName',
    'T1 FAIL: killer_name_raw should be backfilled, got: ' || COALESCE(v_name, 'NULL');
  RAISE NOTICE 'TEST 1 PASSED: game_accounts trigger backfills killer_name_raw';

  -- ============================================================
  -- TEST 2: game_accounts trigger backfills first_hitter_name
  -- ============================================================
  SELECT first_hitter_name INTO v_name
    FROM mvp_kills WHERE id = v_kill_id;
  ASSERT v_name = 'ResolvedAccountName',
    'T2 FAIL: first_hitter_name should be backfilled, got: ' || COALESCE(v_name, 'NULL');
  RAISE NOTICE 'TEST 2 PASSED: game_accounts trigger backfills first_hitter_name';

  -- ============================================================
  -- TEST 3: game_accounts trigger backfills damage_hits source_name
  -- ============================================================
  SELECT source_name INTO v_name
    FROM mvp_kill_damage_hits WHERE kill_id = v_kill_id AND source_id = 99999;
  ASSERT v_name = 'ResolvedAccountName',
    'T3 FAIL: source_name should be backfilled, got: ' || COALESCE(v_name, 'NULL');
  RAISE NOTICE 'TEST 3 PASSED: game_accounts trigger backfills damage_hits source_name';

  -- ============================================================
  -- TEST 4: game_characters trigger backfills char_NNNNN
  -- ============================================================
  INSERT INTO game_characters (char_id, server_id, name)
  VALUES (88888, 2, 'ResolvedCharName');

  SELECT count(*) INTO v_count
    FROM mvp_kills
   WHERE killer_name_raw = 'ResolvedCharName'
     AND first_hitter_name = 'ResolvedCharName';
  ASSERT v_count = 1,
    'T4 FAIL: char_ placeholder should be backfilled, found ' || v_count || ' rows';
  RAISE NOTICE 'TEST 4 PASSED: game_characters trigger backfills char_NNNNN';

  -- ============================================================
  -- TEST 5: Trigger ignores placeholder names (name LIKE 'actor_%')
  -- ============================================================
  -- Insert another kill with actor_77777
  INSERT INTO mvp_kills (id, group_id, mvp_id, killed_at, killer_name_raw, first_hitter_name, source)
  VALUES (
    gen_random_uuid(),
    v_group_id,
    v_mvp_id,
    now(),
    'actor_77777',
    'actor_77777',
    'test'
  );

  -- Insert a game_account with a placeholder name — should NOT backfill
  INSERT INTO game_accounts (account_id, server_id, name)
  VALUES (77777, 2, 'actor_77777');

  SELECT count(*) INTO v_count
    FROM mvp_kills WHERE killer_name_raw = 'actor_77777';
  ASSERT v_count = 1,
    'T5 FAIL: placeholder name should NOT trigger backfill, expected 1 row, got ' || v_count;
  RAISE NOTICE 'TEST 5 PASSED: trigger ignores placeholder names';

  -- ============================================================
  -- TEST 6: Trigger does not affect unrelated rows
  -- ============================================================
  SELECT count(*) INTO v_count
    FROM mvp_kills WHERE killer_name_raw = 'SomeRealPlayer';
  ASSERT v_count = 1,
    'T6 FAIL: unrelated rows should be untouched, expected 1 got ' || v_count;
  RAISE NOTICE 'TEST 6 PASSED: trigger does not affect unrelated rows';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ALL 6 TESTS PASSED';
  RAISE NOTICE '========================================';
END $$;

ROLLBACK;
