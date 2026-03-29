"use client";

import { useState } from "react";
import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceColumn } from "./instance-column";
import { useDragScroll } from "@/hooks/use-drag-scroll";

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
  forceShowInactive?: boolean;
}

export function MobileInstanceTabs({ statesByType, now, onCardClick, forceShowInactive }: MobileInstanceTabsProps) {
  const [activeTab, setActiveTab] = useState<CooldownType>(COOLDOWN_ORDER[0]);
  const drag = useDragScroll();

  return (
    <div className="md:hidden flex flex-col gap-3">
      <div ref={drag.ref} {...drag.handlers} className="flex gap-1 overflow-x-auto select-none">
        {COOLDOWN_ORDER.map((type) => {
          const states = statesByType.get(type) ?? [];
          const availableCount = states.filter((s) => s.status === "available").length;
          return (
            <button
              key={type}
              onClick={() => { if (!drag.wasDragged()) setActiveTab(type); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === type
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary hover:text-text-primary"
              }`}
            >
              {COOLDOWN_LABELS[type]}
              {availableCount > 0 && (
                <span className={`text-[10px] px-1 py-0.5 rounded-full leading-none ${
                  activeTab === type ? "bg-white/20" : "bg-status-available/20 text-status-available"
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
        forceShowInactive={forceShowInactive}
      />
    </div>
  );
}
