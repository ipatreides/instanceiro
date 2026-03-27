"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpActiveKill } from "@/lib/types";

interface UseMvpTimersReturn {
  activeKills: MvpActiveKill[];
  loading: boolean;
  refetch: () => Promise<void>;
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

  return { activeKills, loading, refetch: fetchKills };
}
