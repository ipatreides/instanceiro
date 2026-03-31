"use client";

import type { InstanceState } from "@/lib/types";

/** Instance IDs added in EP 17.2 + Labirinto da Neblina (EP 14.2) — 2026-03-31 */
export const NEW_INSTANCE_IDS = new Set([45, 46, 47, 48, 49]);

interface InstanceCardProps {
  state: InstanceState;
  now: Date;
  onClick?: () => void;
}

/**
 * Format remaining time or availability label.
 * Returns something like "6h 23min", "1d 14h", "Quinta", "Fim de semana", etc.
 */
export function formatTimeRemaining(expiresAt: Date | null, availableDay: string | null, now: Date): string {
  // If no expiry and no available day → shouldn't show cooldown
  if (!expiresAt) {
    if (availableDay) {
      return formatAvailableDay(availableDay);
    }
    return "";
  }

  const diffMs = expiresAt.getTime() - now.getTime();

  if (diffMs <= 0) {
    // Cooldown expired but day not available
    if (availableDay) {
      return formatAvailableDay(availableDay);
    }
    return "";
  }

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h`;
    return `${days}d`;
  }
  if (hours > 0) {
    if (minutes > 0) return `${hours}h ${minutes}min`;
    return `${hours}h`;
  }
  return `${minutes}min`;
}

function formatAvailableDay(availableDay: string): string {
  switch (availableDay) {
    case "thursday": return "Quinta";
    case "friday": return "Sexta";
    case "weekend": return "Fim de semana";
    default: return availableDay;
  }
}

const STATUS_BORDER: Record<InstanceState["status"], string> = {
  available: "card-status-available",
  cooldown: "card-status-cooldown",
  inactive: "border-l-disabled-bg",
  in_progress: "card-status-in-progress",
};

const STATUS_DOT: Record<InstanceState["status"], string> = {
  available: "bg-status-available",
  cooldown: "bg-status-cooldown",
  inactive: "bg-disabled-bg",
  in_progress: "bg-status-in-progress",
};

export function InstanceCard({ state, now, onClick }: InstanceCardProps) {
  const { instance, status, completionCount, cooldownExpiresAt } = state;
  const timeLabel =
    status === "cooldown"
      ? formatTimeRemaining(cooldownExpiresAt, instance.available_day, now)
      : null;
  const isInProgress = status === "in_progress";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-surface border border-border border-l-4 ${STATUS_BORDER[status]} rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-card-hover-bg shadow-card transition-colors cursor-pointer`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
          <span className="text-sm font-medium text-text-primary truncate">{instance.name}</span>
          {NEW_INSTANCE_IDS.has(instance.id) && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--slot-classe)_15%,transparent)] text-slot-classe flex-shrink-0">
              New
            </span>
          )}
          {instance.mutual_exclusion_group && (
            <span className="text-xs text-primary flex-shrink-0" title={`Compartilha cooldown com outras instâncias do grupo "${instance.mutual_exclusion_group}"`}>
              ⟷
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isInProgress && (
            <span className="text-xs text-status-in-progress-text font-medium">Em andamento</span>
          )}
          {timeLabel && (
            <span className="text-xs text-status-cooldown-text font-medium">{timeLabel}</span>
          )}
          {completionCount > 0 && (
            <span className="text-xs text-text-secondary">×{completionCount}</span>
          )}
          {instance.liga_tier && (
            <span className="text-xs text-primary-secondary font-medium">
              {instance.liga_tier}·{instance.liga_coins}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
