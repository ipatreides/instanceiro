"use client";

import { useMemo, useState, useEffect } from "react";
import type { Instance, TrackerInstanceData, CooldownType } from "@/lib/types";
import { calculateCooldownExpiry } from "@/lib/cooldown";
import { StatusBadge } from "@/components/ui/status-badge";

interface InstanceChecklistProps {
  instances: Instance[];
  completions: Record<string, TrackerInstanceData>;
  activeInstances: Record<string, boolean> | null;
  onMarkDone: (instanceId: string) => void;
  onClear: (instanceId: string) => void;
  onToggleActive: (instanceId: string, active: boolean) => void;
}

type LocalStatus = "available" | "soon" | "cooldown";

interface InstanceRowData {
  instance: Instance;
  status: LocalStatus;
  cooldownExpiresAt: Date | null;
  isActive: boolean;
}

const COOLDOWN_LABELS: Record<CooldownType, string> = {
  hourly: "Horário",
  daily: "Diário",
  three_day: "3 Dias",
  weekly: "Semanal",
};

const COOLDOWN_ORDER: CooldownType[] = ["hourly", "daily", "three_day", "weekly"];

const SOON_THRESHOLD_MS = 30 * 60 * 1000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return "agora";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

function matchesSearch(instance: Instance, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (instance.name.toLowerCase().includes(q)) return true;
  if (instance.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
  return false;
}

function CountdownCell({ expiresAt }: { expiresAt: Date }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = expiresAt.getTime() - now;
  return <span>{formatCountdown(ms)}</span>;
}

function InstanceCard({
  row,
  onMarkDone,
  onClear,
  onToggleActive,
}: {
  row: InstanceRowData;
  onMarkDone: (id: string) => void;
  onClear: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const { instance, status, cooldownExpiresAt, isActive } = row;
  const id = String(instance.id);

  const borderClass =
    !isActive
      ? "border-l-disabled-bg"
      : status === "cooldown"
      ? "card-status-cooldown"
      : status === "soon"
      ? "card-status-soon"
      : "card-status-available";

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-md)] bg-surface border border-border border-l-4 ${borderClass} ${
        isActive ? "hover:bg-card-hover-bg" : "opacity-50"
      } transition-colors`}
    >
      <button
        onClick={() => onToggleActive(id, !isActive)}
        title={isActive ? "Desativar" : "Ativar"}
        className="flex-shrink-0 w-3.5 h-3.5 rounded border border-border flex items-center justify-center cursor-pointer transition-colors hover:border-primary"
        style={{
          background: isActive ? "var(--primary)" : "transparent",
          borderColor: isActive ? "var(--primary)" : undefined,
        }}
      >
        {isActive && (
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-text-primary truncate block">{instance.name}</span>
        {isActive && status !== "available" && cooldownExpiresAt && (
          <span
            className={`text-[11px] font-medium ${
              status === "soon" ? "text-status-soon-text" : "text-status-cooldown-text"
            }`}
          >
            <CountdownCell expiresAt={cooldownExpiresAt} />
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isActive && (
          <StatusBadge
            status={status === "available" ? "available" : status === "soon" ? "soon" : "cooldown"}
          />
        )}
        {isActive && (
          <button
            onClick={() => (status !== "available" ? onClear(id) : onMarkDone(id))}
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
              status !== "available"
                ? "text-status-cooldown-text hover:bg-[color-mix(in_srgb,var(--status-cooldown)_10%,transparent)]"
                : "bg-primary text-white hover:bg-primary-hover"
            }`}
          >
            {status !== "available" ? "Desfazer" : "Feito"}
          </button>
        )}
      </div>
    </div>
  );
}

