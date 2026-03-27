"use client";

import { useState } from "react";
import type { Account, Character } from "@/lib/types";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { MvpTimerList } from "./mvp-timer-list";

interface MvpTabProps {
  selectedCharId: string | null;
  characters: Character[];
  accounts: Account[];
}

export function MvpTab({ selectedCharId, characters, accounts }: MvpTabProps) {
  const [search, setSearch] = useState("");

  // Derive server_id from selected character
  const selectedChar = characters.find((c) => c.id === selectedCharId);
  const account = accounts.find((a) => a.id === selectedChar?.account_id);
  const serverId = account?.server_id ?? null;

  // Load static data
  const { mvps, loading: mvpLoading } = useMvpData(serverId);

  // Load group for this character
  const { group, loading: groupLoading } = useMvpGroups(selectedCharId);

  // Load active kills
  const { activeKills, loading: killsLoading } = useMvpTimers(group?.id ?? null, serverId);

  const loading = mvpLoading || groupLoading || killsLoading;

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <img
          src="/app-icon.svg"
          alt=""
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar MVP ou mapa..."
          className="w-full rounded-lg bg-bg border border-border pl-10 pr-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Group info */}
      {group ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Grupo:</span>
          <span className="text-xs text-primary-secondary font-medium">{group.name}</span>
          <span className="text-[10px] text-text-secondary">· {activeKills.length} ativos</span>
        </div>
      ) : (
        <div className="text-xs text-text-secondary">Modo solo</div>
      )}

      {/* Timer list */}
      <MvpTimerList
        mvps={mvps}
        activeKills={activeKills}
        search={search}
        loading={loading}
      />
    </div>
  );
}
