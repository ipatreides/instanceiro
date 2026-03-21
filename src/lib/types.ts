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

export interface Character {
  id: string;
  user_id: string;
  name: string;
  class: string;
  class_path: string[];
  level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  isShared?: boolean;
  ownerUsername?: string | null;
}

export interface CharacterShare {
  character_id: string;
  shared_with_user_id: string;
  created_at: string;
  username?: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
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
}

export interface InstanceState {
  instance: Instance;
  isActive: boolean;
  completionCount: number;
  lastCompletion: InstanceCompletion | null;
  cooldownExpiresAt: Date | null;
  status: "available" | "cooldown" | "inactive";
}
