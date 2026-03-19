-- Helper function to check if user is owner or shared (bypasses RLS on character_shares)
CREATE OR REPLACE FUNCTION is_character_owner_or_shared(char_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM characters WHERE id = char_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM character_shares WHERE character_id = char_id AND shared_with_user_id = auth.uid())
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Characters SELECT
DROP POLICY IF EXISTS "Users can view own or shared characters" ON characters;
CREATE POLICY "Users can view own or shared characters"
  ON characters FOR SELECT USING (is_character_owner_or_shared(id));

-- Character instances
DROP POLICY IF EXISTS "Users can view own or shared character_instances" ON character_instances;
CREATE POLICY "Users can view own or shared character_instances"
  ON character_instances FOR SELECT USING (is_character_owner_or_shared(character_id));

DROP POLICY IF EXISTS "Users can insert own or shared character_instances" ON character_instances;
CREATE POLICY "Users can insert own or shared character_instances"
  ON character_instances FOR INSERT WITH CHECK (is_character_owner_or_shared(character_id));

DROP POLICY IF EXISTS "Users can update own or shared character_instances" ON character_instances;
CREATE POLICY "Users can update own or shared character_instances"
  ON character_instances FOR UPDATE USING (is_character_owner_or_shared(character_id));

DROP POLICY IF EXISTS "Users can delete own or shared character_instances" ON character_instances;
CREATE POLICY "Users can delete own or shared character_instances"
  ON character_instances FOR DELETE USING (is_character_owner_or_shared(character_id));

-- Instance completions
DROP POLICY IF EXISTS "Users can view own or shared completions" ON instance_completions;
CREATE POLICY "Users can view own or shared completions"
  ON instance_completions FOR SELECT USING (is_character_owner_or_shared(character_id));

DROP POLICY IF EXISTS "Users can insert own or shared completions" ON instance_completions;
CREATE POLICY "Users can insert own or shared completions"
  ON instance_completions FOR INSERT WITH CHECK (is_character_owner_or_shared(character_id));

DROP POLICY IF EXISTS "Users can update own or shared completions" ON instance_completions;
CREATE POLICY "Users can update own or shared completions"
  ON instance_completions FOR UPDATE USING (is_character_owner_or_shared(character_id));

DROP POLICY IF EXISTS "Users can delete own or shared completions" ON instance_completions;
CREATE POLICY "Users can delete own or shared completions"
  ON instance_completions FOR DELETE USING (is_character_owner_or_shared(character_id));
