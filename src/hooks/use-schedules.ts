"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InstanceSchedule, ScheduleParticipant, SchedulePlaceholder } from "@/lib/types";

function fireCalendarSync(body: {
  action: "create" | "update" | "delete" | "delete_all";
  scheduleId: string;
  userId?: string;
  data?: { instanceName: string; title?: string; scheduledAt: string; participants: string[]; message?: string; };
}) {
  fetch("/api/calendar/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {}); // Best-effort, swallow errors
}

export interface EligibleCharacter {
  character_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
}

export interface EligibleFriend {
  user_id: string;
  username: string;
  avatar_url: string | null;
  character_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  is_active: boolean;
  last_completed_at: string | null;
}

interface UseSchedulesReturn {
  schedules: InstanceSchedule[];
  loading: boolean;
  createSchedule: (instanceId: number, characterId: string, scheduledAt: string, message?: string, title?: string) => Promise<string>;
  updateScheduleTitle: (scheduleId: string, title: string) => Promise<void>;
  joinSchedule: (scheduleId: string, characterId: string, message?: string) => Promise<void>;
  leaveSchedule: (scheduleId: string, characterId: string) => Promise<void>;
  removeParticipant: (scheduleId: string, characterId: string) => Promise<void>;
  inviteFriend: (scheduleId: string, characterId: string, userId: string) => Promise<void>;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  completeSchedule: (scheduleId: string, confirmedParticipants: { userId: string; characterId: string }[]) => Promise<void>;
  expireSchedule: (scheduleId: string) => Promise<void>;
  updateScheduleTime: (scheduleId: string, scheduledAt: string) => Promise<void>;
  getParticipants: (scheduleId: string) => Promise<ScheduleParticipant[]>;
  addPlaceholder: (scheduleId: string, slotType: 'class' | 'dps_fisico' | 'dps_magico' | 'artista', slotLabel: string, slotClass: string | null) => Promise<void>;
  removePlaceholder: (placeholderId: string) => Promise<void>;
  getPlaceholders: (scheduleId: string) => Promise<SchedulePlaceholder[]>;
  claimPlaceholder: (placeholderId: string, characterId: string) => Promise<void>;
  unclaimPlaceholder: (placeholderId: string) => Promise<void>;
  getEligibleForPlaceholder: (placeholderId: string) => Promise<EligibleCharacter[]>;
  getScheduledCharacterIds: (instanceId: number) => Promise<Set<string>>;
  getScheduledCharsWithTimes: (instanceId: number) => Promise<{ character_id: string; scheduled_at: string }[]>;
}

// Module-level caches (shared across re-renders, cleared on page reload)
let cachedUserId: string | null = null;
let cachedInstanceMap: Map<number, { id: number; name: string; start_map: string | null; liga_tier: string | null }> | null = null;
let cachedProfileMap: Map<string, { id: string; username: string; avatar_url: string | null }> = new Map();
let profileCacheTime = 0;
const PROFILE_CACHE_TTL = 5 * 60 * 1000; // 5 min

export function useSchedules(): UseSchedulesReturn {
  const [schedules, setSchedules] = useState<InstanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();

    // Fetch open schedules
    const { data } = await supabase
      .from("instance_schedules")
      .select("id, instance_id, character_id, created_by, scheduled_at, status, title, message, created_at")
      .in("status", ["open"])
      .order("scheduled_at", { ascending: true });

    if (!data || data.length === 0) {
      setSchedules([]);
      return;
    }

    // Cache userId (never changes during session)
    if (!cachedUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      cachedUserId = user?.id ?? null;
    }

    const instanceIds = [...new Set(data.map((s) => s.instance_id))];
    const creatorIds = [...new Set(data.map((s) => s.created_by))];

    // Cache instance data (static game data, almost never changes)
    const missingInstanceIds = cachedInstanceMap
      ? instanceIds.filter((id) => !cachedInstanceMap!.has(id))
      : instanceIds;

    // Determine which profiles need fetching (cache miss or expired)
    const now = Date.now();
    const profilesExpired = now - profileCacheTime > PROFILE_CACHE_TTL;
    const missingProfileIds = profilesExpired
      ? creatorIds
      : creatorIds.filter((id) => !cachedProfileMap.has(id));

    // Fetch schedule summary (counts + participation) in one RPC call
    const { data: summaryData } = await supabase.rpc("get_schedule_summary", {
      p_schedule_ids: data.map((s) => s.id),
    });
    const summaries = (summaryData ?? []) as { schedule_id: string; participant_count: number; placeholder_count: number; is_participant: boolean }[];

    // Fetch instances only if cache misses
    if (!cachedInstanceMap || missingInstanceIds.length > 0) {
      const { data: instancesData } = await supabase
        .from("instances")
        .select("id, name, start_map, liga_tier")
        .in("id", missingInstanceIds.length > 0 ? missingInstanceIds : instanceIds);
      if (!cachedInstanceMap) cachedInstanceMap = new Map();
      for (const i of (instancesData ?? [])) {
        cachedInstanceMap.set(i.id, i);
      }
    }

    // Fetch profiles only if cache misses or expired
    if (missingProfileIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", missingProfileIds);
      for (const p of (profilesData ?? [])) {
        cachedProfileMap.set(p.id, p);
      }
      if (profilesExpired) profileCacheTime = now;
    }

    const instanceMap = cachedInstanceMap!;
    const profileMap = cachedProfileMap;

    // Build maps from summary RPC
    const summaryMap = new Map(summaries.map((s) => [s.schedule_id, s]));

    const enriched: InstanceSchedule[] = data.map((s) => {
      const inst = instanceMap.get(s.instance_id);
      const creator = profileMap.get(s.created_by);
      const summary = summaryMap.get(s.id);
      return {
        ...s,
        instanceName: inst?.name ?? "???",
        instanceStartMap: inst?.start_map ?? null,
        instanceLigaTier: inst?.liga_tier ?? null,
        creatorUsername: creator?.username ?? "???",
        creatorAvatar: creator?.avatar_url ?? null,
        participantCount: (summary?.participant_count ?? 0) + (summary?.placeholder_count ?? 0) + 1, // +1 for creator
      };
    });

    // Auto-expire schedules >3h late, hide >30min late from non-participants
    const THIRTY_MIN = 30 * 60 * 1000;
    const THREE_HOURS = 3 * 60 * 60 * 1000;

    // Auto-expire >3h late schedules
    const toExpire = enriched.filter((s) => {
      const delay = now - new Date(s.scheduled_at).getTime();
      return delay > THREE_HOURS;
    });
    for (const s of toExpire) {
      supabase.from("instance_schedules").update({ status: "expired" }).eq("id", s.id).then(() => {});
      fireCalendarSync({ action: "delete_all", scheduleId: s.id });
    }

    // Filter: hide >30min late from non-participants, remove >3h expired
    const filtered = enriched.filter((s) => {
      const delay = now - new Date(s.scheduled_at).getTime();
      if (delay > THREE_HOURS) return false;
      if (delay > THIRTY_MIN && !(summaryMap.get(s.id)?.is_participant ?? false)) return false;
      return true;
    });

    setSchedules(filtered);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    fetchAll().then(() => { if (!cancelled) setLoading(false); });

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchAll(), 5000);
    };

    const supabase = createClient();
    const channel = supabase
      .channel("schedules-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "instance_schedules" }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_participants" }, debouncedFetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_placeholders" }, debouncedFetch)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const createSchedule = useCallback(async (instanceId: number, characterId: string, scheduledAt: string, message?: string, title?: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("instance_schedules")
      .insert({
        instance_id: instanceId,
        character_id: characterId,
        created_by: user.id,
        scheduled_at: scheduledAt,
        message: message || null,
        title: title || null,
      })
      .select("id")
      .single();

    if (error) throw error;
    await fetchAll();
    fireCalendarSync({ action: "create", scheduleId: data.id, userId: user.id });
    return data.id;
  }, [fetchAll]);

  const updateScheduleTitle = useCallback(async (scheduleId: string, title: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("instance_schedules")
      .update({ title: title || null })
      .eq("id", scheduleId);
    if (error) throw error;
    await fetchAll();
    fireCalendarSync({ action: "update", scheduleId });
  }, [fetchAll]);

  const joinSchedule = useCallback(async (scheduleId: string, characterId: string, message?: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
      .from("schedule_participants")
      .insert({
        schedule_id: scheduleId,
        character_id: characterId,
        user_id: user.id,
        message: message || null,
      });

    if (error) throw error;
    fireCalendarSync({ action: "create", scheduleId, userId: user.id });
    fireCalendarSync({ action: "update", scheduleId });
  }, []);

  const leaveSchedule = useCallback(async (scheduleId: string, characterId: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase
      .from("schedule_participants")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("character_id", characterId);

    if (user) {
      fireCalendarSync({ action: "delete", scheduleId, userId: user.id });
    }
    fireCalendarSync({ action: "update", scheduleId });
  }, []);

  const removeParticipant = useCallback(async (scheduleId: string, characterId: string) => {
    const supabase = createClient();
    await supabase
      .from("schedule_participants")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("character_id", characterId);
    fireCalendarSync({ action: "update", scheduleId });
  }, []);

  const completeSchedule = useCallback(async (scheduleId: string, confirmedParticipants: { userId: string; characterId: string }[]) => {
    const supabase = createClient();

    // Get schedule info
    const { data: schedule } = await supabase
      .from("instance_schedules")
      .select("instance_id, character_id, created_by, scheduled_at")
      .eq("id", scheduleId)
      .single();

    if (!schedule) throw new Error("Schedule not found");

    // Collect unique character IDs (creator already included in confirmed list)
    const allCharIds = [...new Set([
      schedule.character_id,
      ...confirmedParticipants.map((p) => p.characterId),
    ])];

    // Use SECURITY DEFINER function to insert completions for all
    const { error: compError } = await supabase.rpc("complete_schedule_for_all", {
      p_instance_id: schedule.instance_id,
      p_completed_at: schedule.scheduled_at,
      p_character_ids: allCharIds,
    });

    if (compError) throw compError;

    // Update schedule status
    const { error: statusError } = await supabase
      .from("instance_schedules")
      .update({ status: "completed" })
      .eq("id", scheduleId);

    if (statusError) throw statusError;
    await fetchAll();
    fireCalendarSync({ action: "delete_all", scheduleId });
  }, [fetchAll]);

  const expireSchedule = useCallback(async (scheduleId: string) => {
    const supabase = createClient();
    await supabase
      .from("instance_schedules")
      .update({ status: "expired" })
      .eq("id", scheduleId);
    await fetchAll();
    fireCalendarSync({ action: "delete_all", scheduleId });
  }, [fetchAll]);

  const updateScheduleTime = useCallback(async (scheduleId: string, scheduledAt: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("instance_schedules")
      .update({ scheduled_at: scheduledAt })
      .eq("id", scheduleId);
    if (error) throw error;
    await fetchAll();
    fireCalendarSync({ action: "update", scheduleId });
  }, [fetchAll]);

  const getParticipants = useCallback(async (scheduleId: string): Promise<ScheduleParticipant[]> => {
    const supabase = createClient();

    // Fetch schedule to get creator info
    const { data: schedule } = await supabase
      .from("instance_schedules")
      .select("created_by, character_id, created_at")
      .eq("id", scheduleId)
      .single();

    // Fetch participants
    const { data } = await supabase
      .from("schedule_participants")
      .select("schedule_id, character_id, user_id, message, created_at")
      .eq("schedule_id", scheduleId);

    // Build combined list: creator first + participants
    const allParticipants = [
      ...(schedule ? [{
        schedule_id: scheduleId,
        character_id: schedule.character_id,
        user_id: schedule.created_by,
        message: null,
        created_at: schedule.created_at,
      }] : []),
      ...(data ?? []),
    ];

    if (allParticipants.length === 0) return [];

    const userIds = [...new Set(allParticipants.map((p) => p.user_id))];
    const charIds = [...new Set(allParticipants.map((p) => p.character_id))];

    const [profilesRes, charsRes] = await Promise.all([
      supabase.from("profiles").select("id, username, avatar_url").in("id", userIds),
      supabase.rpc("get_character_names", { char_ids: charIds }),
    ]);

    const profileMap = new Map((profilesRes.data ?? []).map((p: { id: string; username: string; avatar_url: string | null }) => [p.id, p]));
    const charMap = new Map(((charsRes.data ?? []) as { id: string; name: string; class: string; level: number }[]).map((c) => [c.id, c]));

    return allParticipants.map((p) => ({
      ...p,
      username: profileMap.get(p.user_id)?.username ?? "???",
      avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
      characterName: charMap.get(p.character_id)?.name ?? "???",
      characterClass: charMap.get(p.character_id)?.class ?? "???",
      characterLevel: charMap.get(p.character_id)?.level ?? 0,
    }));
  }, []);

  const addPlaceholder = useCallback(async (
    scheduleId: string,
    slotType: 'class' | 'dps_fisico' | 'dps_magico' | 'artista',
    slotLabel: string,
    slotClass: string | null,
  ) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
      .from("schedule_placeholders")
      .insert({
        schedule_id: scheduleId,
        slot_type: slotType,
        slot_label: slotLabel,
        slot_class: slotClass,
        added_by: user.id,
      });

    if (error) throw error;
  }, []);

  const removePlaceholder = useCallback(async (placeholderId: string) => {
    const supabase = createClient();
    await supabase.from("schedule_placeholders").delete().eq("id", placeholderId);
  }, []);

  const getPlaceholders = useCallback(async (scheduleId: string): Promise<SchedulePlaceholder[]> => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_schedule_placeholders", {
      p_schedule_id: scheduleId,
    });
    if (error) throw error;
    return (data ?? []) as SchedulePlaceholder[];
  }, []);

  const getEligibleFriends = useCallback(async (instanceId: number): Promise<EligibleFriend[]> => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_friends_instance_status", { p_instance_id: instanceId });
    return (data ?? []) as EligibleFriend[];
  }, []);

  const inviteFriend = useCallback(async (scheduleId: string, characterId: string, targetUserId: string) => {
    const supabase = createClient();
    // Insert as if the friend joined (creator can do this via RLS delete policy, but insert needs the user_id)
    // We need a SECURITY DEFINER function for this
    const { error } = await supabase.rpc("invite_to_schedule", {
      p_schedule_id: scheduleId,
      p_character_id: characterId,
      p_user_id: targetUserId,
    });
    if (error) throw error;
    fireCalendarSync({ action: "create", scheduleId, userId: targetUserId });
    fireCalendarSync({ action: "update", scheduleId });
  }, []);

  const getScheduledCharacterIds = useCallback(async (instanceId: number): Promise<Set<string>> => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_scheduled_character_ids", { p_instance_id: instanceId });
    return new Set((data as string[] | null) ?? []);
  }, []);

  const claimPlaceholder = useCallback(async (placeholderId: string, characterId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("claim_placeholder", {
      p_placeholder_id: placeholderId,
      p_character_id: characterId,
    });
    if (error) throw error;
    const result = data as { status: string };
    if (result.status !== "claimed") throw new Error(result.status);
  }, []);

  const unclaimPlaceholder = useCallback(async (placeholderId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("unclaim_placeholder", {
      p_placeholder_id: placeholderId,
    });
    if (error) throw error;
    const result = data as { status: string };
    if (result.status !== "released") throw new Error(result.status);
  }, []);

  const getEligibleForPlaceholder = useCallback(async (placeholderId: string): Promise<EligibleCharacter[]> => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_eligible_for_placeholder", {
      p_placeholder_id: placeholderId,
    });
    if (error) throw error;
    return (data ?? []) as EligibleCharacter[];
  }, []);

  const getScheduledCharsWithTimes = useCallback(async (instanceId: number): Promise<{ character_id: string; scheduled_at: string }[]> => {
    const supabase = createClient();
    const { data } = await supabase.rpc("get_scheduled_characters_with_times", { p_instance_id: instanceId });
    return (data ?? []) as { character_id: string; scheduled_at: string }[];
  }, []);

  return {
    schedules,
    loading,
    createSchedule,
    updateScheduleTitle,
    joinSchedule,
    leaveSchedule,
    removeParticipant,
    inviteFriend,
    getEligibleFriends,
    completeSchedule,
    expireSchedule,
    updateScheduleTime,
    getParticipants,
    addPlaceholder,
    removePlaceholder,
    getPlaceholders,
    claimPlaceholder,
    unclaimPlaceholder,
    getEligibleForPlaceholder,
    getScheduledCharacterIds,
    getScheduledCharsWithTimes,
  };
}
