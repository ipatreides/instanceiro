-- Add default_tab preference to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_tab TEXT NOT NULL DEFAULT 'instances' CHECK (default_tab IN ('instances', 'mvps'));
