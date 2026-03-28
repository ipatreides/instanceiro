"use client";

import { useMemo } from "react";
import type { Mvp, TrackerMvpKillData } from "@/lib/types";

interface MvpTrackerProps {
  mvps: Mvp[];
  kills: Record<string, TrackerMvpKillData>;
  serverId: number;
  onRegisterKill: (mvpId: string, serverId: number) => void;
}

export function MvpTracker({ mvps, kills, serverId, onRegisterKill }: MvpTrackerProps) {
  const now = useMemo(() => new Date(), []);

  const states = useMemo(() => {
    return mvps.map((mvp) => {
      const kill = kills[String(mvp.id)];
      let status: "alive" | "cooldown" = "alive";
      let spawnAt: Date | null = null;

      if (kill) {
        const killedAt = new Date(kill.killed_at);
        spawnAt = new Date(killedAt.getTime() + mvp.respawn_ms);
        if (spawnAt > now) {
          status = "cooldown";
        }
      }

      return { mvp, status, spawnAt, kill };
    });
  }, [mvps, kills, now]);

  return (
    <div className="space-y-2">
      {states.map(({ mvp, status, spawnAt }) => (
        <div
          key={mvp.id}
          className={`flex items-center justify-between p-3 rounded-md border ${
            status === "cooldown"
              ? "border-status-cooldown bg-surface/50"
              : "border-border bg-surface hover:bg-card-hover-bg"
          }`}
        >
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-text-primary truncate block">
              {mvp.name}
            </span>
            <span className="text-xs text-text-secondary">{mvp.map_name}</span>
            {status === "cooldown" && spawnAt && (
              <span className="text-xs text-status-cooldown-text ml-2">
                Spawn ~{formatTime(spawnAt)}
              </span>
            )}
          </div>
          <button
            onClick={() => onRegisterKill(String(mvp.id), serverId)}
            className="px-3 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            Morreu
          </button>
        </div>
      ))}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
