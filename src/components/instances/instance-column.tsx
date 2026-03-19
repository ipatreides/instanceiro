"use client";

import { useMemo } from "react";
import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceCard } from "./instance-card";
import { EMPTY_MESSAGES } from "@/lib/empty-messages";

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
  const emptyMsg = useMemo(
    () => EMPTY_MESSAGES[Math.floor(Math.random() * EMPTY_MESSAGES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cooldownType]
  );

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-[#A89BC2] uppercase tracking-wider px-1">
        {COOLDOWN_LABELS[cooldownType]}
      </h3>
      {states.length === 0 ? (
        <p className="text-xs text-[#6B5A8A] italic px-1 py-4">{emptyMsg}</p>
      ) : (
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
      )}
    </div>
  );
}
