"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface KillStat {
  id: string;
  mvp_id: number;
  killed_at: string;
  killer_character_id: string | null;
  registered_by: string;
  mvp_name: string;
  killer_name: string | null;
  registered_by_name: string;
}

interface MvpGroupStatsProps {
  groupId: string | null;
}

type Period = "24h" | "7d" | "30d" | "all";

const PERIOD_MS: Record<Period, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "all": Infinity,
};

export function MvpGroupStats({ groupId }: MvpGroupStatsProps) {
  const [kills, setKills] = useState<KillStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("7d");

  useEffect(() => {
    if (!groupId) { setKills([]); setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    supabase.rpc("get_group_kill_stats", { p_group_id: groupId }).then(({ data }) => {
      setKills((data ?? []) as KillStat[]);
      setLoading(false);
    });
  }, [groupId]);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - PERIOD_MS[period];
    return kills.filter((k) => k.killed_at && new Date(k.killed_at).getTime() > cutoff);
  }, [kills, period]);

  // Stats computations
  const totalKills = filtered.length;
  const killsWithKiller = filtered.filter((k) => k.killer_character_id).length;
  const killsInfoOnly = totalKills - killsWithKiller;

  // Per user (killer)
  const killerRanking = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const k of filtered) {
      if (!k.killer_name) continue;
      const existing = map.get(k.killer_name);
      if (existing) existing.count++;
      else map.set(k.killer_name, { name: k.killer_name, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Per MVP
  const mvpRanking = useMemo(() => {
    const map = new Map<string, { name: string; count: number; topKiller: string | null }>();
    for (const k of filtered) {
      const existing = map.get(k.mvp_name);
      if (existing) {
        existing.count++;
      } else {
        map.set(k.mvp_name, { name: k.mvp_name, count: 1, topKiller: k.killer_name });
      }
    }
    // Recalculate top killer per MVP
    for (const [mvpName, stat] of map) {
      const mvpKills = filtered.filter((k) => k.mvp_name === mvpName && k.killer_name);
      const killerMap = new Map<string, number>();
      for (const k of mvpKills) {
        killerMap.set(k.killer_name!, (killerMap.get(k.killer_name!) ?? 0) + 1);
      }
      let topKiller: string | null = null;
      let topCount = 0;
      for (const [name, count] of killerMap) {
        if (count > topCount) { topKiller = name; topCount = count; }
      }
      stat.topKiller = topKiller;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!groupId) {
    return <p className="text-sm text-text-secondary italic text-center py-4">Crie um grupo para ver estatísticas.</p>;
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      {/* Period selector */}
      <div className="flex gap-1">
        {(["24h", "7d", "30d", "all"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 text-xs rounded-md cursor-pointer transition-colors ${
              period === p
                ? "bg-primary text-white"
                : "bg-surface border border-border text-text-secondary hover:text-text-primary"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface border border-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-text-primary">{totalKills}</div>
          <div className="text-[10px] text-text-secondary">Total Kills</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-status-available-text">{killsWithKiller}</div>
          <div className="text-[10px] text-text-secondary">Com Killer</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-text-secondary">{killsInfoOnly}</div>
          <div className="text-[10px] text-text-secondary">Só Info</div>
        </div>
      </div>

      {/* Killer ranking */}
      {killerRanking.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary font-semibold uppercase mb-2">Ranking de Killers</h3>
          <div className="flex flex-col gap-1">
            {killerRanking.map((k, i) => (
              <div key={k.name} className="flex items-center gap-2">
                <span className="text-[10px] text-text-secondary w-4 text-right">{i + 1}.</span>
                <span className="text-xs text-text-primary flex-1">{k.name}</span>
                <div className="flex items-center gap-1">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${Math.max(8, (k.count / (killerRanking[0]?.count ?? 1)) * 80)}px` }}
                  />
                  <span className="text-[10px] text-text-secondary tabular-nums w-6 text-right">{k.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MVP ranking */}
      {mvpRanking.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs text-text-secondary font-semibold uppercase mb-2">MVPs Mais Caçados</h3>
          <div className="flex flex-col gap-1">
            {mvpRanking.slice(0, 10).map((m, i) => (
              <div key={m.name} className="flex items-center gap-2">
                <span className="text-[10px] text-text-secondary w-4 text-right">{i + 1}.</span>
                <span className="text-xs text-text-primary flex-1 truncate">{m.name}</span>
                {m.topKiller && (
                  <span className="text-[9px] text-primary-secondary truncate max-w-[80px]">{m.topKiller}</span>
                )}
                <span className="text-[10px] text-text-secondary tabular-nums">×{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalKills === 0 && (
        <p className="text-sm text-text-secondary italic text-center py-4">
          Nenhuma kill registrada neste período.
        </p>
      )}
    </div>
  );
}
