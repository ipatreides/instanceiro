export type CooldownType = "hourly" | "daily" | "three_day" | "weekly";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string;
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
