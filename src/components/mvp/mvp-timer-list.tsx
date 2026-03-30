"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import type { Mvp, MvpActiveKill } from "@/lib/types";
import type { MvpSighting } from "@/hooks/use-mvp-sightings";
import type { MvpBroadcast } from "@/hooks/use-mvp-broadcasts";

const GROUP_DISPLAY_NAMES: Record<string, string> = {
  bio_lab_3: "Bio Lab 3",
  bio_lab_5: "Bio Lab 5",
};

interface MvpTimerListProps {
  mvps: Mvp[];
  activeKills: MvpActiveKill[];
  sightings: MvpSighting[];
  broadcasts?: MvpBroadcast[];
  search: string;
  loading: boolean;
  selectedMvpId: number | null;
  onSelectMvp: (mvp: Mvp) => void;
}

export function MvpTimerList({ mvps, activeKills, sightings, broadcasts, search, loading, selectedMvpId, onSelectMvp }: MvpTimerListProps) {
  const [inactiveCollapsed, setInactiveCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const killMap = useMemo(() => {
    const map = new Map<number, MvpActiveKill>();
    for (const k of activeKills) map.set(k.mvp_id, k);
    return map;
  }, [activeKills]);

  // Build cooldown group -> latest kill map
  const groupKillMap = useMemo(() => {
    const map = new Map<string, MvpActiveKill>();
    for (const mvp of mvps) {
      if (!mvp.cooldown_group) continue;
      const kill = killMap.get(mvp.id);
      if (!kill) continue;
      const existing = map.get(mvp.cooldown_group);
      if (!existing || (kill.killed_at ?? '') > (existing.killed_at ?? '')) {
        map.set(mvp.cooldown_group, kill);
      }
    }
    return map;
  }, [mvps, killMap]);

  // Resolve effective kill: for grouped MVPs use group's latest kill
  const getEffectiveKill = useCallback((mvp: Mvp): MvpActiveKill | undefined => {
    if (mvp.cooldown_group) {
      return groupKillMap.get(mvp.cooldown_group);
    }
    return killMap.get(mvp.id);
  }, [killMap, groupKillMap]);

  // Collapse cooldown_group MVPs into a single representative per group
  const { collapsedMvps, groupRepresentativeId } = useMemo(() => {
    const seen = new Set<string>();
    const representativeIds = new Map<string, number>();
    const result: Mvp[] = [];

    for (const mvp of mvps) {
      if (mvp.cooldown_group) {
        if (seen.has(mvp.cooldown_group)) continue;
        seen.add(mvp.cooldown_group);
        representativeIds.set(mvp.cooldown_group, mvp.id);
      }
      result.push(mvp);
    }

    return { collapsedMvps: result, groupRepresentativeId: representativeIds };
  }, [mvps]);

  const q = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    return collapsedMvps.filter((m) => {
      if (!q) return true;
      const displayName = m.cooldown_group ? GROUP_DISPLAY_NAMES[m.cooldown_group] ?? m.name : m.name;
      return displayName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.map_name.toLowerCase().includes(q);
    });
  }, [collapsedMvps, q]);

  // Split: actives always visible (from all mvps), inactives filtered by search
  const now = Date.now();
  const active: { mvp: Mvp; kill: MvpActiveKill | null }[] = [];
  const activeIds = new Set<number>();

  for (const mvp of collapsedMvps) {
    const kill = getEffectiveKill(mvp);
    if (kill) {
      const killedAtMs = kill.killed_at ? new Date(kill.killed_at).getTime() : 0;
      const spawnStart = killedAtMs + mvp.respawn_ms;
      const cardExpiry = kill.killed_at ? spawnStart + 30 * 60 * 1000 : Infinity;
      if (now < cardExpiry || !kill.killed_at) {
        active.push({ mvp, kill });
        activeIds.add(mvp.id);
      }
    }
  }

  // MVPs with active sightings but no kill timer → show as "Vivo" in active list
  for (const sighting of sightings) {
    if (!activeIds.has(sighting.mvp_id)) {
      const mvp = mvps.find(m => m.id === sighting.mvp_id);
      if (mvp) {
        active.push({ mvp, kill: null });
        activeIds.add(mvp.id);
      }
    }
  }

  // MVPs with active broadcasts but no kill timer → promote to active list
  if (broadcasts) {
    for (const br of broadcasts) {
      if (new Date(br.expires_at) <= new Date()) continue;
      const repId = groupRepresentativeId.get(br.cooldown_group);
      if (repId && !activeIds.has(repId)) {
        const mvp = collapsedMvps.find(m => m.id === repId);
        if (mvp) {
          active.push({ mvp, kill: getEffectiveKill(mvp) ?? null });
          activeIds.add(repId);
        }
      }
    }
  }

  const inactive: { mvp: Mvp; killCount: number }[] = [];
  for (const mvp of filtered) {
    if (activeIds.has(mvp.id)) continue;
    const kill = killMap.get(mvp.id);
    const killCount = kill?.kill_count ?? 0;
    inactive.push({ mvp, killCount });
  }

  // Sort active: broadcasts first, then sightings (alive), then by nearest spawn
  active.sort((a, b) => {
    const aBroadcast = a.mvp.cooldown_group ? broadcasts?.some(br => br.cooldown_group === a.mvp.cooldown_group && new Date(br.expires_at) > new Date()) ?? false : false;
    const bBroadcast = b.mvp.cooldown_group ? broadcasts?.some(br => br.cooldown_group === b.mvp.cooldown_group && new Date(br.expires_at) > new Date()) ?? false : false;
    if (aBroadcast && !bBroadcast) return -1;
    if (!aBroadcast && bBroadcast) return 1;
    const aAlive = sightings.some(s => s.mvp_id === a.mvp.id && (!a.kill || !a.kill.killed_at || new Date(s.spotted_at).getTime() > new Date(a.kill.killed_at).getTime()));
    const bAlive = sightings.some(s => s.mvp_id === b.mvp.id && (!b.kill || !b.kill.killed_at || new Date(s.spotted_at).getTime() > new Date(b.kill.killed_at).getTime()));
    if (aAlive && !bAlive) return -1;
    if (!aAlive && bAlive) return 1;
    const aSpawn = a.kill?.killed_at ? new Date(a.kill.killed_at).getTime() + a.mvp.respawn_ms : 0;
    const bSpawn = b.kill?.killed_at ? new Date(b.kill.killed_at).getTime() + b.mvp.respawn_ms : 0;
    return aSpawn - bSpawn;
  });

  // Sort inactive by kill count descending (most hunted first)
  inactive.sort((a, b) => b.killCount - a.killCount);

  // Scroll state management
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, active.length, inactive.length, inactiveCollapsed]);

  const scrollPage = (direction: "up" | "down") => {
    const el = scrollRef.current;
    if (!el) return;
    const pageSize = el.clientHeight * 0.8;
    el.scrollBy({ top: direction === "up" ? -pageSize : pageSize, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Scroll up arrow */}
      {canScrollUp && (
        <button
          onClick={() => scrollPage("up")}
          className="absolute top-0 left-0 right-0 z-10 h-6 flex items-center justify-center bg-gradient-to-b from-bg to-transparent cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-primary">
            <path d="M3 10L8 5L13 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Scrollable list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-1">
        {/* Active timers */}
        {active.length > 0 && (
          <div className="flex flex-col gap-1 mb-2">
            <p className="text-[10px] text-text-secondary font-semibold px-1">ATIVOS ({active.length})</p>
            {active.map(({ mvp, kill }) => {
              // Broadcast is active if the group has a non-expired broadcast
              const hasBroadcast = mvp.cooldown_group && broadcasts?.some(
                br => br.cooldown_group === mvp.cooldown_group && new Date(br.expires_at) > new Date()
              );
              // Sighting is only valid if it's newer than the kill (MVP was seen alive AFTER dying)
              const hasSighting = sightings.some(s =>
                s.mvp_id === mvp.id &&
                (!kill || !kill.killed_at || new Date(s.spotted_at).getTime() > new Date(kill.killed_at).getTime())
              );
              const timerColor = hasBroadcast ? "var(--status-available)" : hasSighting ? "var(--status-available)" : kill ? getTimerColor(kill, mvp, now) : "var(--status-available)";
              return (
              <button
                key={mvp.id}
                onClick={() => onSelectMvp(mvp)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left cursor-pointer transition-colors ${
                  selectedMvpId === mvp.id
                    ? "bg-card-hover-bg outline outline-1 outline-primary"
                    : "bg-surface hover:bg-card-hover-bg"
                }`}
                style={{ borderLeft: `3px solid ${timerColor}` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-text-primary truncate">
                    {mvp.cooldown_group ? GROUP_DISPLAY_NAMES[mvp.cooldown_group] ?? mvp.name : mvp.name}
                  </div>
                  <div className="text-[9px] text-text-secondary">
                    {mvp.map_name}
                  </div>
                </div>
                {hasBroadcast ? (
                  <span className="text-[11px] font-bold animate-pulse" style={{ color: "var(--status-available-text)" }}>
                    Em breve
                  </span>
                ) : hasSighting ? (
                  <span className="text-[11px] font-bold animate-pulse" style={{ color: "var(--status-available-text)" }}>
                    Vivo
                  </span>
                ) : kill ? (
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: timerColor }}>
                    {formatTimer(kill, mvp, now)}
                  </span>
                ) : null}
              </button>
              );
            })}
          </div>
        )}

        {/* Inactive MVPs — collapsable cards */}
        {inactive.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setInactiveCollapsed(!inactiveCollapsed)}
              className="flex items-center gap-1 text-[10px] text-text-secondary font-semibold px-1 cursor-pointer hover:text-text-primary transition-colors"
            >
              <span className={`transition-transform ${inactiveCollapsed ? "-rotate-90" : ""}`}>▾</span>
              SEM INFO ({inactive.length})
            </button>
            {!inactiveCollapsed && inactive.map(({ mvp, killCount }) => (
              <button
                key={mvp.id}
                onClick={() => onSelectMvp(mvp)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left cursor-pointer transition-colors opacity-60 hover:opacity-100 ${
                  selectedMvpId === mvp.id
                    ? "bg-card-hover-bg outline outline-1 outline-primary opacity-100"
                    : "bg-surface hover:bg-card-hover-bg"
                }`}
                style={{ borderLeft: "3px solid var(--border)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-text-secondary">
                    {mvp.cooldown_group ? GROUP_DISPLAY_NAMES[mvp.cooldown_group] ?? mvp.name : mvp.name}
                  </div>
                  <div className="text-[9px] text-text-secondary opacity-60">
                    {mvp.map_name}
                  </div>
                </div>
                {killCount > 0 && (
                  <span className="text-[9px] text-text-secondary">×{killCount}</span>
                )}
                <span className="text-[9px] text-text-secondary">--</span>
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <p className="text-sm text-text-secondary italic text-center py-4">
            {q ? "Nenhum MVP encontrado." : "Nenhum MVP cadastrado."}
          </p>
        )}
      </div>

      {/* Scroll down arrow */}
      {canScrollDown && (
        <button
          onClick={() => scrollPage("down")}
          className="absolute bottom-0 left-0 right-0 z-10 h-6 flex items-center justify-center bg-gradient-to-t from-bg to-transparent cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-primary">
            <path d="M3 6L8 11L13 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// Helper: get timer border/text color
function getTimerColor(kill: MvpActiveKill, mvp: Mvp, now: number): string {
  if (!kill.killed_at) return "var(--status-soon)";
  const spawnStart = new Date(kill.killed_at).getTime() + mvp.respawn_ms;
  const remaining = spawnStart - now;
  if (remaining <= 0) {
    // Bio Lab 5: mechanic-dependent, not guaranteed alive
    if (mvp.cooldown_group === 'bio_lab_5') return "var(--status-soon)";
    return "var(--status-available)";
  }
  if (remaining < 5 * 60 * 1000) return "var(--status-available)";
  if (remaining < 30 * 60 * 1000) return "var(--status-soon)";
  return "var(--status-cooldown)";
}

// Helper: format timer display for list
function formatTimer(kill: MvpActiveKill, mvp: Mvp, now: number): string {
  if (!kill.killed_at) return "?";
  const spawnStart = new Date(kill.killed_at).getTime() + mvp.respawn_ms;
  const diff = spawnStart - now;
  if (diff <= 0 && mvp.cooldown_group === 'bio_lab_5') {
    return "Mecânica";
  }
  const totalMin = Math.floor(Math.abs(diff) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const time = h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}min`;
  return diff <= 0 ? `+${time}` : time;
}
