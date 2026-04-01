"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateCooldownExpiry, isAvailableDay } from "@/lib/cooldown";
import type { Instance, CharacterInstance, InstanceCompletion, InstanceState } from "@/lib/types";

// Module-level cache for instances (global game data that never changes)
let cachedInstances: Instance[] | null = null;

interface UseInstancesReturn {
  instances: Instance[];
  characterInstances: CharacterInstance[];
  completions: InstanceCompletion[];
  loading: boolean;
  computeStates: (now: Date) => InstanceState[];
  markDone: (instanceId: number, completedAt?: string) => Promise<void>;
  updateCompletion: (completionId: string, completedAt: string) => Promise<void>;
  deleteCompletion: (completionId: string) => Promise<void>;
  toggleActive: (instanceId: number, isActive: boolean) => Promise<void>;
  getHistory: (instanceId: number, limit?: number) => InstanceCompletion[];
  completeParty: (instanceId: number, ownCharIds: string[], friends: {character_id: string, user_id: string}[], completedAt?: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useInstances(characterId: string | null, userId?: string | null): UseInstancesReturn {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [characterInstances, setCharacterInstances] = useState<CharacterInstance[]>([]);
  const [completions, setCompletions] = useState<InstanceCompletion[]>([]);
  const [activeInstanceIds, setActiveInstanceIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!characterId) {
      setInstances([]);
      setCharacterInstances([]);
      setCompletions([]);
      setActiveInstanceIds(new Set());
      return;
    }

    const supabase = createClient();

    const instancesPromise = cachedInstances
      ? Promise.resolve({ data: cachedInstances, error: null })
      : supabase.from("instances").select("id, name, level_required, party_min, cooldown_type, cooldown_hours, available_day, difficulty, reward, mutual_exclusion_group, level_max, wiki_url, start_map, liga_tier, liga_coins, is_solo, aliases").order("name", { ascending: true });

    const telemetryPromise = userId
      ? supabase
          .from("telemetry_sessions")
          .select("current_instance_id")
          .eq("user_id", userId)
          .not("current_instance_id", "is", null)
      : Promise.resolve({ data: [] as { current_instance_id: number | null }[], error: null });

    const [instancesRes, ciRes, completionsRes, telemetryRes] = await Promise.all([
      instancesPromise,
      supabase
        .from("character_instances")
        .select("character_id, instance_id, is_active, created_at")
        .eq("character_id", characterId),
      supabase
        .from("instance_completions")
        .select("id, character_id, instance_id, completed_at, source, telemetry_session_id")
        .eq("character_id", characterId)
        .order("completed_at", { ascending: false }),
      telemetryPromise,
    ]);

    if (instancesRes.error) console.error("Error fetching instances:", instancesRes.error);
    if (ciRes.error) console.error("Error fetching character_instances:", ciRes.error);
    if (completionsRes.error) console.error("Error fetching completions:", completionsRes.error);

    if (!cachedInstances && instancesRes.data) {
      cachedInstances = instancesRes.data;
    }

    const inProgressIds = new Set<number>(
      (telemetryRes.data ?? [])
        .map((s) => s.current_instance_id)
        .filter((id): id is number => id !== null)
    );

    setInstances(instancesRes.data ?? []);
    setCharacterInstances(ciRes.data ?? []);
    setCompletions(completionsRes.data ?? []);
    setActiveInstanceIds(inProgressIds);
  }, [characterId, userId]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchAll();
    setLoading(false);
  }, [fetchAll]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAll().then(() => {
      if (!cancelled) setLoading(false);
    });

