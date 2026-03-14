"use client";

import type { InstanceState } from "@/lib/types";

interface InstanceCardProps {
  state: InstanceState;
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
  available: "border-l-green-500",
  cooldown: "border-l-orange-400",
  inactive: "border-l-gray-600",
};

const STATUS_DOT: Record<InstanceState["status"], string> = {
  available: "bg-green-500",
  cooldown: "bg-orange-400",
  inactive: "bg-gray-600",
};

export function InstanceCard({ state, onClick }: InstanceCardProps) {
  const { instance, status, completionCount, cooldownExpiresAt } = state;

  const now = new Date();
  const timeLabel =
    status === "cooldown"
      ? formatTimeRemaining(cooldownExpiresAt, instance.available_day, now)
      : null;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-[#1a1a2e] border border-gray-700 border-l-4 ${STATUS_BORDER[status]} rounded-md px-3 py-2.5 hover:bg-[#1e1e38] transition-colors cursor-pointer`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
          <span className="text-sm font-medium text-white truncate">{instance.name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {timeLabel && (
            <span className="text-xs text-orange-400 font-medium">{timeLabel}</span>
          )}
          {completionCount > 0 && (
            <span className="text-xs text-gray-400">×{completionCount}</span>
          )}
        </div>
      </div>
    </button>
  );
}
