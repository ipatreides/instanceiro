-- Allow users to read characters of accepted friends
-- This is needed for the placeholder enriched query (join characters!claimed_character_id)
-- and for any feature that displays friend character details

DROP POLICY IF EXISTS "Users can view own characters" ON characters;

CREATE POLICY "Users can view own or friends characters"
  ON characters FOR SELECT
  USING (
    auth.uid() = user_id
    OR user_id IN (
      SELECT CASE
        WHEN requester_id = auth.uid() THEN addressee_id
        ELSE requester_id
      END
      FROM friendships
      WHERE status = 'accepted'
        AND (requester_id = auth.uid() OR addressee_id = auth.uid())
    )
  );
