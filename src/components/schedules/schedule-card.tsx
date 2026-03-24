"use client";

import type { InstanceSchedule } from "@/lib/types";

interface ScheduleCardProps {
  schedule: InstanceSchedule;
  onClick: () => void;
}

function formatScheduledDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduleCard({ schedule, onClick }: ScheduleCardProps) {
  const isLate =
    new Date(schedule.scheduled_at) < new Date() &&
    schedule.status === "open";

  const participantCount = schedule.participantCount ?? 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-surface border rounded-md px-3 py-2.5 hover:bg-card-hover-bg transition-colors cursor-pointer ${
        isLate
          ? "border-status-error animate-pulse"
          : "border-border"
      }`}
    >
      <div className="flex flex-col gap-0.5">
        {/* Line 1: Instance name + date */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-text-primary truncate">
            {schedule.instanceName ?? "Instância"}
          </span>
          <span className="text-xs text-text-secondary flex-shrink-0">
            {formatScheduledDate(schedule.scheduled_at)}
          </span>
        </div>

        {/* Line 2: Title */}
        {schedule.title && (
          <span className="text-xs text-primary-secondary truncate">
            {schedule.title}
          </span>
        )}

        {/* Line 3: Organizer + participant count */}
        <div className="flex items-center justify-between gap-2">
          {schedule.creatorUsername && (
            <span className="text-xs text-text-secondary truncate">
              @{schedule.creatorUsername}
            </span>
          )}
          <span className="text-xs text-primary-secondary bg-surface px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
            {participantCount}/12
          </span>
        </div>
      </div>
    </button>
  );
}
