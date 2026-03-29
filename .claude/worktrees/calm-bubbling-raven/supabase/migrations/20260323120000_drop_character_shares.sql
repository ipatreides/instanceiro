-- Remove character sharing system (replaced by instance scheduling/invites)

-- 1. Drop sharing-related policies on characters
DROP POLICY IF EXISTS "Users can view own or shared characters" ON characters;
CREATE POLICY "Users can view own characters"
  ON characters FOR SELECT
  USING (auth.uid() = user_id);

-- 2. Drop sharing-related policies on character_instances
DROP POLICY IF EXISTS "Users can view own or shared character_instances" ON character_instances;
DROP POLICY IF EXISTS "Users can insert own or shared character_instances" ON character_instances;
DROP POLICY IF EXISTS "Users can update own or shared character_instances" ON character_instances;
DROP POLICY IF EXISTS "Users can delete own or shared character_instances" ON character_instances;

CREATE POLICY "Users can view own character_instances"
  ON character_instances FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = character_instances.character_id
    AND characters.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own character_instances"
  ON character_instances FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = character_instances.character_id
    AND characters.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own character_instances"
  ON character_instances FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = character_instances.character_id
    AND characters.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own character_instances"
  ON character_instances FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = character_instances.character_id
    AND characters.user_id = auth.uid()
  ));

-- 3. Drop sharing-related policies on instance_completions
DROP POLICY IF EXISTS "Users can view own or shared completions" ON instance_completions;
DROP POLICY IF EXISTS "Users can insert own or shared completions" ON instance_completions;
DROP POLICY IF EXISTS "Users can update own or shared completions" ON instance_completions;
DROP POLICY IF EXISTS "Users can delete own or shared completions" ON instance_completions;

CREATE POLICY "Users can view own completions"
  ON instance_completions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = instance_completions.character_id
    AND characters.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own completions"
  ON instance_completions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = instance_completions.character_id
    AND characters.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own completions"
  ON instance_completions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = instance_completions.character_id
    AND characters.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own completions"
  ON instance_completions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM characters
    WHERE characters.id = instance_completions.character_id
    AND characters.user_id = auth.uid()
  ));

-- 4. Drop helper functions
DROP FUNCTION IF EXISTS is_character_owner_or_shared(UUID);
DROP FUNCTION IF EXISTS get_shared_characters();

-- 5. Drop the character_shares table
DROP TABLE IF EXISTS character_shares;
