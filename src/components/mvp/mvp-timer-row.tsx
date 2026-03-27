"use client";

import { useState, useEffect } from "react";
import type { Mvp, MvpActiveKill, MvpTimerStatus } from "@/lib/types";

interface MvpTimerRowProps {
  mvp: Mvp;
  kill: MvpActiveKill | null;
}

function computeStatus(kill: MvpActiveKill, mvp: Mvp, now: number): { status: MvpTimerStatus; remainingMs: number } {
  const killedAt = new Date(kill.killed_at).getTime();
  const spawnStart = killedAt + mvp.respawn_ms;
  const spawnEnd = spawnStart + mvp.delay_ms;
  const tombExpiry = spawnStart + 10 * 60 * 1000;
  const cardExpiry = spawnStart + 30 * 60 * 1000;

  if (now < spawnStart) return { status: "cooldown", remainingMs: spawnStart - now };
  if (now < spawnEnd) return { status: "spawn_window", remainingMs: 0 };
  if (now < tombExpiry) return { status: "probably_alive", remainingMs: now - spawnEnd };
  if (now < cardExpiry) return { status: "tomb_expired", remainingMs: now - spawnEnd };
  return { status: "inactive", remainingMs: 0 };
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<MvpTimerStatus, string> = {
  cooldown: "var(--status-cooldown)",
  spawn_window: "var(--status-available)",
  probably_alive: "var(--status-available)",
  tomb_expired: "var(--status-available)",
  inactive: "var(--border)",
};

const STATUS_TEXT_COLORS: Record<MvpTimerStatus, string> = {
  cooldown: "var(--status-cooldown-text)",
  spawn_window: "var(--status-available-text)",
  probably_alive: "var(--status-available-text)",
  tomb_expired: "var(--text-secondary)",
  inactive: "var(--text-secondary)",
};

export function MvpTimerRow({ mvp, kill }: MvpTimerRowProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!kill) return null;

  const { status, remainingMs } = computeStatus(kill, mvp, now);
  if (status === "inactive") return null;

  const borderColor = STATUS_COLORS[status];
  const textColor = STATUS_TEXT_COLORS[status];
  const showTomb = kill.tomb_x != null && kill.tomb_y != null && status !== "tomb_expired";
  const isCountUp = status === "probably_alive" || status === "tomb_expired";

  let countdownColor = textColor;
  if (status === "cooldown") {
    if (remainingMs < 5 * 60 * 1000) countdownColor = "var(--status-available-text)";
    else if (remainingMs < 30 * 60 * 1000) countdownColor = "var(--status-soon-text)";
  }

  const statusLabel = status === "cooldown" ? "" : status === "spawn_window" ? "Pode nascer" : "Provavelmente vivo";
  const displayName = `${mvp.name} (${mvp.map_name})`;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary font-medium truncate">{displayName}</span>
          {kill.kill_count > 1 && (
            <span className="text-[10px] text-text-secondary">×{kill.kill_count}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showTomb && (
            <span className="text-[10px] text-text-secondary">{kill.tomb_x},{kill.tomb_y}</span>
          )}
          {statusLabel && (
            <span className="text-[10px]" style={{ color: textColor }}>{statusLabel}</span>
          )}
          {kill.registered_by_name && (
            <span className="text-[10px] text-text-secondary">
              por {kill.edited_by_name ? `${kill.edited_by_name} (editado)` : kill.registered_by_name}
            </span>
          )}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums min-w-[60px] text-right" style={{ color: countdownColor }}>
        {isCountUp ? `+${formatCountdown(remainingMs)}` : formatCountdown(remainingMs)}
      </span>
    </div>
  );
}
