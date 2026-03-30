"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MvpGroup, MvpGroupMember, Character } from "@/lib/types";
import { PremiumGate } from "@/components/tier/premium-gate";
import { useTelemetrySessions } from "@/hooks/use-telemetry-sessions";

interface MvpGroupHubProps {
  group: MvpGroup | null;
  members: MvpGroupMember[];
  characters: Character[];
  selectedCharId: string | null;
  serverId: number | null;
  memberNames: Map<string, string>;
  memberUsernames: Map<string, string>;
  onCreateGroup: (name: string, serverId: number) => Promise<string>;
  onUpdateGroup: (groupId: string, updates: Partial<Pick<MvpGroup, "name" | "alert_minutes" | "discord_channel_id">>) => Promise<void>;
  onInviteCharacter: (groupId: string, characterId: string, userId: string) => Promise<void>;
  onLeaveGroup: (characterId: string) => Promise<void>;
}

interface FriendChar {
  charId: string;
  charName: string;
  userId: string;
  username: string;
}

export function MvpGroupHub({
  group,
  members,
  characters,
  selectedCharId,
  serverId,
  memberNames,
  onCreateGroup,
  onUpdateGroup,
  onInviteCharacter,
  onLeaveGroup,
  memberUsernames,
}: MvpGroupHubProps) {
  // Group creation
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Group name edit
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Invite
  const [showInvite, setShowInvite] = useState(false);
  const [friendChars, setFriendChars] = useState<FriendChar[]>([]);

  // Leave
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const telemetrySessions = useTelemetrySessions(group?.id ?? null);

  // Party (users, not characters)
  const [partyUserIds, setPartyUserIds] = useState<Set<string>>(new Set());
  const [showAddToParty, setShowAddToParty] = useState(false);
  const [addableUsers, setAddableUsers] = useState<{ userId: string; username: string }[]>([]);

  // Load party from DB
  useEffect(() => {
    if (!group) return;
    const supabase = createClient();
    supabase
      .from("mvp_parties")
      .select("id")
      .eq("group_id", group.id)
      .limit(1)
      .single()
      .then(({ data: party }) => {
        if (!party) return;
        supabase
          .from("mvp_party_members")
          .select("character_id")
          .eq("party_id", party.id)
          .then(({ data: partyMembers }) => {
            // Resolve character_ids to user_ids
            const charToUser = new Map<string, string>();
            for (const m of members) charToUser.set(m.character_id, m.user_id);
            const userIds = new Set<string>();
            for (const pm of (partyMembers ?? [])) {
              const uid = charToUser.get(pm.character_id);
              if (uid) userIds.add(uid);
            }
            setPartyUserIds(userIds);
          });
      });
  }, [group, members]);

  // Get unique users in the group
  const groupUsers = (() => {
    const seen = new Map<string, { userId: string; charNames: string[] }>();
    for (const m of members) {
      const existing = seen.get(m.user_id);
      const charName = memberNames.get(m.character_id) ?? "?";
      if (existing) {
        existing.charNames.push(charName);
      } else {
        seen.set(m.user_id, { userId: m.user_id, charNames: [charName] });
      }
    }
    return seen;
  })();

  // Use usernames from parent (no duplicate fetch)
  const usernames = memberUsernames;

  const fetchFriendChars = useCallback(async () => {
    if (!serverId) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("get_friends_characters_by_server", { p_server_id: serverId });
    const memberCharIds = new Set(members.map((m) => m.character_id));
    const eligible = ((data ?? []) as { character_id: string; character_name: string; user_id: string; username: string }[])
      .filter((c) => !memberCharIds.has(c.character_id))
      .map((c) => ({ charId: c.character_id, charName: c.character_name, userId: c.user_id, username: c.username }));
    setFriendChars(eligible);
  }, [serverId, members]);

  // ---- SOLO MODE ----
  if (!group) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-text-secondary text-center">
          Crie um grupo para compartilhar timers de MVP com outros jogadores, ou registre kills solo.
        </p>
        {!showCreateGroup ? (
          <PremiumGate feature="mvp-group">
            <button
              onClick={() => setShowCreateGroup(true)}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer transition-colors"
            >
              Criar Grupo
            </button>
          </PremiumGate>
        ) : (
          <div className="w-full max-w-xs bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Nome do grupo"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") { setShowCreateGroup(false); setNewGroupName(""); }
                if (e.key === "Enter" && newGroupName.trim() && serverId) {
                  onCreateGroup(newGroupName.trim(), serverId).then(() => { setShowCreateGroup(false); setNewGroupName(""); });
                }
              }}
              className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowCreateGroup(false); setNewGroupName(""); }}
                className="px-3 py-1.5 text-xs text-text-secondary border border-border rounded-md hover:text-text-primary cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!newGroupName.trim() || !serverId) return;
                  onCreateGroup(newGroupName.trim(), serverId).then(() => { setShowCreateGroup(false); setNewGroupName(""); });
                }}
                disabled={!newGroupName.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-md hover:bg-primary-hover cursor-pointer disabled:opacity-50 transition-colors"
              >
                Criar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- GROUP MODE ----
  const currentMember = members.find((m) => m.character_id === selectedCharId);
  const isOwner = currentMember?.role === "owner";

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      {/* Card: Grupo */}
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
        {/* Name */}
        {!editingName ? (
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-text-primary">{group.name}</h3>
            <button
              onClick={() => { setEditingName(true); setNameInput(group.name); }}
              className="text-[11px] text-text-secondary hover:text-primary cursor-pointer"
            >
              ✎
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && nameInput.trim()) { onUpdateGroup(group.id, { name: nameInput.trim() }); setEditingName(false); }
                if (e.key === "Escape") setEditingName(false);
              }}
              className="bg-bg border border-border rounded-md px-2.5 py-1 text-lg font-semibold text-text-primary outline-none focus:border-primary transition-colors flex-1"
            />
            <button onClick={() => { if (nameInput.trim()) onUpdateGroup(group.id, { name: nameInput.trim() }); setEditingName(false); }} className="text-xs text-primary cursor-pointer">Salvar</button>
            <button onClick={() => setEditingName(false)} className="text-xs text-text-secondary cursor-pointer">Cancelar</button>
          </div>
        )}

        {/* Members */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-text-secondary font-semibold uppercase">Membros ({members.length})</span>
            <button
              onClick={() => { if (showInvite) { setShowInvite(false); } else { fetchFriendChars(); setShowInvite(true); } }}
              className="text-[10px] text-primary hover:text-text-primary cursor-pointer"
            >
              {showInvite ? "Fechar" : "+ Convidar"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {members.map((m) => {
              const canRemove = isOwner && m.character_id !== selectedCharId && m.role !== "owner";
              return (
                <span key={m.character_id} className="group/member inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-bg border border-border text-text-secondary">
                  {memberNames.get(m.character_id) ?? "?"}
                  {telemetrySessions.some(s => s.userId === m.user_id) && (() => {
                    const userSession = telemetrySessions.find(s => s.userId === m.user_id);
                    const charLabel = userSession?.characterName ?? '?';
                    const locationLabel = userSession?.inInstance
                      ? '(instância)'
                      : (userSession?.currentMap ?? '?');
                    return (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-status-available-text animate-pulse ml-1"
                        title={`Telemetria ativa — ${charLabel} — ${locationLabel}`}
                      />
                    );
                  })()}
                  {m.role === "owner" && <span className="text-primary-secondary ml-1">★</span>}
                  {canRemove && (
                    <button
                      onClick={() => onLeaveGroup(m.character_id)}
                      className="text-status-error-text opacity-0 group-hover/member:opacity-100 transition-opacity cursor-pointer text-[9px] ml-0.5"
                      title="Remover do grupo"
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          {/* Invite panel */}
          {showInvite && (
            <div className="mt-2 bg-bg border border-border rounded-md p-2">
              {friendChars.length === 0 ? (
                <p className="text-[10px] text-text-secondary italic">Nenhum personagem de amigo disponível neste servidor.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {friendChars.map((fc) => (
                    <button
                      key={fc.charId}
                      onClick={async () => {
                        await onInviteCharacter(group.id, fc.charId, fc.userId);
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
        </div>

        {/* Leave group */}
        <div className="pt-3 border-t border-border">
          {!confirmingLeave ? (
            <button onClick={() => setConfirmingLeave(true)} className="text-[11px] text-status-error-text hover:opacity-80 cursor-pointer">
              Sair do grupo
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={async () => { if (selectedCharId) { await onLeaveGroup(selectedCharId); setConfirmingLeave(false); } }}
                className="text-[11px] text-white bg-status-error px-2.5 py-1 rounded-md cursor-pointer"
              >
                Confirmar saída
              </button>
              <button onClick={() => setConfirmingLeave(false)} className="text-[11px] text-text-secondary cursor-pointer">
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card: Party */}
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-text-primary">Party</h3>
          <span className="text-[10px] text-text-secondary">Composição usada ao registrar kills</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {/* Users in party */}
          {[...partyUserIds].map((uid) => {
            const username = usernames.get(uid) ?? "?";
            return (
              <button
                key={uid}
                onClick={() => setPartyUserIds((prev) => { const next = new Set(prev); next.delete(uid); return next; })}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-[color-mix(in_srgb,var(--status-available)_12%,transparent)] border border-status-available text-text-primary cursor-pointer hover:opacity-80 transition-opacity"
                title="Clique para remover"
              >
                @{username} <span className="text-status-available-text">✓</span>
              </button>
            );
          })}

          {/* Add button — fetch friends + group users not in party */}
          {!showAddToParty ? (
            <button
              onClick={async () => {
                if (!serverId) return;
                const supabase = createClient();
                // Get friends on same server
                const { data } = await supabase.rpc("get_friends_characters_by_server", { p_server_id: serverId });
                // Collect unique users (friends + group members)
                const userMap = new Map<string, string>(); // userId -> username
                for (const c of ((data ?? []) as { user_id: string; username: string }[])) {
                  if (!partyUserIds.has(c.user_id)) userMap.set(c.user_id, c.username);
                }
                // Also include group members not in party
                for (const [uid] of groupUsers) {
                  if (!partyUserIds.has(uid) && !userMap.has(uid)) {
                    userMap.set(uid, usernames.get(uid) ?? "?");
                  }
                }
                setAddableUsers([...userMap].map(([userId, username]) => ({ userId, username })));
                setShowAddToParty(true);
              }}
              className="px-2.5 py-1 rounded-full text-[11px] bg-bg border border-border text-primary cursor-pointer hover:border-primary transition-colors"
            >
              + Adicionar
            </button>
          ) : (
            <>
              {addableUsers.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => {
                    setPartyUserIds((prev) => new Set([...prev, u.userId]));
                    setAddableUsers((prev) => prev.filter((x) => x.userId !== u.userId));
                    if (addableUsers.length <= 1) setShowAddToParty(false);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-bg border border-border text-text-secondary cursor-pointer hover:border-primary hover:text-text-primary transition-colors"
                >
                  @{u.username}
                </button>
              ))}
              {addableUsers.length === 0 && (
                <span className="text-[10px] text-text-secondary italic">Nenhum usuário disponível</span>
              )}
              <button
                onClick={() => setShowAddToParty(false)}
                className="px-2.5 py-1 rounded-full text-[11px] bg-bg border border-border text-text-secondary cursor-pointer hover:text-text-primary transition-colors"
              >
                Fechar
              </button>
            </>
          )}
        </div>

        {partyUserIds.size > 0 && (
          <p className="text-[9px] text-text-secondary">Clique em um membro para remover da party.</p>
        )}
      </div>
    </div>
  );
}
