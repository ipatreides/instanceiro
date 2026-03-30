-- Clean up ghost kills and duplicates

-- 1. Remove kills with mvp_id = 0 (ghost kills)
-- CASCADE will clean mvp_kill_loots, mvp_kill_party, mvp_alert_queue
DELETE FROM mvp_kills WHERE mvp_id = 0;

-- 2. Deduplicate kills with identical (mvp_id, group_id, killed_at)
-- Keep oldest by created_at, remove duplicates
DELETE FROM mvp_kills
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY mvp_id, group_id, killed_at
      ORDER BY created_at ASC
    ) AS rn
    FROM mvp_kills
  ) ranked
  WHERE rn > 1
);
