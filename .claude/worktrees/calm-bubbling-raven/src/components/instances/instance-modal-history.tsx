"use client";

import { useState } from "react";
import type { InstanceCompletion, Character } from "@/lib/types";
import { toBrtDatetimeLocal, fromBrtDatetimeLocal, formatDateTime, nowBrtMax } from "@/lib/format-date";

export interface InstanceModalHistoryProps {
  instanceId: number;
  completions: InstanceCompletion[];
  characters: Character[];
  onUpdateCompletion: (completionId: string, completedAt: string) => void;
  onDeleteCompletion: (completionId: string) => void;
  actionLoading?: boolean;
}

export function InstanceModalHistory({
  instanceId,
  completions,
  characters,
  onUpdateCompletion,
  onDeleteCompletion,
  actionLoading,
}: InstanceModalHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTime, setEditingTime] = useState("");

  // Filter by instanceId, sort desc
  const filtered = completions
    .filter((c) => c.instance_id === instanceId)
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

  // Build a set of the most recent completion per character_id
  const mostRecentByChar = new Set<string>();
  const seenChars = new Set<string>();
  for (const c of filtered) {
    if (!seenChars.has(c.character_id)) {
      seenChars.add(c.character_id);
      mostRecentByChar.add(c.id);
    }
  }

  // Character name lookup
  const charMap = new Map(characters.map((c) => [c.id, c.name]));

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
    <div className="flex flex-col gap-2">
      {filtered.length === 0 ? (
        <p className="text-sm text-text-secondary italic">Nenhuma conclusão registrada.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered.map((completion) => (
            <li
              key={completion.id}
              className="flex items-center justify-between bg-surface rounded px-3 py-2"
            >
              {editingId === completion.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="datetime-local"
                    value={editingTime}
                    max={nowBrtMax()}
                    onChange={(e) => setEditingTime(e.target.value)}
                    className="bg-surface border border-border rounded px-2 py-1 text-text-primary text-xs focus:outline-none focus:border-primary transition-colors flex-1"
                    style={{ colorScheme: "dark" }}
                  />
                  <button
                    onClick={handleSaveEdit}
                    disabled={actionLoading}
                    className="text-xs text-status-available hover:text-status-available-text cursor-pointer disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-text-secondary hover:text-text-secondary cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-primary font-medium shrink-0">
                      {charMap.get(completion.character_id) ?? "?"}
                    </span>
                    {completion.party_id && (
                      <span className="text-xs shrink-0" title="Conclusão em grupo">👥</span>
                    )}
                    <button
                      onClick={() => handleStartEdit(completion)}
                      className="text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer truncate"
                      title="Clique para editar horário"
                    >
                      {formatDateTime(completion.completed_at)}
                    </button>
                  </div>
                  {mostRecentByChar.has(completion.id) && (
                    <button
                      onClick={() => onDeleteCompletion(completion.id)}
                      disabled={actionLoading}
                      className="text-xs text-status-error hover:text-status-error-text transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-2"
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
  );
}
