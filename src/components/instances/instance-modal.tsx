"use client";

import { Modal } from "@/components/ui/modal";
import type { InstanceState, InstanceCompletion } from "@/lib/types";

interface InstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  instance: InstanceState | null;
  history: InstanceCompletion[];
  isAvailable: boolean;
  isInactive: boolean;
  onMarkDone: () => void;
  onDeleteCompletion: (completionId: string) => void;
  onDeactivate: () => void;
  onActivate: () => void;
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
  const colorClass = colors[difficulty.toLowerCase()] ?? "bg-gray-800 text-gray-300";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
      {difficulty}
    </span>
  );
}

export function InstanceModal({
  isOpen,
  onClose,
  instance: stateObj,
  history,
  isAvailable,
  isInactive,
  onMarkDone,
  onDeleteCompletion,
  onDeactivate,
  onActivate,
}: InstanceModalProps) {
  if (!stateObj) return null;
  const { instance } = stateObj;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={instance.name}>
      <div className="flex flex-col gap-5">
        {/* Instance info */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-400 bg-[#2a2a3e] px-2 py-0.5 rounded">
              Nível {instance.level_required}+
            </span>
            {instance.difficulty && (
              <DifficultyBadge difficulty={instance.difficulty} />
            )}
            <span className="text-xs text-gray-400 bg-[#2a2a3e] px-2 py-0.5 rounded">
              {instance.party_min} jogador{instance.party_min !== 1 ? "es" : ""}
            </span>
          </div>
          {instance.reward && (
            <p className="text-sm text-gray-300">
              <span className="text-gray-500">Recompensa:</span> {instance.reward}
            </p>
          )}
        </div>

        {/* Mark done button — only if available */}
        {isAvailable && (
          <button
            onClick={onMarkDone}
            className="w-full py-2.5 rounded-md bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Marcar como feita
          </button>
        )}

        {/* History */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-300">
            Histórico{history.length > 0 && ` (${history.length})`}
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Nenhuma conclusão registrada.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((completion, index) => (
                <li
                  key={completion.id}
                  className="flex items-center justify-between bg-[#2a2a3e] rounded px-3 py-2"
                >
                  <span className="text-sm text-gray-300">
                    {formatDateTime(completion.completed_at)}
                  </span>
                  {/* Only allow deleting the most recent completion */}
                  {index === 0 && (
                    <button
                      onClick={() => onDeleteCompletion(completion.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      aria-label="Remover conclusão"
                    >
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Activate / Deactivate */}
        <div className="border-t border-gray-700 pt-4">
          {isInactive ? (
            <button
              onClick={onActivate}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            >
              Ativar instância
            </button>
          ) : (
            <button
              onClick={onDeactivate}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
            >
              Desativar instância
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
