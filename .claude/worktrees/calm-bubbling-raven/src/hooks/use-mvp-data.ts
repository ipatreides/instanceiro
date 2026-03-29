"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Mvp, MvpMapMeta, MvpDrop } from "@/lib/types";

// Module-level caches keyed by server_id
const mvpCache = new Map<number, Mvp[]>();
const mapMetaCache = new Map<string, MvpMapMeta>();
let dropsCache: MvpDrop[] | null = null;

interface UseMvpDataReturn {
  mvps: Mvp[];
  mapMeta: Map<string, MvpMapMeta>;
  drops: MvpDrop[];
  loading: boolean;
}

export function useMvpData(serverId: number | null): UseMvpDataReturn {
  const [mvps, setMvps] = useState<Mvp[]>([]);
  const [drops, setDrops] = useState<MvpDrop[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!serverId) return;
    const supabase = createClient();

    // Fetch MVPs (cached per server)
    let serverMvps = mvpCache.get(serverId);
    if (!serverMvps) {
      const { data } = await supabase
        .from("mvps")
        .select("id, server_id, monster_id, name, map_name, respawn_ms, delay_ms, level, hp")
        .eq("server_id", serverId)
        .order("name");
      serverMvps = (data ?? []) as Mvp[];
      mvpCache.set(serverId, serverMvps);
    }

    // Fetch map meta (cached globally)
    if (mapMetaCache.size === 0) {
      const { data } = await supabase
        .from("mvp_map_meta")
        .select("map_name, width, height");
      for (const m of (data ?? [])) {
        mapMetaCache.set(m.map_name, m as MvpMapMeta);
      }
    }

    // Fetch drops (cached globally — same for all servers)
    if (!dropsCache) {
      const { data } = await supabase
        .from("mvp_drops")
        .select("id, mvp_monster_id, item_id, item_name, drop_rate");
      dropsCache = (data ?? []) as MvpDrop[];
    }

    setMvps(serverMvps);
    setDrops(dropsCache);
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { mvps, mapMeta: mapMetaCache, drops, loading };
}
