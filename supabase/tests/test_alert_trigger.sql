-- Test suite for queue_mvp_alerts trigger
-- Run via: supabase db query --linked < supabase/tests/test_alert_trigger.sql
-- Uses ROLLBACK — nothing persisted

BEGIN;

DO $$
DECLARE
  v_group_id UUID;
  v_mvp_id INT;
  v_kill_id UUID;
  v_count INT;
  v_alert_at TIMESTAMPTZ;
  v_owner_id UUID;
BEGIN
  -- Use first available group + MVP
  SELECT g.id, g.created_by INTO v_group_id, v_owner_id FROM mvp_groups g LIMIT 1;
  SELECT m.id INTO v_mvp_id FROM mvps m WHERE m.server_id = 2 LIMIT 1;

  IF v_group_id IS NULL OR v_mvp_id IS NULL THEN
    RAISE EXCEPTION 'No test data: need at least 1 group and 1 MVP';
  END IF;

  -- Ensure discord config exists for alerts to fire
  INSERT INTO discord_notifications (user_id, discord_user_id, bot_channel_id, alert_minutes)
  VALUES (v_owner_id, 'test_discord_user', '123456789', 5)
  ON CONFLICT (user_id) DO UPDATE SET bot_channel_id = '123456789', alert_minutes = 5;

  -- Clean slate
  DELETE FROM mvp_kills WHERE group_id = v_group_id AND mvp_id = v_mvp_id;
  DELETE FROM mvp_alert_queue WHERE group_id = v_group_id;

  -- ============================================================
  -- TEST 1: Sentinel kill does NOT create alerts
  -- ============================================================
  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, source)
  VALUES (v_group_id, v_mvp_id, '1970-01-01T00:00:00Z', 'telemetry')
  RETURNING id INTO v_kill_id;

  SELECT count(*) INTO v_count FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;
  ASSERT v_count = 0, 'T1: Sentinel kill should NOT create alerts, got ' || v_count;

  RAISE NOTICE 'TEST 1 PASSED: Sentinel kill creates no alerts';

  -- ============================================================
  -- TEST 2: Update sentinel to real time → creates alerts
  -- ============================================================
  UPDATE mvp_kills SET killed_at = NOW() - INTERVAL '5 minutes' WHERE id = v_kill_id;

  SELECT count(*) INTO v_count FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;
  ASSERT v_count = 2, 'T2: Update to real time should create 2 alerts (pre_spawn + spawn), got ' || v_count;

  RAISE NOTICE 'TEST 2 PASSED: Update sentinel to real time creates alerts';

  -- ============================================================
  -- TEST 3: Update killed_at again → deletes old, creates new
  -- ============================================================
  UPDATE mvp_kills SET killed_at = NOW() - INTERVAL '10 minutes' WHERE id = v_kill_id;

  SELECT count(*) INTO v_count FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;
  ASSERT v_count = 2, 'T3: Re-update should still have exactly 2 alerts, got ' || v_count;

  RAISE NOTICE 'TEST 3 PASSED: Update killed_at replaces old alerts';

  -- ============================================================
  -- TEST 4: Update tomb_x (not killed_at) → no change to alerts
  -- ============================================================
  SELECT count(*) INTO v_count FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;
  UPDATE mvp_kills SET tomb_x = 100, tomb_y = 200 WHERE id = v_kill_id;

  DECLARE v_count_after INT;
  BEGIN
    SELECT count(*) INTO v_count_after FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;
    ASSERT v_count_after = v_count, 'T4: Non-killed_at update should not change alerts';
  END;

  RAISE NOTICE 'TEST 4 PASSED: Non-killed_at update preserves alerts';

  -- ============================================================
  -- TEST 5: Insert with real time → creates alerts
  -- ============================================================
  DELETE FROM mvp_kills WHERE id = v_kill_id;
  DELETE FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;

  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, source)
  VALUES (v_group_id, v_mvp_id, NOW() - INTERVAL '2 minutes', 'telemetry')
  RETURNING id INTO v_kill_id;

  SELECT count(*) INTO v_count FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;
  ASSERT v_count = 2, 'T5: Insert with real time should create 2 alerts, got ' || v_count;

  RAISE NOTICE 'TEST 5 PASSED: Insert with real time creates alerts';

  -- ============================================================
  -- TEST 6: Insert with spawn in the past → no alerts
  -- ============================================================
  DELETE FROM mvp_kills WHERE id = v_kill_id;
  DELETE FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;

  INSERT INTO mvp_kills (group_id, mvp_id, killed_at, source)
  VALUES (v_group_id, v_mvp_id, NOW() - INTERVAL '24 hours', 'telemetry')
  RETURNING id INTO v_kill_id;

  SELECT count(*) INTO v_count FROM mvp_alert_queue WHERE mvp_kill_id = v_kill_id;
  ASSERT v_count = 0, 'T6: Kill with spawn in past should NOT create alerts, got ' || v_count;

  RAISE NOTICE 'TEST 6 PASSED: Past spawn creates no alerts';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ALL 6 TESTS PASSED';
  RAISE NOTICE '========================================';

END $$;

ROLLBACK;
