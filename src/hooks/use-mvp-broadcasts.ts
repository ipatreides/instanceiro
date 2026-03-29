"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface MvpBroadcast {
  cooldown_group: string;
  event_type: string;
  mvp_name: string | null;
  expires_at: string;
}

export function useMvpBroadcasts(groupId: string | null) {
  const [broadcasts, setBroadcasts] = useState<MvpBroadcast[]>([]);

  useEffect(() => {
    if (!groupId) return;

    const supabase = createClient();

    async function fetch() {
      const { data } = await supabase
        .from("mvp_broadcast_events")
        .select("cooldown_group, event_type, mvp_name, expires_at")
        .eq("group_id", groupId!)
        .gt("expires_at", new Date().toISOString());

      setBroadcasts(data ?? []);
    }

    fetch();

    const channel = supabase
      .channel("mvp-broadcasts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mvp_broadcast_events",
          filter: `group_id=eq.${groupId}`,
        },
        () => fetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  return broadcasts;
}
