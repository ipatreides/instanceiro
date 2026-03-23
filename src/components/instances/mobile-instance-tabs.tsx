"use client";

import { useState } from "react";
import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceColumn } from "./instance-column";

const COOLDOWN_ORDER: CooldownType[] = ["weekly", "three_day", "daily", "hourly"];

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  weekly: "Semanal",
  three_day: "3 Dias",
  daily: "Diário",
  hourly: "Horário",
};

interface MobileInstanceTabsProps {
  statesByType: Map<CooldownType, InstanceState[]>;
  now: Date;
  onCardClick: (state: InstanceState) => void;
}

export function MobileInstanceTabs({ statesByType, now, onCardClick }: MobileInstanceTabsProps) {
  const [activeTab, setActiveTab] = useState<CooldownType>(COOLDOWN_ORDER[0]);

  return (
    <div className="md:hidden flex flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {COOLDOWN_ORDER.map((type) => {
          const states = statesByType.get(type) ?? [];
          const availableCount = states.filter((s) => s.status === "available").length;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === type
                  ? "bg-[#7C3AED] text-white"
                  : "bg-[#2a1f40] text-[#A89BC2] hover:text-white"
              }`}
            >
              {COOLDOWN_LABELS[type]}
              {availableCount > 0 && (
                <span className={`text-[10px] px-1 py-0.5 rounded-full leading-none ${
                  activeTab === type ? "bg-white/20" : "bg-green-500/20 text-green-400"
                }`}>
                  {availableCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <InstanceColumn
        cooldownType={activeTab}
        states={statesByType.get(activeTab) ?? []}
        now={now}
        onCardClick={onCardClick}
      />
    </div>
  );
}
