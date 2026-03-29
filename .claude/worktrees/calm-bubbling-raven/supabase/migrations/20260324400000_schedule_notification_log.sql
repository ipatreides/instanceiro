-- Add schedule_id to notification_log for schedule-based notifications
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES instance_schedules(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notification_log_schedule ON notification_log (schedule_id, user_id, type) WHERE schedule_id IS NOT NULL;
