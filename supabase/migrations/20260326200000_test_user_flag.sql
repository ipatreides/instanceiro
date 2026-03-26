-- Add test user flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT false;

-- Mark existing test users
UPDATE profiles SET is_test_user = true WHERE username IN ('potato', 'test1');
