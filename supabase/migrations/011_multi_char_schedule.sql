-- Allow same user to join a schedule with multiple characters
ALTER TABLE schedule_participants DROP CONSTRAINT schedule_participants_pkey;
ALTER TABLE schedule_participants ADD PRIMARY KEY (schedule_id, character_id);
