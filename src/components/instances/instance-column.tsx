"use client";

import { useState, useMemo } from "react";
import type { InstanceState, CooldownType } from "@/lib/types";
import { InstanceCard } from "./instance-card";
import { EMPTY_MESSAGES } from "@/lib/empty-messages";

interface InstanceColumnProps {
  cooldownType: CooldownType;
  states: InstanceState[];
  now?: Date;
  onCardClick?: (state: InstanceState) => void;
  forceShowInactive?: boolean;
}

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  weekly: "Semanal",
  three_day: "3 Dias",
  daily: "Diário",
  hourly: "Horário",
};

const STATUS_ORDER: InstanceState["status"][] = ["in_progress", "available", "cooldown", "inactive"];

function sortStates(states: InstanceState[]): InstanceState[] {
  return [...states].sort((a, b) => {
    const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (statusDiff !== 0) return statusDiff;
    const countDiff = b.completionCount - a.completionCount;
    if (countDiff !== 0) return countDiff;
    return a.instance.name.localeCompare(b.instance.name, "pt-BR");
  });
}

export function InstanceColumn({ cooldownType, states, now, onCardClick, forceShowInactive }: InstanceColumnProps) {
  const emptyMsg = useMemo(
    () => EMPTY_MESSAGES[Math.floor(Math.random() * EMPTY_MESSAGES.length)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cooldownType]
  );

  const sorted = sortStates(states);
  const inProgress = sorted.filter((s) => s.status === "in_progress");
  const available = sorted.filter((s) => s.status === "available");
  const cooldown = sorted.filter((s) => s.status === "cooldown");
  const inactive = sorted.filter((s) => s.status === "inactive");
  const [showInactive, setShowInactive] = useState(false);

  const activeStates = [...inProgress, ...available, ...cooldown];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {COOLDOWN_LABELS[cooldownType]}
        </h3>
        <span className="text-xs text-text-secondary">
          {available.length}/{states.length}
        </span>
      </div>
      {states.length === 0 ? (
        <p className="text-xs text-text-secondary italic px-1 py-4">{emptyMsg}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {activeStates.map((state) => (
            <InstanceCard
              key={state.instance.id}
              state={state}
              now={now ?? new Date()}
              onClick={() => onCardClick?.(state)}
            />
          ))}
          {inactive.length > 0 && (
            <>
              <button
                onClick={() => setShowInactive((v) => !v)}
                className="text-xs text-text-secondary hover:text-text-secondary transition-colors cursor-pointer flex items-center gap-1 px-1 py-1"
              >
                <span className={`transition-transform ${showInactive ? "rotate-180" : ""}`}>▾</span>
                {inactive.length} inativa{inactive.length > 1 ? "s" : ""}
              </button>
              {(showInactive || forceShowInactive) && inactive.map((state) => (
                <InstanceCard
                  key={state.instance.id}
                  state={state}
                  now={now ?? new Date()}
                  onClick={() => onCardClick?.(state)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
