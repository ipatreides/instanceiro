-- Add username field to profiles
ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (username ~ '^[a-z0-9]{3,20}$');

-- Replace "Users can view own profile" with public SELECT for username lookups
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Anyone can read profiles"
  ON profiles FOR SELECT
  USING (TRUE);