function TrackerColumn({
  cooldownType,
  rows,
  onMarkDone,
  onClear,
  onToggleActive,
  forceShowInactive,
}: {
  cooldownType: CooldownType;
  rows: InstanceRowData[];
  onMarkDone: (id: string) => void;
  onClear: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  forceShowInactive: boolean;
}) {
  const [showInactive, setShowInactive] = useState(false);

  const active = rows.filter((r) => r.isActive);
  const inactive = rows.filter((r) => !r.isActive);
  const availableCount = active.filter((r) => r.status === "available").length;

  const sorted = [...active].sort((a, b) => {
    const statusOrder: Record<LocalStatus, number> = { available: 0, soon: 1, cooldown: 2 };
    const diff = statusOrder[a.status] - statusOrder[b.status];
    if (diff !== 0) return diff;
    return a.instance.name.localeCompare(b.instance.name, "pt-BR");
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-1 mb-0.5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {COOLDOWN_LABELS[cooldownType]}
        </h3>
        <span className="text-xs text-text-secondary">
          {availableCount}/{active.length}
        </span>
      </div>

      {sorted.map((row) => (
        <InstanceCard
          key={row.instance.id}
          row={row}
          onMarkDone={onMarkDone}
          onClear={onClear}
          onToggleActive={onToggleActive}
        />
      ))}

      {inactive.length > 0 && (
        <>
          <button
            onClick={() => setShowInactive((v) => !v)}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer flex items-center gap-1 px-1 py-1"
          >
            <span className={`transition-transform inline-block ${showInactive ? "rotate-180" : ""}`}>▾</span>
            {inactive.length} inativa{inactive.length > 1 ? "s" : ""}
          </button>
          {(showInactive || forceShowInactive) &&
            inactive.map((row) => (
              <InstanceCard
                key={row.instance.id}
                row={row}
                onMarkDone={onMarkDone}
                onClear={onClear}
                onToggleActive={onToggleActive}
              />
            ))}
        </>
      )}
    </div>
  );
}

// Mobile: tab-based single column
function MobileTrackerTabs({
  grouped,
  onMarkDone,
  onClear,
  onToggleActive,
  forceShowInactive,
}: {
  grouped: { type: CooldownType; rows: InstanceRowData[] }[];
  onMarkDone: (id: string) => void;
  onClear: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  forceShowInactive: boolean;
}) {
  const [activeTab, setActiveTab] = useState<CooldownType>("hourly");

  const currentGroup = grouped.find((g) => g.type === activeTab) ?? grouped[0];

  return (
    <div className="md:hidden">
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {COOLDOWN_ORDER.map((type) => {
          const group = grouped.find((g) => g.type === type);
          const count = group?.rows.filter((r) => r.isActive).length ?? 0;
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === type
                  ? "bg-primary text-white"
                  : "bg-surface text-text-secondary border border-border"
              }`}
            >
              {COOLDOWN_LABELS[type]} ({count})
            </button>
          );
        })}
      </div>
      {currentGroup && (
        <TrackerColumn
          cooldownType={currentGroup.type}
          rows={currentGroup.rows}
          onMarkDone={onMarkDone}
          onClear={onClear}
          onToggleActive={onToggleActive}
          forceShowInactive={forceShowInactive}
        />
      )}
    </div>
  );
}

export function InstanceChecklist({
  instances,
  completions,
  activeInstances,
  onMarkDone,
  onClear,
  onToggleActive,
}: InstanceChecklistProps) {
  const [search, setSearch] = useState("");

  // Recompute on a 30-second tick so "soon" status updates
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const now = new Date();
    return instances.map((inst): InstanceRowData => {
      const id = String(inst.id);
      const isActive = activeInstances === null ? true : activeInstances[id] !== false;
      const completion = completions[id];
      let status: LocalStatus = "available";
      let cooldownExpiresAt: Date | null = null;

      if (completion) {
        const completedAt = new Date(completion.completed_at);
        cooldownExpiresAt = calculateCooldownExpiry(completedAt, inst.cooldown_type, inst.cooldown_hours, inst.available_day);
        if (cooldownExpiresAt && cooldownExpiresAt > now) {
          const remaining = cooldownExpiresAt.getTime() - now.getTime();
          status = remaining <= SOON_THRESHOLD_MS ? "soon" : "cooldown";
        }
      }

      return { instance: inst, status, cooldownExpiresAt, isActive };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, completions, activeInstances, tick]);

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    return rows.filter((r) => matchesSearch(r.instance, search));
  }, [rows, search]);

  const isSearching = search.length > 0;

  const grouped = useMemo(() => {
    return COOLDOWN_ORDER.map((type) => ({
      type,
      rows: filteredRows.filter((r) => r.instance.cooldown_type === type),
    })).filter((g) => g.rows.length > 0);
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar instância…"
          className="w-full bg-surface border border-border rounded-[var(--radius-md)] pl-8 pr-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-focus-ring transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {isSearching && (
        <p className="text-xs text-text-secondary">
          {filteredRows.length} de {rows.length} instâncias
        </p>
      )}

      {grouped.length === 0 ? (
        <p className="text-text-secondary text-sm text-center py-8">
          {search ? "Nenhuma instância encontrada." : "Nenhuma instância disponível."}
        </p>
      ) : (
        <>
          {/* Mobile: tabs */}
          <MobileTrackerTabs
            grouped={grouped}
            onMarkDone={onMarkDone}
            onClear={onClear}
            onToggleActive={onToggleActive}
            forceShowInactive={isSearching}
          />

          {/* Tablet: 2 columns */}
          <div className="hidden md:grid lg:hidden grid-cols-2 gap-4">
            {COOLDOWN_ORDER.map((type) => {
              const group = grouped.find((g) => g.type === type);
              if (!group) return null;
              return (
                <TrackerColumn
                  key={type}
                  cooldownType={type}
                  rows={group.rows}
                  onMarkDone={onMarkDone}
                  onClear={onClear}
                  onToggleActive={onToggleActive}
                  forceShowInactive={isSearching}
                />
              );
            })}
          </div>

          {/* Desktop: 4 columns */}
          <div className="hidden lg:grid grid-cols-4 gap-4">
            {COOLDOWN_ORDER.map((type) => {
              const group = grouped.find((g) => g.type === type);
              if (!group) return null;
              return (
                <TrackerColumn
                  key={type}
                  cooldownType={type}
                  rows={group.rows}
                  onMarkDone={onMarkDone}
                  onClear={onClear}
                  onToggleActive={onToggleActive}
                  forceShowInactive={isSearching}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
