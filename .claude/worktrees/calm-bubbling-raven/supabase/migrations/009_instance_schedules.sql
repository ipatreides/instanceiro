-- Instance schedules
CREATE TABLE instance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id INT NOT NULL REFERENCES instances(id),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE instance_schedules ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is friend of target
CREATE OR REPLACE FUNCTION is_friend_of(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() = target_user_id THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
    AND ((requester_id = auth.uid() AND addressee_id = target_user_id)
      OR (requester_id = target_user_id AND addressee_id = auth.uid()))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE POLICY "Users can view schedules"
  ON instance_schedules FOR SELECT
  USING (auth.uid() = created_by OR is_friend_of(created_by));

CREATE POLICY "Users can create schedules"
  ON instance_schedules FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update schedules"
  ON instance_schedules FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete schedules"
  ON instance_schedules FOR DELETE
  USING (auth.uid() = created_by);

-- Schedule participants
CREATE TABLE schedule_participants (
  schedule_id UUID NOT NULL REFERENCES instance_schedules(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (schedule_id, user_id)
);

ALTER TABLE schedule_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participants"
  ON schedule_participants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM instance_schedules
    WHERE instance_schedules.id = schedule_participants.schedule_id
    AND (instance_schedules.created_by = auth.uid() OR is_friend_of(instance_schedules.created_by))
  ));

CREATE POLICY "Users can join schedules"
  ON schedule_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave or be removed"
  ON schedule_participants FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM instance_schedules
      WHERE instance_schedules.id = schedule_participants.schedule_id
      AND instance_schedules.created_by = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE instance_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_participants;
