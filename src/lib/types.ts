export type CooldownType = "hourly" | "daily" | "three_day" | "weekly";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string;
  username: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: number;
  name: string;
}

export interface Account {
  id: string;
  user_id: string;
  server_id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface Character {
  id: string;
  user_id: string;
  account_id: string;
  name: string;
  class: string;
  class_path: string[];
  level: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  other_user_id: string;
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface InstanceSchedule {
  id: string;
  instance_id: number;
  character_id: string;
  created_by: string;
  scheduled_at: string;
  status: 'open' | 'completed' | 'expired';
  title: string | null;
  message: string | null;
  created_at: string;
  // Joined
  instanceName?: string;
  instanceStartMap?: string | null;
  instanceLigaTier?: string | null;
  creatorUsername?: string;
  creatorAvatar?: string | null;
  participantCount?: number;
}

export interface ScheduleParticipant {
  schedule_id: string;
  character_id: string;
  user_id: string;
  message: string | null;
  created_at: string;
  username?: string;
  avatar_url?: string | null;
  characterName?: string;
  characterClass?: string;
  characterLevel?: number;
}

export interface SchedulePlaceholder {
  id: string;
  schedule_id: string;
  slot_type: 'class' | 'dps_fisico' | 'dps_magico' | 'artista';
  slot_label: string;
  slot_class: string | null;
  added_by: string;
  claimed_by: string | null;
  claimed_character_id: string | null;
  created_at: string;
  // Enriched fields (from joins, present when claimed)
  characters?: { name: string; class: string; level: number } | null;
  profiles?: { username: string; avatar_url: string | null } | null;
}

export interface FriendInvite {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface FriendInviteCreator {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Instance {
  id: number;
  name: string;
  level_required: number;
  party_min: number;
  cooldown_type: CooldownType;
  cooldown_hours: number | null;
  available_day: string | null;
  difficulty: string | null;
  reward: string;
  mutual_exclusion_group: string | null;
  level_max: number | null;
  wiki_url: string | null;
  start_map: string | null;
  liga_tier: 'A' | 'B' | 'C' | null;
  liga_coins: number | null;
  is_solo: boolean;
  aliases: string[] | null;
}

export interface CharacterInstance {
  character_id: string;
  instance_id: number;
  is_active: boolean;
  created_at: string;
}

export interface InstanceCompletion {
  id: string;
  character_id: string;
  instance_id: number;
  completed_at: string;
  party_id?: string | null;
}

export interface InstanceState {
  instance: Instance;
  isActive: boolean;
  completionCount: number;
  lastCompletion: InstanceCompletion | null;
  cooldownExpiresAt: Date | null;
  status: "available" | "cooldown" | "inactive";
}

export interface InstanceParty {
  id: string;
  instance_id: number;
  completed_at: string;
  created_by: string;
  created_at: string;
}

export interface InstancePartyMember {
  id: string;
  party_id: string;
  character_id: string;
  user_id: string;
  status: "confirmed" | "pending" | "accepted" | "declined";
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  is_read: boolean;
  responded: boolean;
  expires_at: string;
  created_at: string;
}

// MVP Timer types

export interface Mvp {
  id: number;
  server_id: number;
  monster_id: number;
  name: string;
  map_name: string;
  respawn_ms: number;
  delay_ms: number;
  level: number | null;
  hp: number | null;
}

export interface MvpMapMeta {
  map_name: string;
  width: number;
  height: number;
}

export interface MvpDrop {
  id: number;
  mvp_monster_id: number;
  item_id: number;
  item_name: string;
  drop_rate: number | null;
}

export interface MvpGroup {
  id: string;
  name: string;
  server_id: number;
  created_by: string;
  alert_minutes: number;
  discord_channel_id: string | null;
  created_at: string;
}

export interface MvpGroupMember {
  group_id: string;
  character_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface MvpActiveKill {
  kill_id: string;
  mvp_id: number;
  killed_at: string;
  tomb_x: number | null;
  tomb_y: number | null;
  killer_character_id: string | null;
  registered_by: string;
  edited_by: string | null;
  killer_name: string | null;
  registered_by_name: string;
  edited_by_name: string | null;
  kill_count: number;
}

export type MvpTimerStatus = 'cooldown' | 'spawn_window' | 'probably_alive' | 'tomb_expired' | 'inactive';
