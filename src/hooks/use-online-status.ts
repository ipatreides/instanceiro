"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useOnlineStatus() {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

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
        supabase.removeChannel(channel);
      };
    });
  }, []);

  const isOnline = (userId: string) => onlineUserIds.has(userId);

  return { onlineUserIds, isOnline };
}
