"use client";

import { useState } from "react";
import { useCharacterShares } from "@/hooks/use-character-shares";

interface CharacterShareTabProps {
  characterId: string;
}

export function CharacterShareTab({ characterId }: CharacterShareTabProps) {
  const { shares, loading, addShare, removeShare } = useCharacterShares(characterId);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!username.trim()) return;
    setAdding(true);
    setError(null);
    const result = await addShare(username.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setUsername("");
    }
    setAdding(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Compartilhamento</h2>
        <p className="text-text-secondary text-sm mt-1">
          Compartilhe este personagem com outros jogadores.
        </p>
      </div>

      {/* Add user */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="username"
              className="w-full bg-surface border border-border rounded-md pl-8 pr-3 py-2 text-text-primary text-sm placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !username.trim()}
            className="px-4 py-2 rounded-md bg-primary text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors cursor-pointer"
          >
            {adding ? "..." : "Adicionar"}
          </button>
        </div>
        {error && <p className="text-xs text-status-error">{error}</p>}
      </div>

      {/* Shares list */}
      {loading ? (
        <p className="text-sm text-text-secondary">Carregando...</p>
      ) : shares.length === 0 ? (
        <p className="text-sm text-text-secondary italic">Nenhum compartilhamento</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shares.map((share) => (
            <li
              key={share.shared_with_user_id}
              className="flex items-center justify-between bg-surface rounded px-3 py-2"
            >
              <span className="text-sm text-text-secondary">@{share.username}</span>
              <button
                onClick={() => removeShare(share.shared_with_user_id)}
                className="text-xs text-status-error hover:text-red-300 transition-colors cursor-pointer"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
