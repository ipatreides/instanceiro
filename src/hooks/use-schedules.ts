"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InstanceSchedule, ScheduleParticipant } from "@/lib/types";

interface UseSchedulesReturn {
  schedules: InstanceSchedule[];
  loading: boolean;
  createSchedule: (instanceId: number, characterId: string, scheduledAt: string, message?: string) => Promise<void>;
  joinSchedule: (scheduleId: string, characterId: string, message?: string) => Promise<void>;
  leaveSchedule: (scheduleId: string) => Promise<void>;
  completeSchedule: (scheduleId: string, confirmedParticipants: { userId: string; characterId: string }[]) => Promise<void>;
  expireSchedule: (scheduleId: string) => Promise<void>;
  getParticipants: (scheduleId: string) => Promise<ScheduleParticipant[]>;
}

export function useSchedules(): UseSchedulesReturn {
  const [schedules, setSchedules] = useState<InstanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();

    // Fetch open schedules
    const { data } = await supabase
      .from("instance_schedules")
      .select("*")
      .in("status", ["open"])
      .order("scheduled_at", { ascending: true });

    if (!data || data.length === 0) {
      setSchedules([]);
      return;
    }

    // Enrich with instance data
    const instanceIds = [...new Set(data.map((s) => s.instance_id))];
    const creatorIds = [...new Set(data.map((s) => s.created_by))];

    const [instancesRes, profilesRes, participantsRes] = await Promise.all([
      supabase.from("instances").select("id, name, start_map, liga_tier").in("id", instanceIds),
      supabase.from("profiles").select("id, username, avatar_url").in("id", creatorIds),
      supabase.from("schedule_participants").select("schedule_id").in("schedule_id", data.map((s) => s.id)),
    ]);

    const instanceMap = new Map((instancesRes.data ?? []).map((i: { id: number; name: string; start_map: string | null; liga_tier: string | null }) => [i.id, i]));
    const profileMap = new Map((profilesRes.data ?? []).map((p: { id: string; username: string; avatar_url: string | null }) => [p.id, p]));

    // Count participants per schedule
    const countMap = new Map<string, number>();
    for (const p of (participantsRes.data ?? [])) {
      countMap.set(p.schedule_id, (countMap.get(p.schedule_id) ?? 0) + 1);
    }

    const enriched: InstanceSchedule[] = data.map((s) => {
      const inst = instanceMap.get(s.instance_id);
      const creator = profileMap.get(s.created_by);
      return {
        ...s,
        instanceName: inst?.name ?? "???",
        instanceStartMap: inst?.start_map ?? null,
        instanceLigaTier: inst?.liga_tier ?? null,
        creatorUsername: creator?.username ?? "???",
        creatorAvatar: creator?.avatar_url ?? null,
        participantCount: (countMap.get(s.id) ?? 0) + 1, // +1 for creator
      };
    });

    setSchedules(enriched);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(() => { if (!cancelled) setLoading(false); });

    const supabase = createClient();
    const channel = supabase
      .channel("schedules-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "instance_schedules" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_participants" }, () => fetchAll())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  const createSchedule = useCallback(async (instanceId: number, characterId: string, scheduledAt: string, message?: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
      .from("instance_schedules")
      .insert({
        instance_id: instanceId,
        character_id: characterId,
        created_by: user.id,
        scheduled_at: scheduledAt,
        message: message || null,
      });

    if (error) throw error;
    await fetchAll();
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
  }, []);

  const leaveSchedule = useCallback(async (scheduleId: string) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("schedule_participants")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("user_id", user.id);
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

    // Collect all character IDs (creator + confirmed participants)
    const allCharIds = [
      schedule.character_id,
      ...confirmedParticipants.map((p) => p.characterId),
    ];

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
  }, [fetchAll]);

  const expireSchedule = useCallback(async (scheduleId: string) => {
    const supabase = createClient();
    await supabase
      .from("instance_schedules")
      .update({ status: "expired" })
      .eq("id", scheduleId);
    await fetchAll();
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
      .select("*")
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
    const charMap = new Map(((charsRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c]));

    return allParticipants.map((p) => ({
      ...p,
      username: profileMap.get(p.user_id)?.username ?? "???",
      avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
      characterName: charMap.get(p.character_id)?.name ?? "???",
    }));
  }, []);

  return {
    schedules,
    loading,
    createSchedule,
    joinSchedule,
    leaveSchedule,
    completeSchedule,
    expireSchedule,
    getParticipants,
  };
}
