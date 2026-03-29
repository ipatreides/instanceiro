"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const HEARTBEAT_INTERVAL = 300_000; // Update last_seen_at every 5min

export function useOnlineStatus() {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [lastSeenMap, setLastSeenMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const supabase = createClient();
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      // Update last_seen_at immediately and periodically
      const updateLastSeen = () => {
        supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
      };
      updateLastSeen();
      heartbeatTimer = setInterval(updateLastSeen, HEARTBEAT_INTERVAL);

      const channel = supabase.channel("online-users", {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const ids = new Set<string>();
          for (const key of Object.keys(state)) {
            ids.add(key);
          }
          setOnlineUserIds(ids);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ user_id: user.id });
          }
        });

      return () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        supabase.removeChannel(channel);
      };
    });

    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };
  }, []);

  const fetchLastSeen = useCallback(async (userIds: string[]) => {
    if (!userIds.length) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, last_seen_at")
      .in("id", userIds)
      .not("last_seen_at", "is", null);

    if (data) {
      setLastSeenMap((prev) => {
        const next = new Map(prev);
        for (const p of data) {
          if (p.last_seen_at) next.set(p.id, p.last_seen_at);
        }
        return next;
      });
    }
  }, []);

  const isOnline = (userId: string) => onlineUserIds.has(userId);

  const getLastSeen = (userId: string): string | null => lastSeenMap.get(userId) ?? null;

  return { onlineUserIds, isOnline, getLastSeen, fetchLastSeen };
}
