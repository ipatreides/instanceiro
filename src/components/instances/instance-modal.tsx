"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import type { InstanceState, InstanceCompletion } from "@/lib/types";

interface InstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceState | null;
  history: InstanceCompletion[];
  isAvailable: boolean;
  isInactive: boolean;
  onMarkDone: (completedAt?: string) => void;
  onUpdateCompletion: (completionId: string, completedAt: string) => void;
  onDeleteCompletion: (completionId: string) => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onSchedule?: () => void;
  actionLoading?: boolean;
  actionError?: string | null;
}

function toBrtDatetimeLocal(date: Date): string {
  // Convert to BRT (UTC-3)
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 16);
}

function fromBrtDatetimeLocal(value: string): string {
  // value is "YYYY-MM-DDTHH:mm" in BRT, convert to ISO with -03:00
  return `${value}:00-03:00`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DifficultyBadge({ difficulty }: { difficulty: string | null }) {
  if (!difficulty) return null;
  const colors: Record<string, string> = {
    easy: "bg-green-900 text-green-300",
    normal: "bg-blue-900 text-blue-300",
    hard: "bg-orange-900 text-orange-300",
    extreme: "bg-red-900 text-red-300",
  };
  const colorClass = colors[difficulty.toLowerCase()] ?? "bg-gray-800 text-[#A89BC2]";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
      {difficulty}
    </span>
  );
}

function nowBrtMax(): string {
  return toBrtDatetimeLocal(new Date());
}

export function InstanceModal({
  isOpen,
  onClose,
  instance: stateObj,
  history,
  isAvailable,
  isInactive,
  onMarkDone,
  onUpdateCompletion,
  onDeleteCompletion,
  onDeactivate,
  onActivate,
  onSchedule,
  actionLoading,
  actionError,
}: InstanceModalProps) {
  const [confirmingMarkDone, setConfirmingMarkDone] = useState(false);
  const [markDoneTime, setMarkDoneTime] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState("");

  // Reset states when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmingMarkDone(false);
      setMarkDoneTime("");
      setEditingId(null);
      setEditingTime("");
    }
  }, [isOpen]);

  // Set default time when confirming
  useEffect(() => {
    if (confirmingMarkDone) {
      setMarkDoneTime(nowBrtMax());
    }
  }, [confirmingMarkDone]);

  if (!stateObj) return null;
  const { instance } = stateObj;

  function handleConfirmMarkDone() {
    const completedAt = markDoneTime ? fromBrtDatetimeLocal(markDoneTime) : undefined;
    onMarkDone(completedAt);
  }

  function handleStartEdit(completion: InstanceCompletion) {
    setEditingId(completion.id);
    setEditingTime(toBrtDatetimeLocal(new Date(completion.completed_at)));
  }

  function handleSaveEdit() {
    if (!editingId || !editingTime) return;
    onUpdateCompletion(editingId, fromBrtDatetimeLocal(editingTime));
    setEditingId(null);
    setEditingTime("");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={instance.name}>
      <div className="flex flex-col gap-5">
        {/* Instance info */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-[#A89BC2] bg-[#2a1f40] px-2 py-0.5 rounded">
              Nível {instance.level_required}{instance.level_max ? `–${instance.level_max}` : '+'}
            </span>
            {instance.difficulty && (
              <DifficultyBadge difficulty={instance.difficulty} />
            )}
            <span className="text-xs text-[#A89BC2] bg-[#2a1f40] px-2 py-0.5 rounded">
              {instance.party_min} jogador{instance.party_min !== 1 ? "es" : ""}
            </span>
            {instance.start_map && (
              <span className="text-xs text-[#D4A843] bg-[#2a1f40] px-2 py-0.5 rounded">
                {instance.start_map}
              </span>
            )}
            {instance.mutual_exclusion_group && (
              <span className="text-xs text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">
                Cooldown compartilhado
              </span>
            )}
            {instance.liga_tier && (
              <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded">
                Liga {instance.liga_tier} — {instance.liga_coins} moedas
              </span>
            )}
            {instance.wiki_url && (
              <a
                href={instance.wiki_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded hover:bg-blue-900/50 transition-colors"
              >
                bROWiki ↗
              </a>
            )}
          </div>
          {instance.reward && (
            <p className="text-sm text-[#A89BC2]">
              <span className="text-[#6B5A8A]">Recompensa:</span> {instance.reward}
            </p>
          )}
        </div>

        {/* Action error */}
        {actionError && (
          <p className="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">
            {actionError}
          </p>
        )}

        {/* Mark done button — available or inactive instances */}
        {(isAvailable || isInactive) && !confirmingMarkDone && (
          <button
            onClick={() => setConfirmingMarkDone(true)}
            disabled={actionLoading}
            className="w-full py-2.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Marcar como feita
          </button>
        )}
        {confirmingMarkDone && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#6B5A8A]">Horário de entrada</label>
              <input
                type="datetime-local"
                value={markDoneTime}
                max={nowBrtMax()}
                onChange={(e) => setMarkDoneTime(e.target.value)}
                className="bg-[#2a1f40] border border-[#3D2A5C] rounded-md px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7C3AED] transition-colors"
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmMarkDone}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Salvando..." : "Confirmar"}
              </button>
              <button
                onClick={() => setConfirmingMarkDone(false)}
                disabled={actionLoading}
                className="flex-1 py-2.5 rounded-md bg-[#2a1f40] border border-[#3D2A5C] text-[#A89BC2] text-sm transition-colors cursor-pointer hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Schedule button */}
        {onSchedule && !confirmingMarkDone && (
          <button
            onClick={onSchedule}
            className="w-full py-2.5 rounded-md bg-[#2a1f40] border border-[#3D2A5C] text-[#D4A843] font-semibold text-sm hover:border-[#D4A843] transition-colors cursor-pointer"
          >
            Agendar com amigos
          </button>
        )}

        {/* History */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-[#A89BC2]">
            Histórico{history.length > 0 && ` (${history.length})`}
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-[#6B5A8A] italic">Nenhuma conclusão registrada.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((completion, index) => (
                <li
                  key={completion.id}
                  className="flex items-center justify-between bg-[#2a1f40] rounded px-3 py-2"
                >
                  {editingId === completion.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="datetime-local"
                        value={editingTime}
                        max={nowBrtMax()}
                        onChange={(e) => setEditingTime(e.target.value)}
                        className="bg-[#1a1230] border border-[#3D2A5C] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#7C3AED] transition-colors flex-1"
                        style={{ colorScheme: "dark" }}
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={actionLoading}
                        className="text-xs text-green-400 hover:text-green-300 cursor-pointer disabled:opacity-50"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-[#6B5A8A] hover:text-[#A89BC2] cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartEdit(completion)}
                        className="text-sm text-[#A89BC2] hover:text-white transition-colors cursor-pointer"
                        title="Clique para editar horário"
                      >
                        {formatDateTime(completion.completed_at)}
                      </button>
                      {index === 0 && (
                        <button
                          onClick={() => onDeleteCompletion(completion.id)}
                          disabled={actionLoading}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label="Remover conclusão"
                        >
                          Remover
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Deactivate — only for active instances */}
        {!isInactive && (
          <div className="border-t border-[#3D2A5C] pt-4">
            <button
              onClick={onDeactivate}
              disabled={actionLoading}
              className="text-sm text-[#6B5A8A] hover:text-[#A89BC2] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Desativar instância
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
