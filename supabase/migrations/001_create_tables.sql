-- Enum for cooldown types
CREATE TYPE cooldown_type AS ENUM ('hourly', 'daily', 'three_day', 'weekly');

-- Profiles table (auto-created on Google login)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Characters table
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  class_path TEXT[] NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 250),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own characters"
  ON characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own characters"
  ON characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own characters"
  ON characters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own characters"
  ON characters FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Instances table (static data)
CREATE TABLE instances (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  level_required INTEGER NOT NULL,
  party_min INTEGER NOT NULL DEFAULT 1,
  cooldown_type cooldown_type NOT NULL,
  cooldown_hours INTEGER,
  available_day TEXT,
  difficulty TEXT,
  reward TEXT NOT NULL,
  mutual_exclusion_group TEXT
);

ALTER TABLE instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read instances"
  ON instances FOR SELECT
  USING (TRUE);

-- Character instances (active/inactive tracking)
CREATE TABLE character_instances (
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  instance_id INTEGER NOT NULL REFERENCES instances(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, instance_id)
);

ALTER TABLE character_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own character_instances"
  ON character_instances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own character_instances"
  ON character_instances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own character_instances"
  ON character_instances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own character_instances"
  ON character_instances FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = character_instances.character_id
      AND characters.user_id = auth.uid()
    )
  );

-- Instance completions (history log)
CREATE TABLE instance_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  instance_id INTEGER NOT NULL REFERENCES instances(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_completions_lookup
  ON instance_completions (character_id, instance_id, completed_at DESC);

ALTER TABLE instance_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completions"
  ON instance_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = instance_completions.character_id
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own completions"
  ON instance_completions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = instance_completions.character_id
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own completions"
  ON instance_completions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM characters
      WHERE characters.id = instance_completions.character_id
      AND characters.user_id = auth.uid()
    )
  );
