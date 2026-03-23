"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { formatBrtDateTime } from "@/lib/format-date";
import type { InstanceSchedule, ScheduleParticipant, Character } from "@/lib/types";
import type { EligibleFriend } from "@/hooks/use-schedules";
import { calculateCooldownExpiry, isAvailableDay } from "@/lib/cooldown";
import { getLeafClasses } from "@/lib/class-tree";
import { DateTimePicker } from "@/components/ui/datetime-picker";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: InstanceSchedule | null;
  participants: ScheduleParticipant[];
  currentUserId: string | null;
  characters: Character[];
  onJoin: (characterId: string, message?: string) => Promise<void>;
  onLeave: (characterId: string) => Promise<void>;
  onRemoveParticipant: (characterId: string) => Promise<void>;
  onInvite: (characterId: string, userId: string) => Promise<void>;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  onComplete: (confirmedParticipants: { userId: string; characterId: string }[]) => Promise<void>;
  onGenerateInviteCode: (scheduleId: string) => Promise<string>;
  onGetInviteCode: (scheduleId: string) => Promise<string | null>;
  onAddPlaceholder: (scheduleId: string, name: string, className: string) => Promise<void>;
  onRemovePlaceholder: (placeholderId: string) => Promise<void>;
  onGetPlaceholders: (scheduleId: string) => Promise<import("@/lib/types").SchedulePlaceholder[]>;
  onExpire: () => Promise<void>;
  onUpdateTime: (scheduledAt: string) => Promise<void>;
  instanceCooldownType?: string;
  instanceCooldownHours?: number | null;
  instanceAvailableDay?: string | null;
  loading?: boolean;
}

