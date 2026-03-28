"use client";

import { useMemo } from "react";
import type { Instance, TrackerInstanceData } from "@/lib/types";
import { calculateCooldownExpiry } from "@/lib/cooldown";

interface InstanceChecklistProps {
  instances: Instance[];
  completions: Record<string, TrackerInstanceData>;
  onMarkDone: (instanceId: string) => void;
  onClear: (instanceId: string) => void;
}

export function InstanceChecklist({
  instances,
  completions,
  onMarkDone,
  onClear,
}: InstanceChecklistProps) {
  const now = useMemo(() => new Date(), []);

  const states = useMemo(() => {
    return instances.map((inst) => {
      const completion = completions[String(inst.id)];
      let status: "available" | "cooldown" = "available";
      let cooldownExpiresAt: Date | null = null;

      if (completion) {
        const completedAt = new Date(completion.completed_at);
        cooldownExpiresAt = calculateCooldownExpiry(completedAt, inst.cooldown_type, inst.cooldown_hours, inst.available_day);
        if (cooldownExpiresAt && cooldownExpiresAt > now) {
          status = "cooldown";
        }
      }

      return { instance: inst, status, cooldownExpiresAt, completion };
    });
  }, [instances, completions, now]);

  return (
    <div className="space-y-2">
      {states.map(({ instance, status, cooldownExpiresAt }) => (
        <div
          key={instance.id}
          className={`flex items-center justify-between p-3 rounded-md border ${
            status === "cooldown"
              ? "border-status-cooldown bg-surface/50"
              : "border-border bg-surface hover:bg-card-hover-bg"
          }`}
        >
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-text-primary truncate block">
              {instance.name}
            </span>
            {status === "cooldown" && cooldownExpiresAt && (
              <span className="text-xs text-status-cooldown-text">
                Disponível em {formatTimeRemaining(cooldownExpiresAt, now)}
              </span>
            )}
          </div>
          <button
            onClick={() =>
              status === "cooldown"
                ? onClear(String(instance.id))
                : onMarkDone(String(instance.id))
            }
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
              status === "cooldown"
                ? "text-status-cooldown-text hover:bg-surface"
                : "bg-primary text-white hover:bg-primary-hover"
            }`}
          >
            {status === "cooldown" ? "Desfazer" : "Feito"}
          </button>
        </div>
      ))}
    </div>
  );
}

function formatTimeRemaining(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "agora";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
