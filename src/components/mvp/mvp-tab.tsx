"use client";

import { useState, useCallback, useEffect } from "react";
import type { Account, Character, Mvp, MvpActiveKill } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { MvpTimerList } from "./mvp-timer-list";
import { MvpKillModal } from "./mvp-kill-modal";
import { MvpMapPicker } from "./mvp-map-picker";
import { MvpGroupHub } from "./mvp-group-hub";
import { MvpGroupStats } from "./mvp-group-stats";
import { TelemetrySettings } from "./telemetry-settings";

interface KillHistoryEntry {
  id: string;
  killed_at: string;
  killer_name: string | null;
  registered_by_name: string;
  tomb_x: number | null;
  tomb_y: number | null;
}

interface MvpTabProps {
  selectedCharId: string | null;
  characters: Character[];
  accounts: Account[];
  userId?: string | null;
  onHasUrgentMvp?: (hasUrgent: boolean) => void;
}

function formatRespawn(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `~${h}h${m}min`;
  if (h > 0) return `~${h}h`;
  return `~${m}min`;
}

function formatCountdown(ms: number): string {
  const totalMin = Math.floor(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

export function MvpTab({ selectedCharId, characters, accounts, userId }: MvpTabProps) {
  const [search, setSearch] = useState("");
  const [selectedMvp, setSelectedMvp] = useState<Mvp | null>(null);
  const [showKillModal, setShowKillModal] = useState(false);
  const [modalInitialTime, setModalInitialTime] = useState<string | null>(null);
  const [modalKill, setModalKill] = useState<MvpActiveKill | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [hubTab, setHubTab] = useState<"grupo" | "stats">("grupo");
  const [now, setNow] = useState(Date.now());
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());
  const [memberUsernames, setMemberUsernames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const selectedChar = characters.find((c) => c.id === selectedCharId);
  const account = accounts.find((a) => a.id === selectedChar?.account_id);
  const serverId = account?.server_id ?? null;

  const { mvps, mapMeta, drops, loading: mvpLoading } = useMvpData(serverId);
  const { group, members, loading: groupLoading, createGroup, updateGroup, inviteCharacter, leaveGroup } = useMvpGroups(selectedCharId);
  const { activeKills, loading: killsLoading, registerKill, editKill, deleteKill, acceptLootSuggestions, rejectLootSuggestion } = useMvpTimers(group?.id ?? null, serverId);

  const loading = mvpLoading || groupLoading || killsLoading;

  // Resolve member names (own chars from props + friends via RPC)
  useEffect(() => {
    const allCharIds = new Set(members.map((m) => m.character_id));
    if (allCharIds.size === 0) { setMemberNames(new Map()); return; }
    const nameMap = new Map<string, string>();
    for (const c of characters) nameMap.set(c.id, c.name);
    const missing = [...allCharIds].filter((id) => !nameMap.has(id));
    if (missing.length === 0) { setMemberNames(nameMap); return; }
    const supabase = createClient();
    supabase.rpc("get_character_names", { char_ids: missing }).then(({ data }) => {
      for (const c of ((data ?? []) as { id: string; name: string }[])) nameMap.set(c.id, c.name);
      setMemberNames(new Map(nameMap));
    });

    // Also fetch usernames for group members
    const userIds = [...new Set(members.map((m) => m.user_id))];
    if (userIds.length > 0) {
      supabase.from("profiles").select("id, username").in("id", userIds).then(({ data }) => {
        const uMap = new Map<string, string>();
        for (const p of (data ?? [])) uMap.set(p.id, p.username ?? "?");
        setMemberUsernames(uMap);
      });
    }
  }, [members, characters]);

  // Parties for modal (empty array — parties are now managed in hub)
  const partiesForModal: { id: string; name: string; memberIds: string[] }[] = [];

  const selectedKill = selectedMvp ? activeKills.find((k) => k.mvp_id === selectedMvp.id) ?? null : null;

  // Kill history — fetch ALL group kills once, filter per MVP locally
  const [allKillHistory, setAllKillHistory] = useState<(KillHistoryEntry & { mvp_id: number })[]>([]);
  useEffect(() => {
    const supabase = createClient();
    const query = supabase
      .from("mvp_kills")
      .select("id, mvp_id, killed_at, tomb_x, tomb_y, killer_character_id, registered_by");
    if (group) query.eq("group_id", group.id);
    else query.is("group_id", null);
    query.order("killed_at", { ascending: false })
      .limit(200);
    query
      .then(async ({ data }) => {
        if (!data || data.length === 0) { setAllKillHistory([]); return; }
        const charIds = [...new Set(data.flatMap((d) => [d.killer_character_id, d.registered_by].filter(Boolean) as string[]))];
        const { data: names } = await supabase.rpc("get_character_names", { char_ids: charIds });
        const nameMap = new Map(((names ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
        setAllKillHistory(data.map((d) => ({
          id: d.id,
          mvp_id: d.mvp_id,
          killed_at: d.killed_at,
          killer_name: d.killer_character_id ? nameMap.get(d.killer_character_id) ?? null : null,
          registered_by_name: nameMap.get(d.registered_by) ?? "?",
          tomb_x: d.tomb_x,
          tomb_y: d.tomb_y,
        })));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  // Filter history for selected MVP
  const killHistory = selectedMvp
    ? allKillHistory.filter((h) => h.mvp_id === selectedMvp.id).slice(0, 20)
    : [];

  const handleSelectMvp = useCallback((mvp: Mvp) => {
    setSelectedMvp(mvp);
    setConfirmingDelete(false);
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
    partyMemberIds: string[];
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
        partyMemberIds: data.partyMemberIds,
      });
    }
    setShowKillModal(false);
  }, [selectedMvp, modalKill, selectedCharId, group, registerKill, editKill]);

  const handleDeleteKill = useCallback(async () => {
    if (!selectedKill) return;
    await deleteKill(selectedKill.kill_id);
    setShowKillModal(false);
  }, [selectedKill, deleteKill]);

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
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar MVP ou mapa..."
            className="w-full rounded-md bg-surface border border-border px-2.5 py-1.5 text-[11px] text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
          />
        </div>

        <button
          onClick={() => { setSelectedMvp(null); setConfirmingDelete(false); }}
          className="px-2 py-1.5 border-b border-border text-left w-full hover:bg-card-hover-bg transition-colors cursor-pointer"
        >
          {group ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">Grupo:</span>
              <span className="text-[10px] text-primary-secondary font-medium">{group.name}</span>
              <span className="text-[10px] text-text-secondary ml-auto">⚙</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary">Modo solo</span>
              <span className="text-[10px] text-text-secondary ml-auto">⚙</span>
            </div>
          )}
        </button>

        <MvpTimerList
          mvps={mvps}
          activeKills={activeKills}
          search={search}
          loading={loading}
          selectedMvpId={selectedMvp?.id ?? null}
          onSelectMvp={handleSelectMvp}
        />
      </div>

      {/* RIGHT PANEL — Detail or Hub (2/3) */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 min-w-0">
        {!selectedMvp ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Hub tabs */}
            {group && (
              <div className="flex gap-1 mb-3">
                <button
                  onClick={() => setHubTab("grupo")}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                    hubTab === "grupo"
                      ? "text-text-primary border-b-2 border-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Grupo
                </button>
                <button
                  onClick={() => setHubTab("stats")}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                    hubTab === "stats"
                      ? "text-text-primary border-b-2 border-primary"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Stats
                </button>
              </div>
            )}
            {(!group || hubTab === "grupo") ? (
              <MvpGroupHub
                group={group}
                members={members}
                characters={characters}
                selectedCharId={selectedCharId}
                serverId={serverId}
                memberNames={memberNames}
                memberUsernames={memberUsernames}
                onCreateGroup={createGroup}
                onUpdateGroup={updateGroup}
                onInviteCharacter={inviteCharacter}
                onLeaveGroup={leaveGroup}
              />
            ) : (
              <MvpGroupStats groupId={group.id} />
            )}
            {userId && (
              <div className="mt-4 pt-4 border-t border-border">
                <TelemetrySettings userId={userId} />
              </div>
            )}
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
                  readOnly
                  heatmapPoints={killHistory
                    .filter((h) => h.tomb_x != null && h.tomb_y != null)
                    .map((h) => ({ x: h.tomb_x!, y: h.tomb_y! }))}
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

            {/* Kill history */}
            {killHistory.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                <p className="text-[10px] text-text-secondary font-semibold">HISTÓRICO ({killHistory.length})</p>
                <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto scrollbar-thin">
                  {killHistory.map((h) => (
                    <div key={h.id} className="flex items-center gap-2 px-2 py-1 rounded text-[10px] bg-surface">
                      <span className="text-text-secondary tabular-nums">
                        {new Date(h.killed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                      <span className="text-text-secondary tabular-nums">
                        {new Date(h.killed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {h.killer_name ? (
                        <span className="text-primary-secondary">{h.killer_name}</span>
                      ) : (
                        <span className="text-text-secondary italic">sem killer</span>
                      )}
                      {h.tomb_x != null && (
                        <span className="text-text-secondary ml-auto">{h.tomb_x},{h.tomb_y}</span>
                      )}
                      <span className="text-text-secondary ml-auto">por {h.registered_by_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                  {!confirmingDelete ? (
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="px-3 py-1.5 text-xs text-status-error-text hover:opacity-80 cursor-pointer transition-opacity"
                    >
                      Excluir
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { handleDeleteKill(); setConfirmingDelete(false); }}
                        className="px-3 py-1.5 text-xs text-white bg-status-error rounded-md hover:opacity-80 cursor-pointer transition-opacity"
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        className="px-3 py-1.5 text-xs text-text-secondary border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Kill modal */}
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
          parties={partiesForModal}
          memberNames={memberNames}
          memberUsernames={memberUsernames}
          killerKillCounts={(() => {
            const map = new Map<string, number>();
            for (const h of killHistory) {
              if (h.killer_name) {
                // Find character_id by name from memberNames
                for (const [charId, name] of memberNames) {
                  if (name === h.killer_name) map.set(charId, (map.get(charId) ?? 0) + 1);
                }
              }
            }
            return map;
          })()}
          onConfirm={handleConfirmKill}
          onDelete={modalKill ? handleDeleteKill : undefined}
          onAcceptLootSuggestions={acceptLootSuggestions}
          onRejectLootSuggestion={rejectLootSuggestion}
          onClose={() => setShowKillModal(false)}
        />
      )}
    </div>
  );
}