export function ScheduleModal({
  isOpen,
  onClose,
  schedule,
  participants,
  currentUserId,
  characters,
  onJoin,
  onLeave,
  onRemoveParticipant,
  onInvite,
  getEligibleFriends,
  onComplete,
  onGenerateInviteCode,
  onGetInviteCode,
  onAddPlaceholder,
  onRemovePlaceholder,
  onGetPlaceholders,
  onExpire,
  onUpdateTime,
  instanceCooldownType,
  instanceCooldownHours,
  instanceAvailableDay,
  loading,
}: ScheduleModalProps) {
  const [mode, setMode] = useState<"view" | "joining" | "completing" | "inviting">("view");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [checkedParticipants, setCheckedParticipants] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [eligibleFriends, setEligibleFriends] = useState<EligibleFriend[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [placeholders, setPlaceholders] = useState<import("@/lib/types").SchedulePlaceholder[]>([]);
  const [showPlaceholderForm, setShowPlaceholderForm] = useState(false);
  const [placeholderName, setPlaceholderName] = useState("");
  const [placeholderClass, setPlaceholderClass] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [newTime, setNewTime] = useState("");

  // Reset states when switching between schedules
  const scheduleId = schedule?.id ?? null;
  useEffect(() => {
    setMode("view");
    setSelectedCharacterId("");
    setJoinMessage("");
    setCheckedParticipants({});
    setInviteSearch("");
    setShowPlaceholderForm(false);
    setPlaceholderName("");
    setPlaceholderClass("");
    setConfirmingCancel(false);
    setEditingTime(false);
    setNewTime("");
  }, [scheduleId]);

  useEffect(() => {
    if (!isOpen || !schedule) return;
    onGetInviteCode(schedule.id).then(setInviteCode);
    onGetPlaceholders(schedule.id).then(setPlaceholders);
  }, [isOpen, schedule?.id, onGetInviteCode, onGetPlaceholders]);

  const isDirty = mode !== "view" || showPlaceholderForm || confirmingCancel || editingTime;

  if (!schedule) return null;

  const isCreator = currentUserId === schedule.created_by;
  const joinedCharIds = new Set(participants.filter((p) => p.user_id === currentUserId).map((p) => p.character_id));
  const availableCharsToJoin = characters.filter((c) => !joinedCharIds.has(c.id));
  const isLate = schedule.status === "open" && new Date(schedule.scheduled_at) < new Date();

  // Sort participants: creator first
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.user_id === schedule.created_by) return -1;
    if (b.user_id === schedule.created_by) return 1;
    return 0;
  });

  const handleJoinClick = () => {
    setSelectedCharacterId(availableCharsToJoin[0]?.id ?? "");
    setJoinMessage("");
    setMode("joining");
  };

  const handleConfirmJoin = async () => {
    if (!selectedCharacterId) return;
    setActionLoading(true);
    try {
      await onJoin(selectedCharacterId, joinMessage.trim() || undefined);
      setMode("view");
    } finally {
      setActionLoading(false);
    }
  };



  const handleCompleteClick = () => {
    const initial: Record<string, boolean> = {};
    for (const p of participants) {
      initial[p.character_id] = true;
    }
    setCheckedParticipants(initial);
    setMode("completing");
  };

  const handleConfirmComplete = async () => {
    const confirmed = participants
      .filter((p) => checkedParticipants[p.character_id])
      .map((p) => ({ userId: p.user_id, characterId: p.character_id }));
    setActionLoading(true);
    try {
      await onComplete(confirmed);
      setMode("view");
    } finally {
      setActionLoading(false);
    }
  };

  const handleInviteClick = async () => {
    if (!schedule) return;
    setActionLoading(true);
    try {
      const friends = await getEligibleFriends(schedule.instance_id);
      const scheduledAt = new Date(schedule.scheduled_at);
      const alreadyInCharIds = new Set(participants.map((p) => p.character_id));
      alreadyInCharIds.add(schedule.character_id); // creator's original character

      const cooldownFilter = (lastCompleted: string | null) => {
        if (!lastCompleted) return true;
        if (!instanceCooldownType) return true;
        const expiry = calculateCooldownExpiry(
          new Date(lastCompleted),
          instanceCooldownType as "hourly" | "daily" | "three_day" | "weekly",
          instanceCooldownHours ?? null,
          instanceAvailableDay ?? null
        );
        return expiry <= scheduledAt;
      };

      // Friends' characters
      const friendEntries = friends.filter((f) => {
        if (alreadyInCharIds.has(f.character_id)) return false;
        if (!f.is_active) return false;
        return cooldownFilter(f.last_completed_at);
      });

      // Own characters (not already in schedule)
      const ownEntries: EligibleFriend[] = characters
        .filter((c) => !c.isShared && !alreadyInCharIds.has(c.id))
        .map((c) => ({
          user_id: currentUserId!,
          username: schedule.creatorUsername ?? "???",
          avatar_url: schedule.creatorAvatar ?? null,
          character_id: c.id,
          character_name: c.name,
          character_class: c.class,
          character_level: c.level,
          is_active: true,
          last_completed_at: null, // we don't have this easily, assume available
        }));

      setEligibleFriends([...ownEntries, ...friendEntries]);
      setMode("inviting");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmInvite = async (friend: EligibleFriend) => {
    setActionLoading(true);
    try {
      await onInvite(friend.character_id, friend.user_id);
      setEligibleFriends((prev) => prev.filter((f) => f.character_id !== friend.character_id));
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!schedule) return;
    setActionLoading(true);
    try {
      const code = await onGenerateInviteCode(schedule.id);
      setInviteCode(code);
      const url = `${window.location.origin}/invite/${code}`;
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteCode) return;
    const url = `${window.location.origin}/invite/${inviteCode}`;
    await navigator.clipboard.writeText(url);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleExpire = async () => {
    setActionLoading(true);
    try {
      await onExpire();
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddPlaceholder = async () => {
    if (!schedule || !placeholderName.trim() || !placeholderClass.trim()) return;
    setActionLoading(true);
    try {
      await onAddPlaceholder(schedule.id, placeholderName.trim(), placeholderClass.trim());
      const updated = await onGetPlaceholders(schedule.id);
      setPlaceholders(updated);
      setPlaceholderName("");
      setPlaceholderClass("");
      setShowPlaceholderForm(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemovePlaceholder = async (id: string) => {
    setActionLoading(true);
    try {
      await onRemovePlaceholder(id);
      setPlaceholders((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleParticipant = (characterId: string) => {
    setCheckedParticipants((prev) => ({ ...prev, [characterId]: !prev[characterId] }));
  };

  const busy = loading || actionLoading;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={schedule.instanceName ?? "Agendamento"} isDirty={isDirty} footer={
      mode === "view" && schedule.status === "open" ? (
        <div className="flex flex-wrap gap-2 justify-end">
          {!isCreator && availableCharsToJoin.length > 0 && (
            <button
              type="button"
              onClick={handleJoinClick}
              disabled={busy}
              className="px-4 py-2 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
            >
              Participar
            </button>
          )}
          {isCreator && (
            <>
              <button
                type="button"
                onClick={handleInviteClick}
                disabled={busy}
                className="px-4 py-2 text-sm text-[#D4A843] bg-[#2a1f40] border border-[#D4A843]/30 rounded-lg hover:border-[#D4A843] transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy ? "..." : "Convidar"}
              </button>
              {!confirmingCancel ? (
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  disabled={busy}
                  className="px-4 py-2 text-sm text-red-400 bg-[#2a1f40] border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleExpire}
                  disabled={busy}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {busy ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
              )}
              <button
                type="button"
                onClick={handleCompleteClick}
                disabled={busy}
                className="px-4 py-2 text-sm text-white bg-green-700 rounded-lg hover:bg-green-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                Completar
              </button>
            </>
          )}
        </div>
      ) : undefined
    }>
      <div className="flex flex-col gap-4">
        {/* Badges row */}
        <div className="flex flex-wrap gap-2 items-center">
          {isCreator && schedule.status === "open" ? (
            <button
              type="button"
              onClick={() => { setEditingTime(true); setNewTime(schedule.scheduled_at); }}
              className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C] hover:border-[#7C3AED] hover:text-white transition-colors cursor-pointer"
              title="Clique para alterar horário"
            >
              {formatBrtDateTime(schedule.scheduled_at)} ✎
            </button>
          ) : (
            <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C]">
              {formatBrtDateTime(schedule.scheduled_at)}
            </span>
          )}
          {schedule.instanceStartMap && (
            <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#D4A843] border border-[#3D2A5C]">
              {schedule.instanceStartMap}
            </span>
          )}
          {schedule.creatorUsername && (
            <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C]">
              @{schedule.creatorUsername}
            </span>
          )}
          {isLate && (
            <span className="text-xs px-2 py-1 rounded bg-red-900/60 text-red-300 border border-red-800 font-semibold">
              ATRASADA
            </span>
          )}
        </div>

        {/* Edit time picker */}
        {editingTime && (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#0f0a1a] border border-[#3D2A5C]">
            <DateTimePicker
              value={newTime}
              onChange={setNewTime}
              label="Novo horário"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditingTime(false)}
                disabled={busy}
                className="px-3 py-1.5 text-xs text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newTime) return;
                  setActionLoading(true);
                  try {
                    await onUpdateTime(newTime);
                    setEditingTime(false);
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={busy || !newTime}
                className="px-3 py-1.5 text-xs text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        )}

        {/* Creator message */}
        {schedule.message && (
          <p className="text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 italic">
            &ldquo;{schedule.message}&rdquo;
          </p>
        )}

        {/* Completing mode: attendance checklist */}
        {/* Inviting mode */}
        {mode === "inviting" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[#A89BC2] font-medium">Convidar amigos:</p>

            {/* Search */}
            <input
              type="text"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              placeholder="Buscar por personagem, classe ou @username..."
              className="bg-[#1a1230] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
            />

            {(() => {
              const q = inviteSearch.toLowerCase();
              const filtered = eligibleFriends.filter((f) =>
                !q ||
                f.character_name.toLowerCase().includes(q) ||
                f.character_class.toLowerCase().includes(q) ||
                f.username.toLowerCase().includes(q)
              );
              return filtered.length === 0 ? (
                <p className="text-xs text-[#6B5A8A] italic">
                  {eligibleFriends.length === 0
                    ? "Nenhum amigo disponível para esta instância."
                    : "Nenhum resultado encontrado."}
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                  {filtered.map((f) => (
                    <div
                      key={`${f.user_id}-${f.character_id}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2a1f40] border border-[#3D2A5C]"
                    >
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#3D2A5C] flex items-center justify-center text-xs text-[#A89BC2]">?</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium truncate">{f.character_name}</span>
                          <span className="text-xs text-[#6B5A8A]">Lv.{f.character_level}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#A89BC2]">{f.character_class}</span>
                          <span className="text-xs text-[#6B5A8A]">· @{f.username}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleConfirmInvite(f)}
                        disabled={busy}
                        className="text-xs text-[#7C3AED] hover:text-white cursor-pointer disabled:opacity-50 font-medium"
                      >
                        Convidar
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <button
              type="button"
              onClick={() => { setMode("view"); setInviteSearch(""); }}
              className="px-4 py-2 text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer self-end"
            >
              Voltar
            </button>
          </div>
        ) : mode === "completing" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[#A89BC2] font-medium">Confirmar presenca:</p>
            <div className="flex flex-col gap-2">
              {sortedParticipants.map((p) => (
                <label
                  key={p.character_id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2a1f40] border border-[#3D2A5C] cursor-pointer hover:border-[#7C3AED] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checkedParticipants[p.character_id] ?? false}
                    onChange={() => toggleParticipant(p.character_id)}
                    className="accent-[#7C3AED] w-4 h-4"
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {p.avatar_url && (
                      <img
                        src={p.avatar_url}
                        alt=""
                        className="w-6 h-6 rounded-full"
                      />
                    )}
                    <span className="text-sm text-white font-medium truncate">
                      {p.characterName ?? "???"}
                    </span>
                    <span className="text-xs text-[#6B5A8A]">
                      {p.characterClass} Lv.{p.characterLevel}
                    </span>
                    <span className="text-xs text-[#A89BC2]">
                      @{p.username ?? "???"}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMode("view")}
                disabled={busy}
                className="px-4 py-2 text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={busy}
                className="px-4 py-2 text-sm text-white bg-green-700 rounded-lg hover:bg-green-600 transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy ? "Confirmando..." : "Confirmar presenca"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Participant list */}
            <div className="flex flex-col gap-2">
              <p className="text-xs text-[#6B5A8A] font-medium">
                Participantes {!loading && `(${participants.length + placeholders.filter((p) => !p.claimed_by).length})`}
              </p>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : sortedParticipants.length === 0 ? (
                <p className="text-sm text-[#6B5A8A] italic">Nenhum participante ainda.</p>
              ) : (
                sortedParticipants.map((p) => {
                  const isParticipantCreator = p.user_id === schedule.created_by;
                  const canRemove = !isParticipantCreator && (isCreator || p.user_id === currentUserId);
                  return (
                    <div
                      key={p.character_id}
                      className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2a1f40] border border-[#3D2A5C]"
                    >
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt=""
                          className="w-7 h-7 rounded-full"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#3D2A5C] flex items-center justify-center text-xs text-[#A89BC2]">
                          ?
                        </div>
                      )}
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium truncate">
                            {p.characterName ?? "???"}
                          </span>
                          <span className="text-xs text-[#6B5A8A]">
                            {p.characterClass} Lv.{p.characterLevel}
                          </span>
                          {isParticipantCreator && (
                            <span className="text-[10px] text-[#D4A843] font-medium">
                              (organizador)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#A89BC2]">@{p.username ?? "???"}</span>
                          {p.message && (
                            <span className="text-xs text-[#6B5A8A] italic truncate">
                              — {p.message}
                            </span>
                          )}
                        </div>
                      </div>
                      {canRemove && schedule.status === "open" && (
                        <button
                          onClick={() => {
                            if (p.user_id === currentUserId) {
                              onLeave(p.character_id);
                            } else {
                              onRemoveParticipant(p.character_id);
                            }
                          }}
                          disabled={busy}
                          className="text-xs text-red-400 hover:text-red-300 cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          {p.user_id === currentUserId ? "Desinscrever" : "Remover"}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Placeholders (visible to all) */}
            {placeholders.filter((p) => !p.claimed_by).map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2a1f40] border border-[#3D2A5C] opacity-50"
              >
                <div className="w-7 h-7 rounded-full bg-[#3D2A5C] flex items-center justify-center text-xs text-[#6B5A8A]">
                  ?
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium truncate">{p.character_name}</span>
                    <span className="text-xs text-[#6B5A8A]">{p.character_class}</span>
                  </div>
                  <span className="text-[10px] text-yellow-500 font-medium">Aguardando</span>
                </div>
                {isCreator && (
                  <button
                    onClick={() => handleRemovePlaceholder(p.id)}
                    disabled={busy}
                    className="text-xs text-red-400 hover:text-red-300 cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}

            {/* Invite link + Add placeholder (creator only) */}
            {isCreator && schedule.status === "open" && (
              <div className="flex flex-col gap-3 pt-2 border-t border-[#3D2A5C]">
                {/* Invite link */}
                <div className="flex items-center gap-2">
                  {inviteCode ? (
                    <>
                      <input
                        readOnly
                        value={`${window.location.origin}/invite/${inviteCode}`}
                        className="flex-1 bg-[#1a1230] border border-[#3D2A5C] rounded-lg px-3 py-2 text-xs text-[#A89BC2] truncate"
                      />
                      <button
                        onClick={handleCopyInvite}
                        className="px-3 py-2 text-xs text-[#D4A843] bg-[#2a1f40] border border-[#D4A843]/30 rounded-lg hover:border-[#D4A843] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {inviteCopied ? "Copiado!" : "Copiar"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleGenerateInvite}
                      disabled={busy}
                      className="px-4 py-2 text-xs text-[#D4A843] bg-[#2a1f40] border border-[#D4A843]/30 rounded-lg hover:border-[#D4A843] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {busy ? "Gerando..." : "Gerar link de convite"}
                    </button>
                  )}
                </div>

                {/* Add placeholder form */}
                {showPlaceholderForm ? (
                  <div className="flex flex-col gap-2 p-3 rounded-lg bg-[#0f0a1a] border border-[#3D2A5C]">
                    <input
                      type="text"
                      value={placeholderName}
                      onChange={(e) => setPlaceholderName(e.target.value)}
                      placeholder="Nome do personagem"
                      maxLength={24}
                      className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED]"
                    />
                    <input
                      type="text"
                      value={placeholderClass}
                      onChange={(e) => setPlaceholderClass(e.target.value)}
                      placeholder="Classe (ex: Arcano)"
                      maxLength={30}
                      list="class-suggestions"
                      className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED]"
                    />
                    <datalist id="class-suggestions">
                      {getLeafClasses().map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setShowPlaceholderForm(false); setPlaceholderName(""); setPlaceholderClass(""); }}
                        className="px-3 py-1.5 text-xs text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleAddPlaceholder}
                        disabled={busy || !placeholderName.trim() || !placeholderClass.trim()}
                        className="px-3 py-1.5 text-xs text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowPlaceholderForm(true)}
                    className="text-xs text-[#7C3AED] hover:text-white transition-colors cursor-pointer self-start"
                  >
                    + Adicionar personagem externo
                  </button>
                )}
              </div>
            )}

            {/* Joining mode */}
            {mode === "joining" && (
              <div className="flex flex-col gap-3 p-3 rounded-lg bg-[#0f0a1a] border border-[#3D2A5C]">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#6B5A8A]">Personagem</label>
                  <select
                    value={selectedCharacterId}
                    onChange={(e) => setSelectedCharacterId(e.target.value)}
                    disabled={busy}
                    className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-[#A89BC2] focus:outline-none focus:border-[#7C3AED]"
                    style={{ colorScheme: "dark" }}
                  >
                    {availableCharsToJoin.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.class} Lv.{c.level}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#6B5A8A]">Mensagem (opcional)</label>
                  <input
                    type="text"
                    value={joinMessage}
                    onChange={(e) => setJoinMessage(e.target.value)}
                    placeholder="Ex: tenho tudo pronto"
                    disabled={busy}
                    className="bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 text-sm text-[#A89BC2] placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED]"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setMode("view")}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg hover:bg-[#3D2A5C] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmJoin}
                    disabled={busy || !selectedCharacterId}
                    className="px-3 py-1.5 text-sm text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D31D4] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busy ? "Entrando..." : "Confirmar"}
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons moved to modal footer */}
          </>
        )}
      </div>
    </Modal>
  );
}
