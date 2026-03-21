"use client";

import type { InstanceSchedule } from "@/lib/types";

interface ScheduleCardProps {
  schedule: InstanceSchedule;
  onClick: () => void;
}

function formatScheduledDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleString("pt-BR", {
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
      className={`w-full text-left bg-[#1a1230] border rounded-md px-3 py-2.5 hover:bg-[#221840] transition-colors cursor-pointer ${
        isLate
          ? "border-red-500 animate-pulse"
          : "border-[#3D2A5C]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-bold text-white truncate">
            {schedule.instanceName ?? "Instância"}
          </span>
          {schedule.creatorUsername && (
            <span className="text-xs text-[#6B5A8A] truncate">
              @{schedule.creatorUsername}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className="text-xs text-[#A89BC2]">
            {formatScheduledDate(schedule.scheduled_at)}
          </span>
          <span className="text-xs text-[#D4A843] bg-[#2a1f40] px-1.5 py-0.5 rounded-full font-medium">
            {participantCount}/12
          </span>
        </div>
      </div>
    </button>
  );
}
