"use client";

import { useState } from "react";
import type { InstanceSchedule } from "@/lib/types";
import { ScheduleCard } from "./schedule-card";

interface ScheduleSectionProps {
  schedules: InstanceSchedule[];
  onCardClick: (schedule: InstanceSchedule) => void;
}

export function ScheduleSection({ schedules, onCardClick }: ScheduleSectionProps) {
  const [collapsed, setCollapsed] = useState(schedules.length === 0);

  if (schedules.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-200">AGENDADAS</h2>
        <span className="text-xs text-[#6B5A8A] bg-[#2a1f40] px-2 py-0.5 rounded-full">
          {schedules.length}
        </span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto text-xs text-[#A89BC2] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
        >
          {collapsed ? "Mostrar" : "Ocultar"}
          <span className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>▾</span>
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onClick={() => onCardClick(schedule)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
