"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { formatBrtDateTime } from "@/lib/format-date";
import type { InstanceSchedule, ScheduleParticipant, Character } from "@/lib/types";
import type { EligibleFriend, EligibleCharacter } from "@/hooks/use-schedules";
import { calculateCooldownExpiry } from "@/lib/cooldown";
import { getLeafClasses } from "@/lib/class-tree";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { SlotTypeIcon } from "@/components/ui/slot-type-icon";
import { SLOT_TYPES, SLOT_TYPE_LABELS, SLOT_TYPE_DESCRIPTIONS, SLOT_TYPE_COLORS } from "@/lib/class-roles";
import type { SlotType } from "@/lib/class-roles";

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
  onAddPlaceholder: (scheduleId: string, slotType: SlotType, slotLabel: string, slotClass: string | null) => Promise<void>;
  onRemovePlaceholder: (placeholderId: string) => Promise<void>;
  onGetPlaceholders: (scheduleId: string) => Promise<import("@/lib/types").SchedulePlaceholder[]>;
  onClaimPlaceholder: (placeholderId: string, characterId: string) => Promise<void>;
  onUnclaimPlaceholder: (placeholderId: string) => Promise<void>;
  onGetEligibleForPlaceholder: (placeholderId: string) => Promise<EligibleCharacter[]>;
  onExpire: () => Promise<void>;
  onUpdateTime: (scheduledAt: string) => Promise<void>;
  onUpdateTitle: (title: string) => Promise<void>;
  getScheduledCharsWithTimes: (instanceId: number) => Promise<{ character_id: string; scheduled_at: string }[]>;
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
  onAddPlaceholder,
  onRemovePlaceholder,
  onGetPlaceholders,
  onClaimPlaceholder,
  onUnclaimPlaceholder,
  onGetEligibleForPlaceholder,
  onExpire,
  onUpdateTime,
  onUpdateTitle,
  getScheduledCharsWithTimes,
  instanceCooldownType,
  instanceCooldownHours,
  instanceAvailableDay,
  loading,
}: ScheduleModalProps) {
  const [mode, setMode] = useState<"view" | "joining" | "completing">("view");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [checkedParticipants, setCheckedParticipants] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [eligibleFriends, setEligibleFriends] = useState<EligibleFriend[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [placeholders, setPlaceholders] = useState<import("@/lib/types").SchedulePlaceholder[]>([]);
  const [showPlaceholderForm, setShowPlaceholderForm] = useState(false);
  const [placeholderSlotType, setPlaceholderSlotType] = useState<SlotType>("dps_fisico");
  const [placeholderClass, setPlaceholderClass] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [newTime, setNewTime] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [assigningPlaceholderId, setAssigningPlaceholderId] = useState<string | null>(null);
  const [eligibleForSlot, setEligibleForSlot] = useState<EligibleCharacter[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);

  // Reset states when switching between schedules
  const scheduleId = schedule?.id ?? null;
  useEffect(() => {
    setMode("view");
    setSelectedCharacterId("");
    setJoinMessage("");
    setCheckedParticipants({});
    setSearch("");
    setShowPlaceholderForm(false);
    setPlaceholderSlotType("dps_fisico");
    setPlaceholderClass("");
    setConfirmingCancel(false);
    setEditingTime(false);
    setNewTime("");
    setEditingTitle(false);
    setTitleInput("");
    setFriendsLoaded(false);
    setAssigningPlaceholderId(null);
  }, [scheduleId]);

  useEffect(() => {
    if (!isOpen || !schedule) return;
    onGetPlaceholders(schedule.id).then(setPlaceholders);
  }, [isOpen, schedule?.id, onGetPlaceholders]);

  // Load eligible friends for inline list (creator only)
  useEffect(() => {
    if (!isOpen || !schedule || friendsLoaded) return;
    const isCreator = currentUserId === schedule.created_by;
    if (!isCreator) return;

    Promise.all([
      getEligibleFriends(schedule.instance_id),
      getScheduledCharsWithTimes(schedule.instance_id),
    ]).then(([friends, scheduledCharsWithTimes]) => {
      const thisScheduleAt = new Date(schedule.scheduled_at);
      const alreadyInCharIds = new Set(participants.map((p) => p.character_id));
      alreadyInCharIds.add(schedule.character_id);

      // Check if a character has a cooldown-conflicting schedule (same cooldown period)
      const hasConflictingSchedule = (charId: string) => {
        if (!instanceCooldownType) return false;
        const ct = instanceCooldownType as "hourly" | "daily" | "three_day" | "weekly";
        const ch = instanceCooldownHours ?? null;
        const ad = instanceAvailableDay ?? null;
        return scheduledCharsWithTimes
          .filter((s) => s.character_id === charId)
          .some((s) => {
            const existingTime = new Date(s.scheduled_at);
            const expiryFromExisting = calculateCooldownExpiry(existingTime, ct, ch, ad);
            const expiryFromNew = calculateCooldownExpiry(thisScheduleAt, ct, ch, ad);
            return thisScheduleAt < expiryFromExisting && existingTime < expiryFromNew;
          });
      };

      const cooldownFilter = (lastCompleted: string | null) => {
        if (!lastCompleted) return true;
        if (!instanceCooldownType) return true;
        const expiry = calculateCooldownExpiry(
          new Date(lastCompleted),
          instanceCooldownType as "hourly" | "daily" | "three_day" | "weekly",
          instanceCooldownHours ?? null,
          instanceAvailableDay ?? null
        );
        return expiry <= thisScheduleAt;
      };

      const friendEntries = friends.filter((f) => {
        if (alreadyInCharIds.has(f.character_id)) return false;
        if (hasConflictingSchedule(f.character_id)) return false;
        if (!f.is_active) return false;
        return cooldownFilter(f.last_completed_at);
      });

      const ownEntries: EligibleFriend[] = characters
        .filter((c) => !alreadyInCharIds.has(c.id) && !hasConflictingSchedule(c.id))
        .map((c) => ({
          user_id: currentUserId!,
          username: schedule.creatorUsername ?? "???",
          avatar_url: schedule.creatorAvatar ?? null,
          character_id: c.id,
          character_name: c.name,
          character_class: c.class,
          character_level: c.level,
          is_active: true,
          last_completed_at: null,
        }));

      setEligibleFriends([...ownEntries, ...friendEntries]);
      setFriendsLoaded(true);
    });
  }, [isOpen, schedule, currentUserId, participants, characters, friendsLoaded, getEligibleFriends, getScheduledCharsWithTimes, instanceCooldownType, instanceCooldownHours, instanceAvailableDay]);

  const isDirty = mode !== "view" || showPlaceholderForm || confirmingCancel || editingTime || editingTitle || assigningPlaceholderId !== null;

  if (!schedule) return null;

  const isCreator = currentUserId === schedule.created_by;
  const joinedCharIds = new Set(participants.filter((p) => p.user_id === currentUserId).map((p) => p.character_id));
  const availableCharsToJoin = characters.filter((c) => !joinedCharIds.has(c.id));
  const isLate = schedule.status === "open" && new Date(schedule.scheduled_at) < new Date();

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
    // Include claimed placeholder characters
    for (const p of placeholders) {
      if (p.claimed_character_id) {
        initial[p.claimed_character_id] = true;
      }
    }
    setCheckedParticipants(initial);
    setMode("completing");
  };

  const handleConfirmComplete = async () => {
    const confirmed = participants
      .filter((p) => checkedParticipants[p.character_id])
      .map((p) => ({ userId: p.user_id, characterId: p.character_id }));

    // Include claimed placeholder characters that are checked
    for (const p of placeholders) {
      if (p.claimed_character_id && p.claimed_by && checkedParticipants[p.claimed_character_id]) {
        confirmed.push({ userId: p.claimed_by, characterId: p.claimed_character_id });
      }
    }

    setActionLoading(true);
    try {
      await onComplete(confirmed);
      setMode("view");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddFromList = async (f: EligibleFriend) => {
    setActionLoading(true);
    try {
      if (f.user_id === currentUserId) {
        await onJoin(f.character_id);
      } else {
        await onInvite(f.character_id, f.user_id);
      }
      setEligibleFriends((prev) => prev.filter((e) => e.character_id !== f.character_id));
    } finally {
      setActionLoading(false);
    }
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
    if (!schedule) return;
    setActionLoading(true);
    try {
      const label = placeholderSlotType === "class" ? placeholderClass.trim() : SLOT_TYPE_LABELS[placeholderSlotType];
      const slotClass = placeholderSlotType === "class" ? placeholderClass.trim() : null;
      await onAddPlaceholder(schedule.id, placeholderSlotType, label, slotClass);
      setShowPlaceholderForm(false);
      setPlaceholderClass("");
      const updated = await onGetPlaceholders(schedule.id);
      setPlaceholders(updated);
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

  const handleAssignClick = async (placeholderId: string) => {
    setAssigningPlaceholderId(placeholderId);
    setEligibleLoading(true);
    try {
      const eligible = await onGetEligibleForPlaceholder(placeholderId);
      setEligibleForSlot(eligible);
    } finally {
      setEligibleLoading(false);
    }
  };

  const handleClaimPlaceholder = async (placeholderId: string, characterId: string) => {
    setActionLoading(true);
    try {
      await onClaimPlaceholder(placeholderId, characterId);
      setAssigningPlaceholderId(null);
      const updated = await onGetPlaceholders(schedule.id);
      setPlaceholders(updated);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnclaimPlaceholder = async (placeholderId: string) => {
    setActionLoading(true);
    try {
      await onUnclaimPlaceholder(placeholderId);
      const updated = await onGetPlaceholders(schedule.id);
      setPlaceholders(updated);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveTitle = async () => {
    setActionLoading(true);
    try {
      await onUpdateTitle(titleInput.trim());
      setEditingTitle(false);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleParticipant = (characterId: string) => {
    setCheckedParticipants((prev) => ({ ...prev, [characterId]: !prev[characterId] }));
  };

  const busy = loading || actionLoading;

  // Filter search results
  const q = search.toLowerCase().trim();
  const filteredEligible = q
    ? eligibleFriends.filter((f) =>
        f.character_name.toLowerCase().includes(q) ||
        f.character_class.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q)
      )
    : eligibleFriends;

  // Modal title
  const modalTitle = schedule.title
    ? `${schedule.instanceName ?? "Instância"} — ${schedule.title}`
    : (schedule.instanceName ?? "Agendamento");

  // Footer for creator in view mode
  const footer = mode === "view" && schedule.status === "open" ? (
    <div className="flex items-center gap-2">
      {/* Right: actions */}
      <div className="flex gap-2 ml-auto">
        {!isCreator && availableCharsToJoin.length > 0 && (
          <button
            type="button"
            onClick={handleJoinClick}
            disabled={busy}
            className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            Participar
          </button>
        )}
        {isCreator && (
          <>
            {!confirmingCancel ? (
              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                disabled={busy}
                className="px-4 py-2 text-sm text-status-error bg-surface border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar agendamento
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExpire}
                disabled={busy}
                className="px-4 py-2 text-sm text-white bg-status-error rounded-lg hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            )}
            <button
              type="button"
              onClick={handleCompleteClick}
              disabled={busy}
              className="px-4 py-2 text-sm text-white bg-status-available rounded-lg hover:bg-status-available/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              Completar
            </button>
          </>
        )}
      </div>
    </div>
  ) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} isDirty={isDirty} footer={footer}>
      <div className="flex flex-col gap-4">
        {/* Badges row */}
        <div className="flex flex-wrap gap-2 items-center">
          {isCreator && schedule.status === "open" ? (
            <button
              type="button"
              onClick={() => { setEditingTime(true); setNewTime(schedule.scheduled_at); }}
              className="text-xs px-2 py-1 rounded bg-surface text-text-secondary border border-border hover:border-primary hover:text-text-primary transition-colors cursor-pointer"
              title="Clique para alterar horário"
            >
              {formatBrtDateTime(schedule.scheduled_at)} BRT ✎
            </button>
          ) : (
            <span className="text-xs px-2 py-1 rounded bg-surface text-text-secondary border border-border">
              {formatBrtDateTime(schedule.scheduled_at)} BRT
            </span>
          )}
          {schedule.instanceStartMap && (
            <span className="text-xs px-2 py-1 rounded bg-surface text-primary-secondary border border-border">
              {schedule.instanceStartMap}
            </span>
          )}
          {schedule.creatorUsername && (
            <span className="text-xs px-2 py-1 rounded bg-surface text-text-secondary border border-border">
              @{schedule.creatorUsername}
            </span>
          )}
          {isLate && (
            <span className="text-xs px-2 py-1 rounded bg-status-error/20 text-status-error-text border border-status-error/30 font-semibold">
              ATRASADA
            </span>
          )}
        </div>

        {/* Editable title */}
        {isCreator && schedule.status === "open" && !editingTitle && (
          <button
            type="button"
            onClick={() => { setEditingTitle(true); setTitleInput(schedule.title ?? ""); }}
            className="text-left text-sm text-primary-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            {schedule.title ? (
              <span>{schedule.title} ✎</span>
            ) : (
              <span className="text-text-secondary italic">+ Adicionar título</span>
            )}
          </button>
        )}
        {!isCreator && schedule.title && (
          <span className="text-sm text-primary-secondary">{schedule.title}</span>
        )}

        {/* Edit title form */}
        {editingTitle && (
          <div className="flex gap-2">
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Título do agendamento"
              maxLength={60}
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveTitle}
              disabled={busy}
              className="px-3 py-1.5 text-xs text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditingTitle(false)}
              className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-lg hover:bg-border transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Edit time picker */}
        {editingTime && (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-bg border border-border">
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
                className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-lg hover:bg-border transition-colors cursor-pointer"
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
                className="px-3 py-1.5 text-xs text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        )}

        {/* Creator message */}
        {schedule.message && (
          <p className="text-sm text-text-secondary bg-surface border border-border rounded-lg px-3 py-2 italic">
            &ldquo;{schedule.message}&rdquo;
          </p>
        )}

        {/* Completing mode: attendance checklist */}
        {mode === "completing" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary font-medium">Confirmar presenca:</p>
            <div className="flex flex-col gap-2">
              {sortedParticipants.map((p) => (
                <label
                  key={p.character_id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border cursor-pointer hover:border-primary transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checkedParticipants[p.character_id] ?? false}
                    onChange={() => toggleParticipant(p.character_id)}
                    className="accent-primary w-4 h-4"
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {p.avatar_url && (
                      <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                    )}
                    <span className="text-sm text-text-primary font-medium truncate">
                      {p.characterName ?? "???"}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {p.characterClass} Lv.{p.characterLevel}
                    </span>
                    <span className="text-xs text-text-secondary">
                      @{p.username ?? "???"}
                    </span>
                  </div>
                </label>
              ))}
              {/* Claimed placeholder characters */}
              {placeholders.filter(p => p.claimed_by && p.characters).map((p) => (
                <label
                  key={p.claimed_character_id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border cursor-pointer hover:border-primary transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checkedParticipants[p.claimed_character_id!] ?? false}
                    onChange={() => toggleParticipant(p.claimed_character_id!)}
                    className="accent-primary w-4 h-4"
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {p.profiles?.avatar_url && (
                      <img src={p.profiles.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                    )}
                    <span className="text-sm text-text-primary font-medium truncate">
                      {p.characters!.name}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {p.characters!.class} Lv.{p.characters!.level}
                    </span>
                    <span className="text-xs text-text-secondary">
                      @{p.profiles?.username ?? "???"}
                    </span>
                    <span className="text-[10px] text-primary-secondary font-medium">(vaga)</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMode("view")}
                disabled={busy}
                className="px-4 py-2 text-sm text-text-secondary bg-surface border border-border rounded-lg hover:bg-border transition-colors cursor-pointer disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={busy}
                className="px-4 py-2 text-sm text-white bg-status-available rounded-lg hover:bg-status-available/80 transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy ? "Confirmando..." : "Confirmar presenca"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Participant list */}
            <div className="flex flex-col gap-2">
              <p className="text-xs text-text-secondary font-medium">
                Participantes {!loading && `(${participants.length + placeholders.length})`}
              </p>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : sortedParticipants.length === 0 ? (
                <p className="text-sm text-text-secondary italic">Nenhum participante ainda.</p>
              ) : (
                (() => {
                const creatorCharCount = sortedParticipants.filter(p => p.user_id === schedule.created_by).length;
                return sortedParticipants.map((p) => {
                  const isParticipantCreator = p.user_id === schedule.created_by;
                  const canRemove = isCreator
                    ? (p.user_id !== schedule.created_by || creatorCharCount > 1)
                    : p.user_id === currentUserId;
                  return (
                    <div
                      key={p.character_id}
                      className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border"
                    >
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-xs text-text-secondary">?</div>
                      )}
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary font-medium truncate">
                            {p.characterName ?? "???"}
                          </span>
                          <span className="text-xs text-text-secondary">
                            {p.characterClass} Lv.{p.characterLevel}
                          </span>
                          {isParticipantCreator && (
                            <span className="text-[10px] text-primary-secondary font-medium">(organizador)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-secondary">@{p.username ?? "???"}</span>
                          {p.message && (
                            <span className="text-xs text-text-secondary italic truncate">— {p.message}</span>
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
                          className="text-xs text-status-error hover:text-status-error-text cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          {p.user_id === currentUserId ? "Desinscrever" : "Remover"}
                        </button>
                      )}
                    </div>
                  );
                });
                })()
              )}
            </div>

            {/* Placeholders */}
            {placeholders.map((p) => {
              const isFilled = p.claimed_by && p.characters;
              if (isFilled) {
                return (
                  <div
                    key={p.id}
                    className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border"
                  >
                    {p.profiles?.avatar_url ? (
                      <img src={p.profiles.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-xs text-text-secondary">?</div>
                    )}
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary font-medium truncate">{p.characters!.name}</span>
                        <span className="text-xs text-text-secondary">{p.characters!.class} Lv.{p.characters!.level}</span>
                      </div>
                      <span className="text-xs text-text-secondary">@{p.profiles?.username ?? "???"}</span>
                    </div>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)]"
                      style={{
                        background: `color-mix(in srgb, ${SLOT_TYPE_COLORS[p.slot_type]} 15%, transparent)`,
                        color: SLOT_TYPE_COLORS[p.slot_type],
                      }}
                    >
                      {p.slot_label}
                    </span>
                    {isCreator && schedule.status === "open" && (
                      <>
                        <button
                          onClick={() => handleUnclaimPlaceholder(p.id)}
                          disabled={busy}
                          className="text-xs text-primary-secondary hover:text-text-primary cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          Liberar
                        </button>
                        <button
                          onClick={() => handleRemovePlaceholder(p.id)}
                          disabled={busy}
                          className="text-xs text-status-error hover:text-status-error-text cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                );
              }

              return (
                <div key={p.id} className="flex flex-col">
                  <div className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-border">
                    <SlotTypeIcon type={p.slot_type} size={28} />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm text-text-secondary italic">Vaga aberta</span>
                      <span className="text-[10px] text-text-secondary">{SLOT_TYPE_DESCRIPTIONS[p.slot_type]}</span>
                    </div>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-[var(--radius-sm)]"
                      style={{
                        background: `color-mix(in srgb, ${SLOT_TYPE_COLORS[p.slot_type]} 15%, transparent)`,
                        color: SLOT_TYPE_COLORS[p.slot_type],
                      }}
                    >
                      {p.slot_label}
                    </span>
                    {isCreator && schedule.status === "open" && (
                      <>
                        <button
                          onClick={() => handleAssignClick(p.id)}
                          disabled={busy}
                          className="text-xs text-primary hover:text-text-primary cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          Atribuir
                        </button>
                        <button
                          onClick={() => handleRemovePlaceholder(p.id)}
                          disabled={busy}
                          className="text-xs text-status-error hover:text-status-error-text cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                  {assigningPlaceholderId === p.id && (
                    <div className="flex flex-col gap-1 mt-1 p-2 rounded-lg bg-bg border border-border max-h-40 overflow-y-auto">
                      {eligibleLoading ? (
                        <div className="flex items-center justify-center py-2">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : eligibleForSlot.length === 0 ? (
                        <p className="text-xs text-text-secondary italic px-2 py-1">Nenhum personagem elegível</p>
                      ) : (
                        eligibleForSlot.map((c) => (
                          <button
                            key={c.character_id}
                            type="button"
                            onClick={() => handleClaimPlaceholder(p.id, c.character_id)}
                            disabled={busy}
                            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {c.avatar_url ? (
                              <img src={c.avatar_url} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-border flex items-center justify-center text-[10px] text-text-secondary flex-shrink-0">?</span>
                            )}
                            <span className="text-text-primary truncate">{c.character_name}</span>
                            <span className="text-text-secondary">{c.character_class} Lv.{c.character_level}</span>
                            <span className="text-text-secondary">@{c.username}</span>
                          </button>
                        ))
                      )}
                      <button
                        type="button"
                        onClick={() => setAssigningPlaceholderId(null)}
                        className="text-xs text-text-secondary hover:text-text-primary cursor-pointer mt-1 text-center"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Inline search + add list (creator only, open schedule) */}
            {isCreator && schedule.status === "open" && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar personagem ou amigo..."
                  className="w-full rounded-lg bg-bg border border-border px-3 py-2 text-xs text-text-primary placeholder-text-secondary outline-none focus:border-primary transition-colors"
                />

                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                  {/* First option: add placeholder slot */}
                  {!showPlaceholderForm ? (
                    <button
                      type="button"
                      onClick={() => setShowPlaceholderForm(true)}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-xs hover:bg-surface transition-colors cursor-pointer text-primary"
                    >
                      <span className="w-5 h-5 rounded-full bg-border flex items-center justify-center text-[10px] text-text-secondary flex-shrink-0">+</span>
                      Adicionar vaga
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2 p-3 rounded-lg bg-bg border border-border">
                      <label className="text-xs text-text-secondary font-semibold">Tipo de vaga</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SLOT_TYPES.map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => { setPlaceholderSlotType(st); setPlaceholderClass(""); }}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium border transition-colors cursor-pointer ${
                              placeholderSlotType === st
                                ? "border-primary bg-primary/10 text-text-primary"
                                : "border-border bg-surface text-text-secondary hover:border-primary/50"
                            }`}
                          >
                            <SlotTypeIcon type={st} size={18} />
                            {SLOT_TYPE_LABELS[st]}
                          </button>
                        ))}
                      </div>

                      {placeholderSlotType === "class" && (
                        <>
                          <label className="text-xs text-text-secondary font-semibold mt-1">Classe</label>
                          <input
                            type="text"
                            value={placeholderClass}
                            onChange={(e) => setPlaceholderClass(e.target.value)}
                            placeholder="Ex: Arcebispo"
                            maxLength={30}
                            list="class-suggestions"
                            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary"
                          />
                          <datalist id="class-suggestions">
                            {getLeafClasses().map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        </>
                      )}

                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => { setShowPlaceholderForm(false); setPlaceholderClass(""); }}
                          className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded-lg hover:bg-border transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleAddPlaceholder}
                          disabled={busy || (placeholderSlotType === "class" && !placeholderClass.trim())}
                          className="px-3 py-1.5 text-xs text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Own chars + friends */}
                  {filteredEligible.map((f) => {
                    const isOwn = f.user_id === currentUserId;
                    return (
                      <button
                        key={`${f.user_id}-${f.character_id}`}
                        type="button"
                        onClick={() => handleAddFromList(f)}
                        disabled={busy}
                        className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-xs hover:bg-surface transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isOwn ? (
                          <span className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px] text-primary flex-shrink-0">♦</span>
                        ) : f.avatar_url ? (
                          <img src={f.avatar_url} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-border flex items-center justify-center text-[10px] text-text-secondary flex-shrink-0">?</span>
                        )}
                        <span className="text-text-primary truncate">{f.character_name}</span>
                        <span className="text-text-secondary">{f.character_class} Lv.{f.character_level}</span>
                        {!isOwn && <span className="text-text-secondary">· @{f.username}</span>}
                      </button>
                    );
                  })}

                  {filteredEligible.length === 0 && !showPlaceholderForm && (
                    <p className="text-xs text-text-secondary italic px-3 py-1">
                      {q ? "Nenhum resultado." : "Todos já adicionados."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Joining mode (non-creator) */}
            {mode === "joining" && (
              <div className="flex flex-col gap-3 p-3 rounded-lg bg-bg border border-border">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-secondary">Personagem</label>
                  <select
                    value={selectedCharacterId}
                    onChange={(e) => setSelectedCharacterId(e.target.value)}
                    disabled={busy}
                    className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-secondary focus:outline-none focus:border-primary"
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
                  <label className="text-xs text-text-secondary">Mensagem (opcional)</label>
                  <input
                    type="text"
                    value={joinMessage}
                    onChange={(e) => setJoinMessage(e.target.value)}
                    placeholder="Ex: tenho tudo pronto"
                    disabled={busy}
                    className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-secondary placeholder-text-secondary focus:outline-none focus:border-primary"
                    style={{ colorScheme: "dark" }}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setMode("view")}
                    disabled={busy}
                    className="px-3 py-1.5 text-sm text-text-secondary bg-surface border border-border rounded-lg hover:bg-border transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmJoin}
                    disabled={busy || !selectedCharacterId}
                    className="px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busy ? "Entrando..." : "Confirmar"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
