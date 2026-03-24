"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { fromBrtDatetimeLocal, nowBrtMax } from "@/lib/format-date";
import type { Account, InstanceState, InstanceCompletion, Character } from "@/lib/types";
import type { EligibleFriend } from "@/hooks/use-schedules";
import type { Participant } from "./participant-list";
import { InstanceModalDetails } from "./instance-modal-details";
import { InstanceModalHistory } from "./instance-modal-history";

export interface InstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceState | null;
  characters: Character[];
  accounts?: Account[];
  selectedCharId: string | null;
  allCompletions: InstanceCompletion[];
  onCompleteParty: (
    ownCharIds: string[],
    friends: { character_id: string; user_id: string }[],
    completedAt?: string,
  ) => Promise<void>;
  onUpdateCompletion: (completionId: string, completedAt: string) => void;
  onDeleteCompletion: (completionId: string) => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onSchedule?: (participants: Participant[]) => void;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  actionLoading?: boolean;
  actionError?: string | null;
}

export function InstanceModal({
  isOpen,
  onClose,
  instance: stateObj,
  characters,
  accounts,
  selectedCharId,
  allCompletions,
  onCompleteParty,
  onUpdateCompletion,
  onDeleteCompletion,
  onDeactivate,
  onActivate,
  onSchedule,
  getEligibleFriends,
  actionLoading,
  actionError,
}: InstanceModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [confirmingMarkDone, setConfirmingMarkDone] = useState(false);
  const [markDoneTime, setMarkDoneTime] = useState("");
  const [userModified, setUserModified] = useState(false);

  const instanceId = stateObj?.instance.id ?? null;

  // Reset states when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab("details");
      setParticipants([]);
      setConfirmingMarkDone(false);
      setMarkDoneTime("");
      setUserModified(false);
    }
  }, [isOpen]);

  // Reset states when switching between instances + auto-add selected char
  useEffect(() => {
    setActiveTab("details");
    setConfirmingMarkDone(false);
    setMarkDoneTime("");
    setUserModified(false);

    // Auto-populate with selected character
    if (selectedCharId) {
      const char = characters.find((c) => c.id === selectedCharId);
      if (char) {
        const account = accounts?.find((a) => a.id === char.account_id);
        setParticipants([{
          type: "own",
          character_id: char.id,
          user_id: char.user_id,
          character_name: char.name,
          character_class: char.class,
          character_level: char.level,
          account_id: char.account_id,
          server_id: account?.server_id,
        }]);
      } else {
        setParticipants([]);
      }
    } else {
      setParticipants([]);
    }
  }, [instanceId, selectedCharId, characters]);

  // Set default time when confirming
  useEffect(() => {
    if (confirmingMarkDone) {
      setMarkDoneTime(nowBrtMax());
    }
  }, [confirmingMarkDone]);

  const isDirty = userModified || confirmingMarkDone;

  if (!stateObj) return null;
  const { instance } = stateObj;
  const isInactive = stateObj.status === "inactive";

  function handleAddParticipant(p: Participant) {
    setParticipants((prev) => [...prev, p]);
    setUserModified(true);
  }

  function handleRemoveParticipant(characterId: string) {
    setParticipants((prev) => prev.filter((p) => p.character_id !== characterId));
    setUserModified(true);
  }

  async function handleCompleteParty(completedAt?: string) {
    const ownIds = participants.filter((p) => p.type === "own").map((p) => p.character_id);
    const friends = participants
      .filter((p) => p.type === "friend")
      .map((p) => ({ character_id: p.character_id, user_id: p.user_id }));
    await onCompleteParty(ownIds, friends, completedAt);
  }

  function handleConfirmMarkDone() {
    const completedAt = markDoneTime ? fromBrtDatetimeLocal(markDoneTime) : undefined;
    handleCompleteParty(completedAt);
  }

  const hasOwnParticipants = participants.filter((p) => p.type === "own").length > 0;

  // Title action: eye icon toggle
  const titleAction = (
    <button
      onClick={() => (isInactive ? onActivate() : onDeactivate())}
      disabled={actionLoading}
      className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
      title={isInactive ? "Ativar instância" : "Desativar instância"}
    >
      {isInactive ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      )}
    </button>
  );

  // Footer (only on details tab)
  const footer = activeTab === "details" ? (
    <div className="flex flex-col gap-2">
      {!confirmingMarkDone ? (
        <div className="flex gap-2">
          <button
            onClick={() => handleCompleteParty()}
            disabled={actionLoading || !hasOwnParticipants}
            className="flex-1 py-2.5 rounded-md bg-status-available hover:bg-status-available text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Marcar agora
          </button>
          <button
            onClick={() => setConfirmingMarkDone(true)}
            disabled={actionLoading}
            className="py-2.5 px-3 rounded-md bg-surface border border-border text-text-secondary text-sm transition-colors cursor-pointer hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            title="Escolher horário"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
          {onSchedule && !instance.is_solo && (
            <button
              onClick={() => onSchedule(participants)}
              className="py-2.5 px-4 rounded-md bg-surface border border-border text-primary-secondary font-semibold text-sm hover:border-primary-secondary transition-colors cursor-pointer"
            >
              Agendar
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Horário de entrada</label>
            <input
              type="datetime-local"
              value={markDoneTime}
              max={nowBrtMax()}
              onChange={(e) => setMarkDoneTime(e.target.value)}
              className="bg-surface border border-border rounded-md px-3 py-1.5 text-text-primary text-sm focus:outline-none focus:border-primary transition-colors"
              style={{ colorScheme: "dark" }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmMarkDone}
              disabled={actionLoading || !hasOwnParticipants}
              className="flex-1 py-2.5 rounded-md bg-status-available hover:bg-status-available text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? "Salvando..." : "Confirmar"}
            </button>
            <button
              onClick={() => setConfirmingMarkDone(false)}
              disabled={actionLoading}
              className="flex-1 py-2.5 rounded-md bg-surface border border-border text-text-secondary text-sm transition-colors cursor-pointer hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={instance.name}
      isDirty={isDirty}
      titleAction={titleAction}
      footer={footer}
    >
      <div className="flex flex-col gap-4">
        {/* Action error */}
        {actionError && (
          <p className="text-sm text-status-error bg-status-error/10 rounded px-3 py-2">
            {actionError}
          </p>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setActiveTab("details")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "details"
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Detalhes
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "history"
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            Histórico
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "details" ? (
          <InstanceModalDetails
            instance={instance}
            characters={characters}
            accounts={accounts}
            instanceId={instance.id}
            lockedCharId={selectedCharId}
            getEligibleFriends={getEligibleFriends}
            participants={participants}
            onAddParticipant={handleAddParticipant}
            onRemoveParticipant={handleRemoveParticipant}
          />
        ) : (
          <InstanceModalHistory
            instanceId={instance.id}
            completions={allCompletions}
            characters={characters}
            onUpdateCompletion={onUpdateCompletion}
            onDeleteCompletion={onDeleteCompletion}
            actionLoading={actionLoading}
          />
        )}
      </div>
    </Modal>
  );
}
