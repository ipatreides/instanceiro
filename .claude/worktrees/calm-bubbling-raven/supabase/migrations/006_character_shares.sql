-- Character sharing table
CREATE TABLE character_shares (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, shared_with_user_id)
);

ALTER TABLE character_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage shares"
  ON character_shares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_shares.character_id
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Shared users can see their shares"
  ON character_shares FOR SELECT
  USING (shared_with_user_id = auth.uid());

-- Update characters SELECT to include shared
DROP POLICY IF EXISTS "Users can view own characters" ON characters;
CREATE POLICY "Users can view own or shared characters"
  ON characters FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM character_shares
      WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    )
  );

-- Update character_instances policies
DROP POLICY IF EXISTS "Users can view own character_instances" ON character_instances;
CREATE POLICY "Users can view own or shared character_instances"
  ON character_instances FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = character_instances.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));

DROP POLICY IF EXISTS "Users can insert own character_instances" ON character_instances;
CREATE POLICY "Users can insert own or shared character_instances"
  ON character_instances FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = character_instances.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));

DROP POLICY IF EXISTS "Users can update own character_instances" ON character_instances;
CREATE POLICY "Users can update own or shared character_instances"
  ON character_instances FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = character_instances.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));

DROP POLICY IF EXISTS "Users can delete own character_instances" ON character_instances;
CREATE POLICY "Users can delete own or shared character_instances"
  ON character_instances FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = character_instances.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));

-- Update instance_completions policies
DROP POLICY IF EXISTS "Users can view own completions" ON instance_completions;
CREATE POLICY "Users can view own or shared completions"
  ON instance_completions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = instance_completions.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));

DROP POLICY IF EXISTS "Users can insert own completions" ON instance_completions;
CREATE POLICY "Users can insert own or shared completions"
  ON instance_completions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = instance_completions.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));

DROP POLICY IF EXISTS "Users can update own completions" ON instance_completions;
CREATE POLICY "Users can update own or shared completions"
  ON instance_completions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = instance_completions.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));

DROP POLICY IF EXISTS "Users can delete own completions" ON instance_completions;
CREATE POLICY "Users can delete own or shared completions"
  ON instance_completions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM characters WHERE characters.id = instance_completions.character_id
    AND (characters.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM character_shares WHERE character_shares.character_id = characters.id
      AND character_shares.shared_with_user_id = auth.uid()
    ))
  ));
