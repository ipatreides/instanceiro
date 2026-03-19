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
        <h2 className="text-xl font-bold text-white">Compartilhamento</h2>
        <p className="text-[#A89BC2] text-sm mt-1">
          Compartilhe este personagem com outros jogadores.
        </p>
      </div>

      {/* Add user */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B5A8A] text-sm font-medium">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="username"
              className="w-full bg-[#2a1f40] border border-[#3D2A5C] rounded-md pl-8 pr-3 py-2 text-white text-sm placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !username.trim()}
            className="px-4 py-2 rounded-md bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
          >
            {adding ? "..." : "Adicionar"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Shares list */}
      {loading ? (
        <p className="text-sm text-[#6B5A8A]">Carregando...</p>
      ) : shares.length === 0 ? (
        <p className="text-sm text-[#6B5A8A] italic">Nenhum compartilhamento</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {shares.map((share) => (
            <li
              key={share.shared_with_user_id}
              className="flex items-center justify-between bg-[#2a1f40] rounded px-3 py-2"
            >
              <span className="text-sm text-[#A89BC2]">@{share.username}</span>
              <button
                onClick={() => removeShare(share.shared_with_user_id)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
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
