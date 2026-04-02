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
    partyMemberIds: string[];
  }) => Promise<void>;
  editKill: (killId: string, data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    editedBy: string;
  }) => Promise<void>;
  deleteKill: (killId: string) => Promise<void>;
  acceptLootSuggestions: (killId: string) => Promise<void>;
  rejectLootSuggestion: (lootId: string) => Promise<void>;
  confirmKill: (killId: string, characterId: string) => Promise<void>;
  correctKill: (killId: string, data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    editedBy: string;
  }) => Promise<void>;
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

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchKills();
  }, [fetchKills]);

  // Realtime subscription — incremental updates
  useEffect(() => {
    if (!groupId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`mvp-kills-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mvp_kills",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            // Refetch to get enriched data (character names from JOINs, kill count)
            fetchKills();
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old;
            setActiveKills((prev) => prev.filter((k) => k.kill_id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, fetchKills]);

  const registerKill = useCallback(async (data: {
    mvpId: number;
    groupId: string | null;
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    registeredBy: string;
    loots: { itemId: number; itemName: string }[];
    partyMemberIds: string[];
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

    if (data.partyMemberIds.length > 0) {
      await supabase.from("mvp_kill_party").insert(
        data.partyMemberIds.map((cId) => ({ kill_id: kill.id, character_id: cId }))
      );
    }

    // Clean sightings for this MVP in this group
    if (data.groupId) {
      await supabase
        .from("mvp_sightings")
        .delete()
        .eq("mvp_id", data.mvpId)
        .eq("group_id", data.groupId);
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

  const acceptLootSuggestions = useCallback(async (killId: string) => {
    const supabase = createClient();
    await supabase
      .from("mvp_kill_loots")
      .update({ accepted: true })
      .eq("kill_id", killId)
      .eq("source", "telemetry")
      .is("accepted", null);
    await fetchKills();
  }, [fetchKills]);

  const rejectLootSuggestion = useCallback(async (lootId: string) => {
    const supabase = createClient();
    await supabase
      .from("mvp_kill_loots")
      .update({ accepted: false })
      .eq("id", lootId);
    await fetchKills();
  }, [fetchKills]);

  const confirmKill = useCallback(async (killId: string, characterId: string) => {
    const supabase = createClient();
    await supabase.from("mvp_kills").update({
      validation_status: 'confirmed',
      validated_by: characterId,
      validated_at: new Date().toISOString(),
    }).eq("id", killId);
    await fetchKills();
  }, [fetchKills]);

  const correctKill = useCallback(async (killId: string, data: {
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
      validation_status: 'corrected',
      validated_by: data.editedBy,
      validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", killId);
    await fetchKills();
  }, [fetchKills]);

  return { activeKills, loading, refetch: fetchKills, registerKill, editKill, deleteKill, acceptLootSuggestions, rejectLootSuggestion, confirmKill, correctKill };
}
