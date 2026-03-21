"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { InstanceSchedule, ScheduleParticipant, Character } from "@/lib/types";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: InstanceSchedule | null;
  participants: ScheduleParticipant[];
  currentUserId: string | null;
  characters: Character[];
  onJoin: (characterId: string, message?: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onRemoveParticipant: (userId: string) => Promise<void>;
  onComplete: (confirmedParticipants: { userId: string; characterId: string }[]) => Promise<void>;
  onExpire: () => Promise<void>;
  loading?: boolean;
}

function formatBrtDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  onComplete,
  onExpire,
  loading,
}: ScheduleModalProps) {
  const [mode, setMode] = useState<"view" | "joining" | "completing">("view");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [checkedParticipants, setCheckedParticipants] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState(false);

  if (!schedule) return null;

  const isCreator = currentUserId === schedule.created_by;
  const isJoined = participants.some((p) => p.user_id === currentUserId);
  const isLate = schedule.status === "open" && new Date(schedule.scheduled_at) < new Date();

  // Sort participants: creator first
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.user_id === schedule.created_by) return -1;
    if (b.user_id === schedule.created_by) return 1;
    return 0;
  });

  const handleJoinClick = () => {
    setSelectedCharacterId(characters[0]?.id ?? "");
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

  const handleLeave = async () => {
    setActionLoading(true);
    try {
      await onLeave();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteClick = () => {
    const initial: Record<string, boolean> = {};
    for (const p of participants) {
      initial[p.user_id] = true;
    }
    setCheckedParticipants(initial);
    setMode("completing");
  };

  const handleConfirmComplete = async () => {
    const confirmed = participants
      .filter((p) => checkedParticipants[p.user_id])
      .map((p) => ({ userId: p.user_id, characterId: p.character_id }));
    setActionLoading(true);
    try {
      await onComplete(confirmed);
      setMode("view");
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

  const toggleParticipant = (userId: string) => {
    setCheckedParticipants((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const busy = loading || actionLoading;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={schedule.instanceName ?? "Agendamento"}>
      <div className="flex flex-col gap-4">
        {/* Badges row */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs px-2 py-1 rounded bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C]">
            {formatBrtDateTime(schedule.scheduled_at)}
          </span>
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

        {/* Creator message */}
        {schedule.message && (
          <p className="text-sm text-[#A89BC2] bg-[#2a1f40] border border-[#3D2A5C] rounded-lg px-3 py-2 italic">
            &ldquo;{schedule.message}&rdquo;
          </p>
        )}

        {/* Completing mode: attendance checklist */}
        {mode === "completing" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[#A89BC2] font-medium">Confirmar presenca:</p>
            <div className="flex flex-col gap-2">
              {sortedParticipants.map((p) => (
                <label
                  key={p.user_id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#2a1f40] border border-[#3D2A5C] cursor-pointer hover:border-[#7C3AED] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checkedParticipants[p.user_id] ?? false}
                    onChange={() => toggleParticipant(p.user_id)}
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
                    <span className="text-sm text-white truncate">
                      @{p.username ?? "???"}
                    </span>
                    {p.characterName && (
                      <span className="text-xs text-[#6B5A8A] truncate">
                        {p.characterName}
                      </span>
                    )}
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
                Participantes ({participants.length})
              </p>
              {sortedParticipants.length === 0 ? (
                <p className="text-sm text-[#6B5A8A] italic">Nenhum participante ainda.</p>
              ) : (
                sortedParticipants.map((p) => {
                  const isParticipantCreator = p.user_id === schedule.created_by;
                  const canRemove = !isParticipantCreator && (isCreator || p.user_id === currentUserId);
                  return (
                    <div
                      key={p.user_id}
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
                          <span className="text-sm text-white truncate">
                            @{p.username ?? "???"}
                          </span>
                          {isParticipantCreator && (
                            <span className="text-[10px] text-[#D4A843] font-medium">
                              (organizador)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {p.characterName && (
                            <span className="text-xs text-[#6B5A8A]">{p.characterName}</span>
                          )}
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
                              onLeave();
                            } else {
                              onRemoveParticipant(p.user_id);
                            }
                          }}
                          disabled={busy}
                          className="text-xs text-red-400 hover:text-red-300 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

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
                    {characters.map((c) => (
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

            {/* Action buttons */}
            {mode === "view" && schedule.status === "open" && (
              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-[#3D2A5C]">
                {!isJoined && !isCreator && characters.length > 0 && (
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
                      onClick={handleExpire}
                      disabled={busy}
                      className="px-4 py-2 text-sm text-red-400 bg-[#2a1f40] border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {busy ? "Cancelando..." : "Cancelar agendamento"}
                    </button>
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
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
