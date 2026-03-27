"use client";

import { useState, useCallback, useEffect } from "react";
import type { Account, Character, Mvp, MvpActiveKill } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useMvpData } from "@/hooks/use-mvp-data";
import { useMvpGroups } from "@/hooks/use-mvp-groups";
import { useMvpTimers } from "@/hooks/use-mvp-timers";
import { useMvpParties } from "@/hooks/use-mvp-parties";
import { MvpTimerList } from "./mvp-timer-list";
import { MvpKillModal } from "./mvp-kill-modal";
import { MvpMapPicker } from "./mvp-map-picker";

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

export function MvpTab({ selectedCharId, characters, accounts, onHasUrgentMvp }: MvpTabProps) {
  const [search, setSearch] = useState("");
  const [selectedMvp, setSelectedMvp] = useState<Mvp | null>(null);
  const [showKillModal, setShowKillModal] = useState(false);
  const [modalInitialTime, setModalInitialTime] = useState<string | null>(null);
  const [modalKill, setModalKill] = useState<MvpActiveKill | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyMembers, setNewPartyMembers] = useState<Set<string>>(new Set());
  const [showNewPartyForm, setShowNewPartyForm] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [editingPartyMembers, setEditingPartyMembers] = useState<Set<string>>(new Set());
  const [deletingPartyId, setDeletingPartyId] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [friendChars, setFriendChars] = useState<{ charId: string; charName: string; userId: string; username: string }[]>([]);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");

  // Tick every second for detail panel countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const selectedChar = characters.find((c) => c.id === selectedCharId);
  const account = accounts.find((a) => a.id === selectedChar?.account_id);
  const serverId = account?.server_id ?? null;

  const { mvps, mapMeta, drops, loading: mvpLoading } = useMvpData(serverId);
  const { group, members, loading: groupLoading, createGroup, updateGroup, inviteCharacter, leaveGroup } = useMvpGroups(selectedCharId);
  const { activeKills, loading: killsLoading, registerKill, editKill, deleteKill } = useMvpTimers(group?.id ?? null, serverId);
  const { parties, partyMembers, createParty, updatePartyMembers, deleteParty } = useMvpParties(group?.id ?? null);

  const loading = mvpLoading || groupLoading || killsLoading;

  const partiesForModal = parties.map((p) => ({
    id: p.id,
    name: p.name,
    memberIds: partyMembers.get(p.id) ?? [],
  }));

  // Find active kill for selected MVP
  const selectedKill = selectedMvp ? activeKills.find((k) => k.mvp_id === selectedMvp.id) ?? null : null;

  // Kill history for selected MVP
  const [killHistory, setKillHistory] = useState<KillHistoryEntry[]>([]);
  useEffect(() => {
    if (!selectedMvp) { setKillHistory([]); return; }
    const supabase = createClient();
    supabase
      .from("mvp_kills")
      .select("id, killed_at, tomb_x, tomb_y, killer:characters!killer_character_id(name), registerer:characters!registered_by(name)")
      .eq("mvp_id", selectedMvp.id)
      .order("killed_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setKillHistory((data ?? []).map((d: Record<string, unknown>) => ({
          id: d.id as string,
          killed_at: d.killed_at as string,
          killer_name: (d.killer as { name: string } | null)?.name ?? null,
          registered_by_name: (d.registerer as { name: string } | null)?.name ?? "?",
          tomb_x: d.tomb_x as number | null,
          tomb_y: d.tomb_y as number | null,
        })));
      });
  }, [selectedMvp?.id, activeKills]);

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

        {/* Group info — click to show hub */}
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
          <div className="flex-1 flex flex-col gap-4">
            {/* Group name — editable */}
            {group ? (
              !editingGroupName ? (
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-text-primary">{group.name}</h3>
                  <button
                    onClick={() => { setEditingGroupName(true); setGroupNameInput(group.name); }}
                    className="text-[10px] text-text-secondary hover:text-primary cursor-pointer"
                  >
                    ✎
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && groupNameInput.trim()) {
                        updateGroup(group.id, { name: groupNameInput.trim() });
                        setEditingGroupName(false);
                      }
                      if (e.key === "Escape") setEditingGroupName(false);
                    }}
                    className="bg-bg border border-border rounded-md px-2.5 py-1 text-base font-semibold text-text-primary outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={() => {
                      if (groupNameInput.trim()) updateGroup(group.id, { name: groupNameInput.trim() });
                      setEditingGroupName(false);
                    }}
                    className="text-xs text-primary cursor-pointer"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setEditingGroupName(false)}
                    className="text-xs text-text-secondary cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )
            ) : (
              <h3 className="text-base font-semibold text-text-primary">Modo Solo</h3>
            )}

            {/* Group members + invite + leave */}
            {group && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[10px] text-text-secondary font-semibold">MEMBROS ({members.length})</p>
                  <button
                    onClick={async () => {
                      if (showInvite) { setShowInvite(false); return; }
                      // Fetch friends' characters on same server
                      const supabase = createClient();
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user || !serverId) return;

                      // Get accepted friends
                      const { data: friendships } = await supabase
                        .from("friendships")
                        .select("requester_id, addressee_id")
                        .eq("status", "accepted");

                      const friendUserIds = (friendships ?? []).map((f) =>
                        f.requester_id === user.id ? f.addressee_id : f.requester_id
                      );

                      if (friendUserIds.length === 0) { setFriendChars([]); setShowInvite(true); return; }

                      // Get their characters on the same server
                      const { data: chars } = await supabase
                        .from("characters")
                        .select("id, name, user_id, account_id")
                        .in("user_id", friendUserIds)
                        .eq("is_active", true);

                      const { data: accs } = await supabase
                        .from("accounts")
                        .select("id, server_id")
                        .eq("server_id", serverId);

                      const accIds = new Set((accs ?? []).map((a) => a.id));
                      const memberCharIds = new Set(members.map((m) => m.character_id));

                      // Get usernames
                      const { data: profiles } = await supabase
                        .from("profiles")
                        .select("id, username")
                        .in("id", friendUserIds);
                      const usernameMap = new Map((profiles ?? []).map((p) => [p.id, p.username ?? "?"]));

                      const eligible = (chars ?? [])
                        .filter((c) => accIds.has(c.account_id) && !memberCharIds.has(c.id))
                        .map((c) => ({
                          charId: c.id,
                          charName: c.name,
                          userId: c.user_id,
                          username: usernameMap.get(c.user_id) ?? "?",
                        }));

                      setFriendChars(eligible);
                      setShowInvite(true);
                    }}
                    className="text-[10px] text-primary hover:text-text-primary cursor-pointer"
                  >
                    {showInvite ? "Fechar" : "+ Convidar"}
                  </button>
                </div>

                {/* Member list */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {members.map((m) => {
                    const char = characters.find((c) => c.id === m.character_id);
                    return (
                      <span key={m.character_id} className="px-2 py-0.5 rounded-full text-[10px] bg-surface border border-border text-text-secondary">
                        {char?.name ?? "?"}
                        {m.role === "owner" && <span className="text-primary-secondary ml-1">★</span>}
                      </span>
                    );
                  })}
                </div>

                {/* Invite friends */}
                {showInvite && (
                  <div className="bg-surface border border-border rounded-md p-2 mb-2">
                    {friendChars.length === 0 ? (
                      <p className="text-[10px] text-text-secondary italic">Nenhum personagem de amigo disponível neste servidor.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {friendChars.map((fc) => (
                          <button
                            key={fc.charId}
                            onClick={async () => {
                              await inviteCharacter(group.id, fc.charId, fc.userId);
                              setFriendChars((prev) => prev.filter((c) => c.charId !== fc.charId));
                            }}
                            className="flex items-center gap-2 px-2 py-1 rounded text-[10px] hover:bg-card-hover-bg transition-colors cursor-pointer text-left"
                          >
                            <span className="text-text-primary">{fc.charName}</span>
                            <span className="text-text-secondary">@{fc.username}</span>
                            <span className="text-primary ml-auto">+ Convidar</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Leave group */}
                {selectedCharId && (
                  <div className="mt-1">
                    {!confirmingLeave ? (
                      <button
                        onClick={() => setConfirmingLeave(true)}
                        className="text-[10px] text-status-error-text hover:opacity-80 cursor-pointer"
                      >
                        Sair do grupo
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await leaveGroup(selectedCharId);
                            setConfirmingLeave(false);
                          }}
                          className="text-[10px] text-white bg-status-error px-2 py-0.5 rounded-md cursor-pointer"
                        >
                          Confirmar saída
                        </button>
                        <button
                          onClick={() => setConfirmingLeave(false)}
                          className="text-[10px] text-text-secondary cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Parties management */}
            {group && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] text-text-secondary font-semibold">PARTIES ({parties.length})</p>
                  {!showNewPartyForm && (
                    <button
                      onClick={() => setShowNewPartyForm(true)}
                      className="text-[10px] text-primary hover:text-text-primary cursor-pointer"
                    >
                      + Nova
                    </button>
                  )}
                </div>

                {/* New party form */}
                {showNewPartyForm && (
                  <div className="bg-surface border border-border rounded-md p-3 mb-2 flex flex-col gap-2">
                    <input
                      type="text"
                      value={newPartyName}
                      onChange={(e) => setNewPartyName(e.target.value)}
                      placeholder="Nome da party"
                      className="bg-bg border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
                    />
                    <div className="flex flex-wrap gap-1">
                      {members.map((m) => {
                        const char = characters.find((c) => c.id === m.character_id);
                        const isIn = newPartyMembers.has(m.character_id);
                        return (
                          <button
                            key={m.character_id}
                            type="button"
                            onClick={() => setNewPartyMembers((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.character_id)) next.delete(m.character_id);
                              else next.add(m.character_id);
                              return next;
                            })}
                            className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors ${
                              isIn
                                ? "bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] border border-status-available text-text-primary"
                                : "bg-bg border border-border text-text-secondary hover:border-primary"
                            }`}
                          >
                            {char?.name ?? "?"} {isIn ? "✓" : ""}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setShowNewPartyForm(false); setNewPartyName(""); setNewPartyMembers(new Set()); }}
                        className="px-2.5 py-1 text-xs text-text-secondary border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={async () => {
                          if (!newPartyName.trim() || !group) return;
                          await createParty(group.id, newPartyName.trim(), [...newPartyMembers]);
                          setShowNewPartyForm(false);
                          setNewPartyName("");
                          setNewPartyMembers(new Set());
                        }}
                        disabled={!newPartyName.trim()}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        Criar
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing parties */}
                <div className="flex flex-col gap-2">
                  {parties.map((party) => {
                    const memberIds = partyMembers.get(party.id) ?? [];
                    const isEditing = editingPartyId === party.id;
                    const isDeleting = deletingPartyId === party.id;
                    return (
                      <div key={party.id} className="bg-surface border border-border rounded-md p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-text-primary font-medium">{party.name}</span>
                          <div className="flex gap-2">
                            {!isEditing && !isDeleting && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingPartyId(party.id);
                                    setEditingPartyMembers(new Set(memberIds));
                                  }}
                                  className="text-[10px] text-text-secondary hover:text-primary cursor-pointer"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => setDeletingPartyId(party.id)}
                                  className="text-[10px] text-status-error-text hover:opacity-80 cursor-pointer"
                                >
                                  Excluir
                                </button>
                              </>
                            )}
                            {isDeleting && (
                              <div className="flex gap-2">
                                <button
                                  onClick={async () => { await deleteParty(party.id); setDeletingPartyId(null); }}
                                  className="text-[10px] text-white bg-status-error px-2 py-0.5 rounded-md cursor-pointer"
                                >
                                  Confirmar exclusão
                                </button>
                                <button
                                  onClick={() => setDeletingPartyId(null)}
                                  className="text-[10px] text-text-secondary cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {isEditing ? (
                            <>
                              {members.map((m) => {
                                const char = characters.find((c) => c.id === m.character_id);
                                const isIn = editingPartyMembers.has(m.character_id);
                                return (
                                  <button
                                    key={m.character_id}
                                    type="button"
                                    onClick={() => setEditingPartyMembers((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(m.character_id)) next.delete(m.character_id);
                                      else next.add(m.character_id);
                                      return next;
                                    })}
                                    className={`px-2 py-0.5 rounded-full text-[10px] cursor-pointer transition-colors ${
                                      isIn
                                        ? "bg-[color-mix(in_srgb,var(--status-available)_15%,transparent)] border border-status-available text-text-primary"
                                        : "bg-bg border border-border text-text-secondary hover:border-primary"
                                    }`}
                                  >
                                    {char?.name ?? "?"} {isIn ? "✓" : ""}
                                  </button>
                                );
                              })}
                              <div className="w-full flex gap-2 justify-end mt-1">
                                <button
                                  onClick={() => setEditingPartyId(null)}
                                  className="text-[10px] text-text-secondary cursor-pointer"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={async () => {
                                    await updatePartyMembers(party.id, [...editingPartyMembers]);
                                    setEditingPartyId(null);
                                  }}
                                  className="text-[10px] text-white bg-primary px-2 py-0.5 rounded-md cursor-pointer"
                                >
                                  Salvar
                                </button>
                              </div>
                            </>
                          ) : (
                            memberIds.map((cId) => {
                              const char = characters.find((c) => c.id === cId);
                              return (
                                <span key={cId} className="px-2 py-0.5 rounded-full text-[10px] bg-bg border border-border text-text-secondary">
                                  {char?.name ?? "?"}
                                </span>
                              );
                            })
                          )}
                          {!isEditing && memberIds.length === 0 && (
                            <span className="text-[10px] text-text-secondary italic">Sem membros</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Group settings */}
            {group && (
              <div className="mt-2">
                <p className="text-[10px] text-text-secondary font-semibold mb-2">CONFIGURAÇÕES</p>
                <div className="bg-surface border border-border rounded-md p-3 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">Alerta antes do spawn:</span>
                    <div className="flex gap-1">
                      {([5, 10, 15] as const).map((mins) => (
                        <button
                          key={mins}
                          onClick={() => updateGroup(group.id, { alert_minutes: mins })}
                          className={`px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
                            group.alert_minutes === mins
                              ? "bg-primary text-white"
                              : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {mins}min
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-text-secondary">Canal Discord (ID):</span>
                    <input
                      type="text"
                      defaultValue={group.discord_channel_id ?? ""}
                      placeholder="Cole o ID do canal"
                      onBlur={(e) => {
                        const val = e.target.value.trim() || null;
                        if (val !== group.discord_channel_id) {
                          updateGroup(group.id, { discord_channel_id: val });
                        }
                      }}
                      className="bg-bg border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
                    />
                    <span className="text-[9px] text-text-secondary">
                      Clique direito no canal do Discord → Copiar ID do canal
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!group && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-text-secondary">
                  Crie um grupo para compartilhar timers de MVP com outros jogadores, ou registre kills solo.
                </p>
                {!showCreateGroup ? (
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="self-start px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer transition-colors"
                  >
                    Criar Grupo
                  </button>
                ) : (
                  <div className="bg-surface border border-border rounded-md p-3 flex flex-col gap-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Nome do grupo"
                      autoFocus
                      className="bg-bg border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setShowCreateGroup(false); setNewGroupName(""); }
                      }}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setShowCreateGroup(false); setNewGroupName(""); }}
                        className="px-2.5 py-1 text-xs text-text-secondary border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={async () => {
                          if (!newGroupName.trim() || !serverId) return;
                          await createGroup(newGroupName.trim(), serverId);
                          setShowCreateGroup(false);
                          setNewGroupName("");
                        }}
                        disabled={!newGroupName.trim()}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        Criar
                      </button>
                    </div>
                  </div>
                )}
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
          parties={partiesForModal}
          onConfirm={handleConfirmKill}
          onDelete={modalKill ? handleDeleteKill : undefined}
          onClose={() => setShowKillModal(false)}
        />
      )}
    </div>
  );
}