    // Subscribe to realtime changes filtered by character_id
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchAll(), 5000);
    };

    const supabase = createClient();
    const channelBuilder = supabase
      .channel(`instances-${characterId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "instance_completions",
        filter: `character_id=eq.${characterId}`,
      }, debouncedFetch)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "character_instances",
        filter: `character_id=eq.${characterId}`,
      }, debouncedFetch);

    // Subscribe to telemetry_sessions changes so in_progress status updates in real time
    if (userId) {
      channelBuilder
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "telemetry_sessions",
          filter: `user_id=eq.${userId}`,
        }, debouncedFetch);
    }

    const channel = channelBuilder.subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchAll, userId]);

  const computeStates = useCallback(
    (now: Date): InstanceState[] => {
      const ciMap = new Map<number, CharacterInstance>();
      for (const ci of characterInstances) {
        ciMap.set(ci.instance_id, ci);
      }

      // Only show instances that have a character_instances row
      return instances.filter((instance) => ciMap.has(instance.id)).map((instance): InstanceState => {
        const ci = ciMap.get(instance.id)!;
        const isActive = ci.is_active;
        const completionCount = completions.filter((c) => c.instance_id === instance.id).length;
        const lastCompletion = completions.find((c) => c.instance_id === instance.id) ?? null;

        // in_progress takes priority: a telemetry session has this instance as current
        if (isActive && activeInstanceIds.has(instance.id)) {
          return {
            instance,
            isActive: true,
            completionCount,
            lastCompletion,
            cooldownExpiresAt: null,
            status: "in_progress",
          };
        }

        if (!isActive) {
          return {
            instance,
            isActive: false,
            completionCount,
            lastCompletion,
            cooldownExpiresAt: null,
            status: "inactive",
          };
        }

        // Find the latest completion across all instances in the same mutual exclusion group
        let latestCompletion: InstanceCompletion | null = null;

        if (instance.mutual_exclusion_group) {
          const groupInstanceIds = new Set(
            instances
              .filter((i) => i.mutual_exclusion_group === instance.mutual_exclusion_group)
              .map((i) => i.id)
          );

          for (const c of completions) {
            if (groupInstanceIds.has(c.instance_id)) {
              if (!latestCompletion || c.completed_at > latestCompletion.completed_at) {
                latestCompletion = c;
              }
            }
          }
        } else {
          latestCompletion = lastCompletion;
        }

        if (!latestCompletion) {
          // Check if the day is available even without a completion (weekly with specific day)
          const dayAvailable = isAvailableDay(instance.available_day, now);
          if (!dayAvailable) {
            return {
              instance,
              isActive: true,
              completionCount,
              lastCompletion,
              cooldownExpiresAt: null,
              status: "cooldown",
            };
          }

          return {
            instance,
            isActive: true,
            completionCount,
            lastCompletion,
            cooldownExpiresAt: null,
            status: "available",
          };
        }

        // Calculate cooldown expiry using instance's OWN cooldown type
        const cooldownExpiresAt = calculateCooldownExpiry(
          new Date(latestCompletion.completed_at),
          instance.cooldown_type,
          instance.cooldown_hours,
          instance.available_day
        );

        if (cooldownExpiresAt > now) {
          return {
            instance,
            isActive: true,
            completionCount,
            lastCompletion,
            cooldownExpiresAt,
            status: "cooldown",
          };
        }

        // Cooldown expired — check if today is an available day
        const dayAvailable = isAvailableDay(instance.available_day, now);
        if (!dayAvailable) {
          return {
            instance,
            isActive: true,
            completionCount,
            lastCompletion,
            cooldownExpiresAt,
            status: "cooldown",
          };
        }

        return {
          instance,
          isActive: true,
          completionCount,
          lastCompletion,
          cooldownExpiresAt,
          status: "available",
        };
      });
    },
    [instances, characterInstances, completions, activeInstanceIds]
  );

  const markDone = useCallback(
    async (instanceId: number, completedAt?: string) => {
      if (!characterId) return;
      const supabase = createClient();

      const insertData: { character_id: string; instance_id: number; completed_at?: string } = {
        character_id: characterId,
        instance_id: instanceId,
      };
      if (completedAt) insertData.completed_at = completedAt;

      const { data, error } = await supabase
        .from("instance_completions")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error("Error marking instance done:", error);
        throw error;
      }

      setCompletions((prev) => [data, ...prev].sort((a, b) =>
        b.completed_at.localeCompare(a.completed_at)
      ));
    },
    [characterId]
  );

  const updateCompletion = useCallback(async (completionId: string, completedAt: string) => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("instance_completions")
      .update({ completed_at: completedAt })
      .eq("id", completionId)
      .select()
      .single();

    if (error) {
      console.error("Error updating completion:", error);
      throw error;
    }

    setCompletions((prev) =>
      prev.map((c) => c.id === completionId ? data : c)
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
    );
  }, []);

  const deleteCompletion = useCallback(async (completionId: string) => {
    const supabase = createClient();

    const { error } = await supabase
      .from("instance_completions")
      .delete()
      .eq("id", completionId);

    if (error) {
      console.error("Error deleting completion:", error);
      throw error;
    }

    setCompletions((prev) => prev.filter((c) => c.id !== completionId));
  }, []);

  const toggleActive = useCallback(
    async (instanceId: number, isActive: boolean) => {
      if (!characterId) return;
      const supabase = createClient();

      const { error } = await supabase
        .from("character_instances")
        .update({ is_active: isActive })
        .eq("character_id", characterId)
        .eq("instance_id", instanceId);

      if (error) {
        console.error("Error toggling instance active:", error);
        throw error;
      }

      setCharacterInstances((prev) =>
        prev.map((ci) =>
          ci.instance_id === instanceId ? { ...ci, is_active: isActive } : ci
        )
      );
    },
    [characterId]
  );

  const getHistory = useCallback(
    (instanceId: number, limit = 10): InstanceCompletion[] => {
      return completions
        .filter((c) => c.instance_id === instanceId)
        .slice(0, limit);
    },
    [completions]
  );

  const completeParty = useCallback(
    async (instanceId: number, ownCharIds: string[], friends: {character_id: string, user_id: string}[], completedAt?: string) => {
      const supabase = createClient();
      const ts = completedAt ?? new Date().toISOString();
      const { error } = await supabase.rpc("complete_instance_party", {
        p_instance_id: instanceId,
        p_completed_at: ts,
        p_own_character_ids: ownCharIds,
        p_friends: friends,
      });
      if (error) throw error;

      // Optimistic update: add completions for own characters immediately
      if (characterId && ownCharIds.includes(characterId)) {
        setCompletions((prev) => [
          { id: crypto.randomUUID(), character_id: characterId, instance_id: instanceId, completed_at: ts, source: 'manual' as const, telemetry_session_id: null },
          ...prev,
        ]);
      }

      // Also refetch in the background to get the real data
      fetchAll();
    },
    [characterId, fetchAll]
  );

  return {
    instances,
    characterInstances,
    completions,
    loading,
    computeStates,
    markDone,
    updateCompletion,
    deleteCompletion,
    toggleActive,
    getHistory,
    completeParty,
    refetch,
  };
}
