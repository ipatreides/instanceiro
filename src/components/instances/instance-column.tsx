"use client";

import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceCard } from "./instance-card";

interface InstanceColumnProps {
  cooldownType: CooldownType;
  states: InstanceState[];
  now?: Date;
  onCardClick?: (state: InstanceState) => void;
}

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  weekly: "Semanal",
  three_day: "3 Dias",
  daily: "Diário",
  hourly: "Horário",
};

export function InstanceColumn({ cooldownType, states, now, onCardClick }: InstanceColumnProps) {
  if (states.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
        {COOLDOWN_LABELS[cooldownType]}
      </h3>
      <div className="flex flex-col gap-1.5">
        {states.map((state) => (
          <InstanceCard
            key={state.instance.id}
            state={state}
            now={now ?? new Date()}
            onClick={() => onCardClick?.(state)}
          />
        ))}
      </div>
    </div>
  );
}
