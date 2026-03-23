-- Servers (seed)
CREATE TABLE servers (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL
);
INSERT INTO servers (name) VALUES ('Freya'), ('Nidhogg');
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servers_public_read" ON servers FOR SELECT USING (true);

-- Accounts
CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  server_id int NOT NULL REFERENCES servers(id),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_collapsed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accounts_select_own" ON accounts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "accounts_insert_own" ON accounts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "accounts_update_own" ON accounts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "accounts_delete_own" ON accounts FOR DELETE USING (user_id = auth.uid());
CREATE INDEX idx_accounts_user_id ON accounts(user_id);

-- Wipe existing data (DB will be wiped before deploy)
DELETE FROM instance_completions;
DELETE FROM character_instances;
DELETE FROM instance_party_members;
DELETE FROM instance_parties;
DELETE FROM schedule_participants;
DELETE FROM schedule_placeholders;
DELETE FROM schedule_invites;
DELETE FROM instance_schedules;
DELETE FROM character_shares;
DELETE FROM characters;

-- Alter characters
ALTER TABLE characters ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE characters ADD COLUMN sort_order int NOT NULL DEFAULT 0;
ALTER TABLE characters ALTER COLUMN account_id SET NOT NULL;
CREATE INDEX idx_characters_account_id ON characters(account_id);
