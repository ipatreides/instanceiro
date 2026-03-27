"use client";

import { useState, useCallback, useEffect } from "react";
import type { Account, Character, Mvp, MvpActiveKill } from "@/lib/types";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { MvpTimerList } from "./mvp-timer-list";
import { MvpKillModal } from "./mvp-kill-modal";
import { MvpMapPicker } from "./mvp-map-picker";

interface MvpTabProps {
  selectedCharId: string | null;
  characters: Character[];
  accounts: Account[];
}

function formatRespawn(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `~${h}h${m}min`;
  if (h > 0) return `~${h}h`;
  return `~${m}min`;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MvpTab({ selectedCharId, characters, accounts }: MvpTabProps) {
  const [search, setSearch] = useState("");
  const [selectedMvp, setSelectedMvp] = useState<Mvp | null>(null);
  const [showKillModal, setShowKillModal] = useState(false);
  const [modalInitialTime, setModalInitialTime] = useState<string | null>(null);
  const [modalKill, setModalKill] = useState<MvpActiveKill | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every second for detail panel countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const selectedChar = characters.find((c) => c.id === selectedCharId);
  const account = accounts.find((a) => a.id === selectedChar?.account_id);
  const serverId = account?.server_id ?? null;

  const { mvps, mapMeta, drops, loading: mvpLoading } = useMvpData(serverId);
  const { group, members, loading: groupLoading } = useMvpGroups(selectedCharId);
  const { activeKills, loading: killsLoading, registerKill, editKill, deleteKill } = useMvpTimers(group?.id ?? null, serverId);

  const loading = mvpLoading || groupLoading || killsLoading;

  // Find active kill for selected MVP
  const selectedKill = selectedMvp ? activeKills.find((k) => k.mvp_id === selectedMvp.id) ?? null : null;

  const handleSelectMvp = useCallback((mvp: Mvp) => {
    setSelectedMvp(mvp);
  }, []);

  const handleKillNow = useCallback(() => {
    if (!selectedMvp) return;
    if (selectedKill) {
      const spawnStart = new Date(selectedKill.killed_at).getTime() + selectedMvp.respawn_ms;
      if (now < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm("Este MVP já tem timer ativo. Substituir?")) return;
      }
    }
    setModalKill(null);
    setModalInitialTime("now");
    setShowKillModal(true);
  }, [selectedMvp, selectedKill, now]);

  const handleKillSetTime = useCallback(() => {
    if (!selectedMvp) return;
    if (selectedKill) {
      const spawnStart = new Date(selectedKill.killed_at).getTime() + selectedMvp.respawn_ms;
      if (now < spawnStart + 30 * 60 * 1000) {
        if (!window.confirm("Este MVP já tem timer ativo. Substituir?")) return;
      }
    }
    setModalKill(null);
    setModalInitialTime(null);
    setShowKillModal(true);
  }, [selectedMvp, selectedKill, now]);

  const handleEdit = useCallback(() => {
    if (!selectedMvp || !selectedKill) return;
    setModalKill(selectedKill);
    setModalInitialTime(null);
    setShowKillModal(true);
  }, [selectedMvp, selectedKill]);

  const handleConfirmKill = useCallback(async (data: {
    killedAt: string;
    tombX: number | null;
    tombY: number | null;
    killerCharacterId: string | null;
    selectedLoots: { itemId: number; itemName: string }[];
  }) => {
    if (!selectedMvp || !selectedCharId) return;

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
        mvpId: selectedMvp.id,
        groupId: group?.id ?? null,
        killedAt: data.killedAt,
        tombX: data.tombX,
        tombY: data.tombY,
        killerCharacterId: data.killerCharacterId,
        registeredBy: selectedCharId,
        loots: data.selectedLoots,
      });
    }
    setShowKillModal(false);
  }, [selectedMvp, modalKill, selectedCharId, group, registerKill, editKill]);

  const handleDeleteKill = useCallback(async () => {
    if (!selectedKill) return;
    await deleteKill(selectedKill.kill_id);
    setShowKillModal(false);
  }, [selectedKill, deleteKill]);

  // Compute status for detail panel
  const detailStatus = selectedMvp && selectedKill ? (() => {
    const killedAt = new Date(selectedKill.killed_at).getTime();
    const spawnStart = killedAt + selectedMvp.respawn_ms;
    const spawnEnd = spawnStart + selectedMvp.delay_ms;
    const remaining = spawnStart - now;
    const isAlive = now >= spawnStart;
    const countUp = isAlive ? now - spawnEnd : 0;
    return { remaining, isAlive, countUp };
  })() : null;

  return (
    <div className="flex gap-0 border border-border rounded-lg overflow-hidden bg-bg flex-1 min-h-0">
      {/* LEFT PANEL — MVP List (1/3) */}
      <div className="w-1/3 flex flex-col border-r border-border min-w-0">
        {/* Search */}
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar MVP ou mapa..."
            className="w-full rounded-md bg-surface border border-border px-2.5 py-1.5 text-[11px] text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Group info */}
        <div className="px-2 py-1.5 border-b border-border">
          {group ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">Grupo:</span>
              <span className="text-[10px] text-primary-secondary font-medium">{group.name}</span>
            </div>
          ) : (
            <span className="text-[10px] text-text-secondary">Modo solo</span>
          )}
        </div>

        {/* Timer list */}
        <MvpTimerList
          mvps={mvps}
          activeKills={activeKills}
          search={search}
          loading={loading}
          selectedMvpId={selectedMvp?.id ?? null}
          onSelectMvp={handleSelectMvp}
        />
      </div>

      {/* RIGHT PANEL — Detail (2/3) */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 min-w-0">
        {!selectedMvp ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-text-secondary italic">Selecione um MVP na lista</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{selectedMvp.name}</h3>
                <p className="text-[11px] text-text-secondary">
                  {selectedMvp.map_name} · Respawn: {formatRespawn(selectedMvp.respawn_ms)}
                  {selectedKill && selectedKill.kill_count > 0 && ` · ×${selectedKill.kill_count} kills`}
                </p>
              </div>
              {selectedKill && detailStatus && (
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums" style={{ color: detailStatus.isAlive ? "var(--status-available-text)" : "var(--status-cooldown-text)" }}>
                    {detailStatus.isAlive ? `+${formatCountdown(detailStatus.countUp)}` : formatCountdown(detailStatus.remaining)}
                  </div>
                  <div className="text-[10px]" style={{ color: detailStatus.isAlive ? "var(--status-available-text)" : "var(--status-cooldown-text)" }}>
                    {detailStatus.isAlive ? "Provavelmente vivo" : "Cooldown"}
                  </div>
                </div>
              )}
            </div>

            {/* Map + Info */}
            <div className="flex gap-3 mb-3">
              <div className="w-[160px] flex-shrink-0">
                <MvpMapPicker
                  mapName={selectedMvp.map_name}
                  mapMeta={mapMeta.get(selectedMvp.map_name)}
                  tombX={selectedKill?.tomb_x ?? null}
                  tombY={selectedKill?.tomb_y ?? null}
                  onCoordsChange={() => {}}
                />
              </div>

              {selectedKill ? (
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <div className="flex gap-3">
                    <div>
                      <span className="text-[9px] text-text-secondary font-semibold">HORA</span>
                      <div className="text-xs text-text-primary">{new Date(selectedKill.killed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    {selectedKill.tomb_x != null && (
                      <>
                        <div>
                          <span className="text-[9px] text-text-secondary font-semibold">X</span>
                          <div className="text-xs text-text-primary">{selectedKill.tomb_x}</div>
                        </div>
                        <div>
                          <span className="text-[9px] text-text-secondary font-semibold">Y</span>
                          <div className="text-xs text-text-primary">{selectedKill.tomb_y}</div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="text-[10px] text-text-secondary">
                    por <span className="text-primary-secondary">{selectedKill.edited_by_name ? `${selectedKill.edited_by_name} (editado)` : selectedKill.registered_by_name}</span>
                  </div>

                  {selectedKill.killer_name && (
                    <div>
                      <span className="text-[9px] text-text-secondary font-semibold">KILLER</span>
                      <div className="mt-0.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] border border-primary text-text-primary">
                          {selectedKill.killer_name}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center">
                  <p className="text-sm text-text-secondary italic">Nenhuma kill registrada</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-3 border-t border-border">
              <button
                onClick={handleKillNow}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer transition-colors"
              >
                ⚔ Matei agora
              </button>
              <button
                onClick={handleKillSetTime}
                className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors"
              >
                🕐 Informar horário
              </button>
              {selectedKill && (
                <>
                  <button
                    onClick={handleEdit}
                    className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors ml-auto"
                  >
                    ✎ Editar
                  </button>
                  <button
                    onClick={handleDeleteKill}
                    className="px-3 py-1.5 text-xs text-status-error-text hover:opacity-80 cursor-pointer transition-opacity"
                  >
                    Excluir
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Kill modal (for register/edit) */}
      {showKillModal && selectedMvp && (
        <MvpKillModal
          mvp={selectedMvp}
          mapMeta={mapMeta.get(selectedMvp.map_name)}
          drops={drops}
          existingKill={modalKill}
          groupMembers={members}
          characters={characters}
          selectedCharId={selectedCharId}
          isGroupMode={!!group}
          initialTime={modalInitialTime}
          onConfirm={handleConfirmKill}
          onDelete={modalKill ? handleDeleteKill : undefined}
          onClose={() => setShowKillModal(false)}
        />
      )}
    </div>
  );
}
