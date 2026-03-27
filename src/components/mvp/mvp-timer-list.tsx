"use client";

import { useMemo } from "react";
import type { Mvp, MvpActiveKill } from "@/lib/types";
import { MvpTimerRow } from "./mvp-timer-row";

interface MvpTimerListProps {
  mvps: Mvp[];
  activeKills: MvpActiveKill[];
  search: string;
  loading: boolean;
  onKillNow?: (mvp: Mvp) => void;
  onKillSetTime?: (mvp: Mvp) => void;
  onEdit?: (mvp: Mvp, kill: MvpActiveKill) => void;
}

export function MvpTimerList({ mvps, activeKills, search, loading, onKillNow, onKillSetTime, onEdit }: MvpTimerListProps) {
  const killMap = useMemo(() => {
    const map = new Map<number, MvpActiveKill>();
    for (const k of activeKills) map.set(k.mvp_id, k);
    return map;
  }, [activeKills]);

  const q = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    return mvps.filter((m) => {
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.map_name.toLowerCase().includes(q);
    });
  }, [mvps, q]);

  // Split into active (has kill, not expired) and inactive
  const now = Date.now();
  const active: { mvp: Mvp; kill: MvpActiveKill }[] = [];
  const inactive: Mvp[] = [];

  for (const mvp of filtered) {
    const kill = killMap.get(mvp.id);
    if (kill) {
      const spawnStart = new Date(kill.killed_at).getTime() + mvp.respawn_ms;
      const cardExpiry = spawnStart + 30 * 60 * 1000;
      if (now < cardExpiry) {
        active.push({ mvp, kill });
        continue;
      }
    }
    inactive.push(mvp);
  }

  // Sort active by nearest spawn
  active.sort((a, b) => {
    const aSpawn = new Date(a.kill.killed_at).getTime() + a.mvp.respawn_ms;
    const bSpawn = new Date(b.kill.killed_at).getTime() + b.mvp.respawn_ms;
    return aSpawn - bSpawn;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Active timers */}
      {active.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-secondary font-semibold">ATIVOS ({active.length})</p>
          <div className="flex flex-col gap-1">
            {active.map(({ mvp, kill }) => (
              <MvpTimerRow key={mvp.id} mvp={mvp} kill={kill} onEdit={onEdit} />
            ))}
          </div>
        </div>
      )}

      {/* Inactive MVPs */}
      {inactive.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-text-secondary font-semibold">SEM INFO ({inactive.length})</p>
          <div className="flex flex-wrap gap-1">
            {inactive.map((mvp) => (
              <div key={mvp.id} className="inline-flex items-center gap-0.5">
                <button
                  onClick={() => onKillNow?.(mvp)}
                  className="pl-2 py-1 text-[10px] bg-surface border border-border border-r-0 rounded-l text-text-secondary hover:border-primary hover:text-text-primary transition-colors cursor-pointer"
                  title="Matei agora"
                >
                  ⚔
                </button>
                <button
                  onClick={() => onKillSetTime?.(mvp)}
                  className="pr-2 py-1 text-[10px] bg-surface border border-border rounded-r text-text-secondary hover:border-primary hover:text-text-primary transition-colors cursor-pointer"
                  title="Informar horário"
                >
                  {mvp.name} ({mvp.map_name})
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-text-secondary italic text-center py-4">
          {q ? "Nenhum MVP encontrado." : "Nenhum MVP cadastrado."}
        </p>
      )}
    </div>
  );
}
