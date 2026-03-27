"use client";

import { useState, useCallback } from "react";
import type { Account, Character, Mvp, MvpActiveKill } from "@/lib/types";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { MvpTimerList } from "./mvp-timer-list";
import { MvpKillModal } from "./mvp-kill-modal";

interface MvpTabProps {
  selectedCharId: string | null;
  characters: Character[];
  accounts: Account[];
}

export function MvpTab({ selectedCharId, characters, accounts }: MvpTabProps) {
  const [search, setSearch] = useState("");
  const [modalMvp, setModalMvp] = useState<Mvp | null>(null);
  const [modalKill, setModalKill] = useState<MvpActiveKill | null>(null);
  const [modalInitialTime, setModalInitialTime] = useState<string | null>(null);

  // Derive server_id from selected character
  const selectedChar = characters.find((c) => c.id === selectedCharId);
  const account = accounts.find((a) => a.id === selectedChar?.account_id);
  const serverId = account?.server_id ?? null;

  // Load static data
  const { mvps, mapMeta, drops, loading: mvpLoading } = useMvpData(serverId);

  // Load group for this character
  const { group, members, loading: groupLoading } = useMvpGroups(selectedCharId);

  // Load active kills
  const { activeKills, loading: killsLoading, registerKill, editKill, deleteKill } = useMvpTimers(group?.id ?? null, serverId);

  const loading = mvpLoading || groupLoading || killsLoading;

  const handleKillNow = useCallback((mvp: Mvp) => {
    const existing = activeKills.find((k) => k.mvp_id === mvp.id);
    if (existing) {
      const spawnStart = new Date(existing.killed_at).getTime() + mvp.respawn_ms;
      if (Date.now() < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm("Este MVP já tem timer ativo. Substituir?")) return;
      }
    }
    setModalMvp(mvp);
    setModalKill(null);
    setModalInitialTime("now");
  }, [activeKills]);

  const handleKillSetTime = useCallback((mvp: Mvp) => {
    const existing = activeKills.find((k) => k.mvp_id === mvp.id);
    if (existing) {
      const spawnStart = new Date(existing.killed_at).getTime() + mvp.respawn_ms;
      if (Date.now() < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm("Este MVP já tem timer ativo. Substituir?")) return;
      }
    }
    setModalMvp(mvp);
    setModalKill(null);
    setModalInitialTime(null);
  }, [activeKills]);

  const handleEdit = useCallback((mvp: Mvp, kill: MvpActiveKill) => {
    setModalMvp(mvp);
    setModalKill(kill);
    setModalInitialTime(null);
  }, []);

  const handleConfirmKill = useCallback(async (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
  }) => {
    if (!modalMvp || !selectedCharId) return;

    if (modalKill) {
      await editKill(modalKill.kill_id, {
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        editedBy: selectedCharId,
      });
    } else {
      await registerKill({
        mvpId: modalMvp.id,
        groupId: group?.id ?? null,
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        registeredBy: selectedCharId,
        loots: data.selectedLoots,
      });
    }
    setModalMvp(null);
  }, [modalMvp, modalKill, selectedCharId, group, registerKill, editKill]);

  const handleDeleteKill = useCallback(async () => {
    if (!modalKill) return;
    await deleteKill(modalKill.kill_id);
    setModalMvp(null);
  }, [modalKill, deleteKill]);

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
        onKillNow={handleKillNow}
        onKillSetTime={handleKillSetTime}
        onEdit={handleEdit}
      />

      {modalMvp && (
        <MvpKillModal
          mvp={modalMvp}
          mapMeta={mapMeta.get(modalMvp.map_name)}
          drops={drops}
          existingKill={modalKill}
          groupMembers={members}
          characters={characters}
          selectedCharId={selectedCharId}
          isGroupMode={!!group}
          initialTime={modalInitialTime}
          onConfirm={handleConfirmKill}
          onDelete={modalKill ? handleDeleteKill : undefined}
          onClose={() => setModalMvp(null)}
        />
      )}
    </div>
  );
}
