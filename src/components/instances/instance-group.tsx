"use client";

import { useState } from "react";
import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceColumn } from "./instance-column";
import { InstanceCard } from "./instance-card";

interface InstanceGroupProps {
  title: string;
  states: InstanceState[];
  now?: Date;
  onCardClick?: (state: InstanceState) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  forceExpanded?: boolean;
}

const COOLDOWN_ORDER: CooldownType[] = ["weekly", "three_day", "daily", "hourly"];

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  weekly: "Semanal",
  three_day: "3 Dias",
  daily: "Diário",
  hourly: "Horário",
};

function sortStates(states: InstanceState[]): InstanceState[] {
  return [...states].sort((a, b) => {
    const diff = b.completionCount - a.completionCount;
    if (diff !== 0) return diff;
    return a.instance.name.localeCompare(b.instance.name, "pt-BR");
  });
}

export function InstanceGroup({
  title,
  states,
  now,
  onCardClick,
  collapsible = false,
  defaultCollapsed = false,
  forceExpanded = false,
}: InstanceGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const isCollapsed = collapsible && !forceExpanded && collapsed;

  // Group states by cooldown type
  const byType = new Map<CooldownType, InstanceState[]>();
  for (const type of COOLDOWN_ORDER) {
    const group = sortStates(states.filter((s) => s.instance.cooldown_type === type));
    if (group.length > 0) {
      byType.set(type, group);
    }
  }

  const activeCooldownTypes = COOLDOWN_ORDER.filter((t) => byType.has(t));

  return (
    <div className="flex flex-col gap-3">
      {/* Group header */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-200">{title}</h2>
        <span className="text-xs text-[#6B5A8A] bg-[#2a1f40] px-2 py-0.5 rounded-full">
          {states.length}
        </span>
        {collapsible && !forceExpanded && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="ml-auto text-xs text-[#A89BC2] hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          >
            {collapsed ? "Mostrar" : "Ocultar"}
            <span className={`transition-transform ${collapsed ? "" : "rotate-180"}`}>▾</span>
          </button>
        )}
      </div>

      {!isCollapsed && (
        <>
          {/* Mobile: horizontal tabs, all 4 types */}
          <MobileTabView
            activeCooldownTypes={COOLDOWN_ORDER}
            byType={byType}
            now={now}
            onCardClick={onCardClick}
          />

          {/* Tablet: 2 columns, all 4 types */}
          <div className="hidden md:grid lg:hidden grid-cols-2 gap-4">
            {COOLDOWN_ORDER.map((type) => (
              <InstanceColumn
                key={type}
                cooldownType={type}
                states={byType.get(type) ?? []}
                now={now}
                onCardClick={onCardClick}
              />
            ))}
          </div>

          {/* Desktop: always 4 columns */}
          <div className="hidden lg:grid grid-cols-4 gap-4">
            {COOLDOWN_ORDER.map((type) => (
              <InstanceColumn
                key={type}
                cooldownType={type}
                states={byType.get(type) ?? []}
                now={now}
                onCardClick={onCardClick}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface MobileTabViewProps {
  activeCooldownTypes: CooldownType[];
  byType: Map<CooldownType, InstanceState[]>;
  now?: Date;
  onCardClick?: (state: InstanceState) => void;
}

function MobileTabView({ activeCooldownTypes, byType, now, onCardClick }: MobileTabViewProps) {
  const [activeTab, setActiveTab] = useState<CooldownType>(activeCooldownTypes[0]);

  const currentTab = activeCooldownTypes.includes(activeTab) ? activeTab : activeCooldownTypes[0];
  const currentStates = byType.get(currentTab) ?? [];

  return (
    <div className="md:hidden flex flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {activeCooldownTypes.map((type) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              currentTab === type
                ? "bg-[#7C3AED] text-white"
                : "bg-[#2a1f40] text-[#A89BC2] hover:text-white"
            }`}
          >
            {COOLDOWN_LABELS[type]}
          </button>
        ))}
      </div>
      {currentStates.length === 0 ? (
        <p className="text-xs text-[#6B5A8A] italic px-1 py-4">Nenhuma instância</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {currentStates.map((state) => (
            <InstanceCard
              key={state.instance.id}
              state={state}
              now={now ?? new Date()}
              onClick={() => onCardClick?.(state)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
