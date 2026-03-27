"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpActiveKill } from "@/lib/types";

interface UseMvpTimersReturn {
  activeKills: MvpActiveKill[];
  loading: boolean;
  refetch: () => Promise<void>;
  registerKill: (data: {
    mvpId: number;
    groupId: string | null;
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    registeredBy: string;
    loots: { itemId: number; itemName: string }[];
  }) => Promise<void>;
  editKill: (killId: string, data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    editedBy: string;
  }) => Promise<void>;
  deleteKill: (killId: string) => Promise<void>;
}

export function useMvpTimers(groupId: string | null, serverId: number | null): UseMvpTimersReturn {
  const [activeKills, setActiveKills] = useState<MvpActiveKill[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKills = useCallback(async () => {
    if (!serverId) {
      setActiveKills([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_group_active_kills", {
      p_group_id: groupId,
      p_server_id: serverId,
    });

    if (error) {
      console.error("Error fetching active kills:", error);
      setActiveKills([]);
    } else {
      setActiveKills((data ?? []) as MvpActiveKill[]);
    }
    setLoading(false);
  }, [groupId, serverId]);

  useEffect(() => {
    setLoading(true);
    fetchKills();

    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchKills(), 5000);
    };

    const channelName = groupId ? `mvp-kills-${groupId}` : `mvp-kills-solo`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "mvp_kills" }, debouncedFetch)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchKills, groupId]);

  const registerKill = useCallback(async (data: {
    mvpId: number;
    groupId: string | null;
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    registeredBy: string;
    loots: { itemId: number; itemName: string }[];
  }) => {
    const supabase = createClient();
    const { data: kill, error } = await supabase
      .from("mvp_kills")
      .insert({
        mvp_id: data.mvpId,
        group_id: data.groupId,
        killed_at: data.killedAt,
        tomb_x: data.tombX,
        tomb_y: data.tombY,
        killer_character_id: data.killerCharacterId,
        registered_by: data.registeredBy,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (data.loots.length > 0) {
      await supabase.from("mvp_kill_loots").insert(
        data.loots.map((l) => ({
          kill_id: kill.id,
          item_id: l.itemId,
          item_name: l.itemName,
        }))
      );
    }

    await fetchKills();
  }, [fetchKills]);

  const editKill = useCallback(async (killId: string, data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    editedBy: string;
  }) => {
    const supabase = createClient();
    await supabase.from("mvp_kills").update({
      killed_at: data.killedAt,
      tomb_x: data.tombX,
      tomb_y: data.tombY,
      killer_character_id: data.killerCharacterId,
      edited_by: data.editedBy,
      updated_at: new Date().toISOString(),
    }).eq("id", killId);
    await fetchKills();
  }, [fetchKills]);

  const deleteKill = useCallback(async (killId: string) => {
    const supabase = createClient();
    await supabase.from("mvp_kills").delete().eq("id", killId);
    await fetchKills();
  }, [fetchKills]);

  return { activeKills, loading, refetch: fetchKills, registerKill, editKill, deleteKill };
}
