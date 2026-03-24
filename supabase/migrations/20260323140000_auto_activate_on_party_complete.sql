-- Auto-activate instance for all characters when completing via party
CREATE OR REPLACE FUNCTION complete_instance_party(
  p_instance_id int,
  p_completed_at timestamptz,
  p_own_character_ids uuid[],
  p_friends jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party_id uuid;
  v_char_id uuid;
  v_friend jsonb;
  v_friend_user_id uuid;
  v_friend_char_id uuid;
  v_friend_char_name text;
  v_instance_name text;
  v_username text;
BEGIN
  -- Validate own characters belong to the calling user
  IF EXISTS (
    SELECT 1 FROM unnest(p_own_character_ids) AS cid
    WHERE cid NOT IN (
      SELECT id FROM characters WHERE user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'One or more characters do not belong to the current user';
  END IF;

  -- Get instance name
  SELECT name INTO v_instance_name
  FROM instances
  WHERE id = p_instance_id;

  IF v_instance_name IS NULL THEN
    RAISE EXCEPTION 'Instance not found: %', p_instance_id;
  END IF;

  -- Get calling user's username
  SELECT username INTO v_username
  FROM profiles
  WHERE id = auth.uid();

  -- Validate friend entries: each character_id belongs to specified user_id
  FOR v_friend IN SELECT * FROM jsonb_array_elements(p_friends)
  LOOP
    v_friend_user_id := (v_friend->>'user_id')::uuid;
    v_friend_char_id := (v_friend->>'character_id')::uuid;

    IF NOT EXISTS (
      SELECT 1 FROM characters
      WHERE id = v_friend_char_id AND user_id = v_friend_user_id
    ) THEN
      RAISE EXCEPTION 'Character % does not belong to user %', v_friend_char_id, v_friend_user_id;
    END IF;
  END LOOP;

  -- Create the party
  INSERT INTO instance_parties (instance_id, completed_at, created_by)
  VALUES (p_instance_id, p_completed_at, auth.uid())
  RETURNING id INTO v_party_id;

  -- Insert own characters as confirmed members + completions + auto-activate
  FOREACH v_char_id IN ARRAY p_own_character_ids
  LOOP
    INSERT INTO instance_party_members (party_id, character_id, user_id, status)
    VALUES (v_party_id, v_char_id, auth.uid(), 'confirmed');

    INSERT INTO instance_completions (character_id, instance_id, completed_at, party_id)
    VALUES (v_char_id, p_instance_id, p_completed_at, v_party_id);

    -- Auto-activate instance if inactive
    UPDATE character_instances
    SET is_active = true
    WHERE character_id = v_char_id
      AND instance_id = p_instance_id
      AND is_active = false;
  END LOOP;

  -- Insert friend characters as pending members + notifications
  FOR v_friend IN SELECT * FROM jsonb_array_elements(p_friends)
  LOOP
    v_friend_user_id := (v_friend->>'user_id')::uuid;
    v_friend_char_id := (v_friend->>'character_id')::uuid;

    -- Get friend's character name
    SELECT name INTO v_friend_char_name
    FROM characters
    WHERE id = v_friend_char_id;

    INSERT INTO instance_party_members (party_id, character_id, user_id, status)
    VALUES (v_party_id, v_friend_char_id, v_friend_user_id, 'pending');

    INSERT INTO notifications (user_id, type, payload)
    VALUES (
      v_friend_user_id,
      'party_confirm',
      jsonb_build_object(
        'party_id', v_party_id,
        'instance_name', v_instance_name,
        'invited_by', v_username,
        'character_id', v_friend_char_id,
        'character_name', v_friend_char_name,
        'completed_at', p_completed_at
      )
    );
  END LOOP;

  RETURN v_party_id;
END;
$$;
