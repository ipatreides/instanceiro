-- Allow group members to see telemetry sessions of other group members.
-- Previously only "Users can read own sessions" existed, so the green
-- online dot only showed for the current user's characters.

CREATE POLICY "Group members can read group sessions"
ON telemetry_sessions FOR SELECT
USING (
  group_id IN (
    SELECT group_id FROM mvp_group_members WHERE user_id = auth.uid()
  )
);
