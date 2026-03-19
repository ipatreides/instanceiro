-- Helper function to check if user is owner or shared (bypasses RLS)
CREATE OR REPLACE FUNCTION is_character_owner_or_shared(char_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_owner BOOLEAN;
  is_shared BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.characters WHERE id = char_id AND user_id = auth.uid()) INTO is_owner;
  IF is_owner THEN RETURN TRUE; END IF;
  SELECT EXISTS (SELECT 1 FROM public.character_shares WHERE character_id = char_id AND shared_with_user_id = auth.uid()) INTO is_shared;
  RETURN is_shared;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get shared characters (bypasses RLS)
CREATE OR REPLACE FUNCTION get_shared_characters()
RETURNS SETOF characters AS $$
  SELECT c.* FROM characters c
  INNER JOIN character_shares cs ON cs.character_id = c.id
  WHERE cs.shared_with_user_id = auth.uid() AND c.is_active = true
  ORDER BY c.created_at;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Characters SELECT: simple own-only (shared fetched via RPC)
DROP POLICY IF EXISTS "Users can view own or shared characters" ON characters;
CREATE POLICY "Users can view own or shared characters"
  ON characters FOR SELECT USING (auth.uid() = user_id);

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
