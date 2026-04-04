BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_group_id UUID;
  v_account_id UUID;
  v_char_id UUID;
  v_count INT;
BEGIN
  -- Setup: get real user, group, account, character
  SELECT g.id, g.created_by INTO v_group_id, v_user_id FROM mvp_groups g LIMIT 1;
  SELECT a.id INTO v_account_id FROM accounts a WHERE a.user_id = v_user_id LIMIT 1;
  SELECT c.id INTO v_char_id FROM characters c WHERE c.user_id = v_user_id AND c.account_id = v_account_id LIMIT 1;

  IF v_user_id IS NULL OR v_char_id IS NULL THEN
    RAISE EXCEPTION 'No test data: need user with group, account, character';
  END IF;

  -- Clean slate
  UPDATE characters SET game_char_id = NULL WHERE user_id = v_user_id;
  UPDATE accounts SET game_account_id = NULL WHERE user_id = v_user_id;
  DELETE FROM unresolved_game_characters WHERE user_id = v_user_id;

  -- TEST 1: Set game_char_id on character
  UPDATE characters SET game_char_id = 333489 WHERE id = v_char_id;
  SELECT count(*) INTO v_count FROM characters WHERE id = v_char_id AND game_char_id = 333489;
  ASSERT v_count = 1, 'T1: game_char_id should be set';
  RAISE NOTICE 'TEST 1 PASSED: game_char_id set on character';

  -- TEST 2: Set game_account_id on account
  UPDATE accounts SET game_account_id = 1595739 WHERE id = v_account_id;
  SELECT count(*) INTO v_count FROM accounts WHERE id = v_account_id AND game_account_id = 1595739;
  ASSERT v_count = 1, 'T2: game_account_id should be set';
  RAISE NOTICE 'TEST 2 PASSED: game_account_id set on account';

  -- TEST 3: UNIQUE constraint on game_char_id
  BEGIN
    UPDATE characters SET game_char_id = 333489 WHERE id != v_char_id AND user_id = v_user_id;
    RAISE EXCEPTION 'T3: Should have failed with unique violation';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST 3 PASSED: game_char_id UNIQUE enforced';
  END;

  -- TEST 4: Insert unresolved
  INSERT INTO unresolved_game_characters (game_char_id, game_account_id, char_name, user_id, group_id)
  VALUES (999999, 888888, 'UnknownChar', v_user_id, v_group_id);
  SELECT count(*) INTO v_count FROM unresolved_game_characters WHERE game_char_id = 999999;
  ASSERT v_count = 1, 'T4: unresolved should exist';
  RAISE NOTICE 'TEST 4 PASSED: unresolved created';

  -- TEST 5: Resolve unresolved (delete + set game_char_id)
  DELETE FROM unresolved_game_characters WHERE game_char_id = 999999;
  SELECT count(*) INTO v_count FROM unresolved_game_characters WHERE game_char_id = 999999;
  ASSERT v_count = 0, 'T5: unresolved should be deleted';
  RAISE NOTICE 'TEST 5 PASSED: unresolved resolved (deleted)';

  -- TEST 6: Idempotent insert (upsert)
  INSERT INTO unresolved_game_characters (game_char_id, game_account_id, char_name, user_id, group_id)
  VALUES (777777, 666666, 'TestChar', v_user_id, v_group_id);
  INSERT INTO unresolved_game_characters (game_char_id, game_account_id, char_name, user_id, group_id)
  VALUES (777777, 666666, 'TestChar', v_user_id, v_group_id)
  ON CONFLICT (game_char_id) DO UPDATE SET updated_at = now();
  SELECT count(*) INTO v_count FROM unresolved_game_characters WHERE game_char_id = 777777;
  ASSERT v_count = 1, 'T6: idempotent upsert should have 1 row';
  RAISE NOTICE 'TEST 6 PASSED: idempotent upsert';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ALL 6 TESTS PASSED';
  RAISE NOTICE '========================================';
END $$;

ROLLBACK;
