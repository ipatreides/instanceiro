-- Remove unused is_collapsed column from accounts
ALTER TABLE accounts DROP COLUMN IF EXISTS is_collapsed;
