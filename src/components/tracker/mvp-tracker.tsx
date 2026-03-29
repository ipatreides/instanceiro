"use client";

import { useMemo, useState, useEffect } from "react";
import type { Mvp, TrackerMvpKillData } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";

interface MvpTrackerProps {
  mvps: Mvp[];
  kills: Record<string, TrackerMvpKillData>;
  serverId: number;
  onRegisterKill: (mvpId: string, serverId: number) => void;
}

type MvpStatus = "alive" | "spawn_window" | "cooldown";

interface MvpRow {
  mvp: Mvp;
  status: MvpStatus;
  spawnAt: Date | null;
  spawnEndAt: Date | null;
  killedAt: Date | null;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "agora";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatWindow(ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `±${h}h ${m}min`;
  if (h > 0) return `±${h}h`;
  return `±${m}min`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function matchesMvpSearch(mvp: Mvp, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return mvp.name.toLowerCase().includes(q) || mvp.map_name.toLowerCase().includes(q);
}

// Live timer cell — ticks every second
function LiveTimer({ spawnAt, spawnEndAt, status }: { spawnAt: Date | null; spawnEndAt: Date | null; status: MvpStatus }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (status === "alive") return null;

  if (status === "spawn_window" && spawnAt && spawnEndAt) {
    const remaining = spawnEndAt.getTime() - now;
    return (
      <div className="flex flex-col items-end">
        <span className="text-xs font-bold tabular-nums text-status-available-text">
          {formatTime(spawnAt)} ~ {formatTime(spawnEndAt)}
        </span>
        <span className="text-[10px] tabular-nums text-text-secondary">
          Janela fecha em {formatCountdown(remaining)}
        </span>
      </div>
    );
  }

  if (status === "cooldown" && spawnAt) {
    const remaining = spawnAt.getTime() - now;
    const isSoon = remaining <= 5 * 60 * 1000;
    const colorClass = isSoon ? "text-status-soon-text" : "text-status-cooldown-text";
    return (
      <div className="flex flex-col items-end">
        <span className={`text-sm font-bold tabular-nums ${colorClass}`}>
          {formatCountdown(remaining)}
        </span>
        <span className="text-[10px] tabular-nums text-text-secondary">
          Spawn ~{formatTime(spawnAt)}
        </span>
      </div>
    );
  }

  return null;
}

export function MvpTracker({ mvps, kills, serverId, onRegisterKill }: MvpTrackerProps) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  // 10-second tick to recompute statuses (spawn windows can expire)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const now = Date.now();
    return mvps.map((mvp): MvpRow => {
      const kill = kills[String(mvp.id)];
      if (!kill) return { mvp, status: "alive", spawnAt: null, spawnEndAt: null, killedAt: null };

      const killedAt = new Date(kill.killed_at);
      const spawnAt = new Date(killedAt.getTime() + mvp.respawn_ms);
      const spawnEndAt = new Date(spawnAt.getTime() + mvp.delay_ms);

      let status: MvpStatus;
      if (now < spawnAt.getTime()) {
        status = "cooldown";
      } else if (now < spawnEndAt.getTime()) {
        status = "spawn_window";
      } else {
        status = "alive";
      }

      return { mvp, status, spawnAt, spawnEndAt, killedAt };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mvps, kills, tick]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    return rows.filter((r) => matchesMvpSearch(r.mvp, search));
  }, [rows, search]);

  // Sort: cooldown first (by time remaining), then spawn_window, then alive
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const order: MvpStatus[] = ["spawn_window", "cooldown", "alive"];
      const diff = order.indexOf(a.status) - order.indexOf(b.status);
      if (diff !== 0) return diff;
      if (a.status === "cooldown" && b.status === "cooldown" && a.spawnAt && b.spawnAt) {
        return a.spawnAt.getTime() - b.spawnAt.getTime();
      }
      return a.mvp.name.localeCompare(b.mvp.name, "pt-BR");
    });
  }, [filtered]);

  const tracked = sorted.filter((r) => r.status !== "alive");
  const untracked = sorted.filter((r) => r.status === "alive");

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar MVP ou mapa…"
          className="w-full bg-surface border border-border rounded-[var(--radius-md)] pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-focus-ring transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Active timers */}
      {tracked.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Rastreando
            </h3>
            <span className="text-xs text-text-secondary">{tracked.length}</span>
          </div>
          {tracked.map(({ mvp, status, spawnAt, spawnEndAt }) => {
            const borderColor =
              status === "spawn_window"
                ? "var(--status-available)"
                : "var(--status-cooldown)";

            return (
              <div
                key={mvp.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] bg-surface border border-border"
                style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{mvp.name}</span>
                    {status === "spawn_window" && (
                      <StatusBadge status="soon" label="Janela de spawn" />
                    )}
                    {status === "cooldown" && spawnAt && (() => {
                      const remaining = spawnAt.getTime() - Date.now();
                      return remaining <= 5 * 60 * 1000 ? (
                        <StatusBadge status="soon" label="Quase lá" />
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-text-secondary">{mvp.map_name}</span>
                    {spawnAt && (
                      <span className="text-xs text-text-secondary">
                        {formatWindow(mvp.delay_ms)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <LiveTimer spawnAt={spawnAt} spawnEndAt={spawnEndAt} status={status} />
                  <button
                    onClick={() => onRegisterKill(String(mvp.id), serverId)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors"
                  >
                    Morreu
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Untracked MVPs */}
      {(search || showAll || untracked.length === 0) && (
        <div className="space-y-1.5">
          {untracked.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                {search ? "MVPs" : "Todos os MVPs"}
              </h3>
              <span className="text-xs text-text-secondary">{untracked.length}</span>
            </div>
          )}
          {untracked.map(({ mvp }) => (
            <div
              key={mvp.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] bg-surface border border-border hover:bg-card-hover-bg transition-colors"
            >
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-text-primary truncate">{mvp.name}</span>
                <span className="text-xs text-text-secondary">{mvp.map_name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status="available" label="Vivo" />
                <button
                  onClick={() => onRegisterKill(String(mvp.id), serverId)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors"
                >
                  Morreu
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Show all toggle — only when not searching */}
      {!search && untracked.length > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2 rounded-[var(--radius-md)] border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
        >
          Mostrar todos os {untracked.length} MVPs
        </button>
      )}
      {!search && showAll && untracked.length > 0 && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full py-2 rounded-[var(--radius-md)] border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
        >
          Ocultar MVPs disponíveis
        </button>
      )}

      {sorted.length === 0 && (
        <p className="text-text-secondary text-sm text-center py-8">
          {search ? "Nenhum MVP encontrado." : "Nenhum MVP disponível."}
        </p>
      )}
    </div>
  );
}
