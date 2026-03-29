-- Split enabled into hourly_enabled and schedule_enabled
ALTER TABLE discord_notifications RENAME COLUMN enabled TO hourly_enabled;
ALTER TABLE discord_notifications ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT true;
