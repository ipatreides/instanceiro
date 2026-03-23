"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Account, Character } from "@/lib/types";

export interface Participant {
  type: "own" | "friend";
  character_id: string;
  user_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  username?: string;
  avatar_url?: string | null;
  account_id?: string;
  server_id?: number;
}

interface EligibleFriend {
  user_id: string;
  username: string;
  avatar_url: string | null;
  character_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  is_active: boolean;
  last_completed_at: string | null;
}

interface ParticipantListProps {
  characters: Character[];
  accounts?: Account[];
  instanceId: number;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  participants: Participant[];
  lockedCharId?: string | null;
  onAdd: (p: Participant) => void;
  onRemove: (characterId: string) => void;
}

export default function ParticipantList({
  characters,
  accounts,
  instanceId,
  getEligibleFriends,
  participants,
  lockedCharId,
  onAdd,
  onRemove,
}: ParticipantListProps) {
  const [friends, setFriends] = useState<EligibleFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const showValidation = useCallback((msg: string) => {
    setValidationError(msg);
    setTimeout(() => setValidationError(null), 4000);
  }, []);

  // Fetch friends on mount
  useEffect(() => {
    let cancelled = false;
    setFriendsLoading(true);
    getEligibleFriends(instanceId).then((data) => {
      if (!cancelled) {
        setFriends(data);
        setFriendsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [instanceId, getEligibleFriends]);

  const participantIds = useMemo(
    () => new Set(participants.map((p) => p.character_id)),
    [participants],
  );

  // Own characters not yet added (non-shared)
  const availableOwn = useMemo(
    () => characters.filter((c) => !c.isShared && !participantIds.has(c.id)),
    [characters, participantIds],
  );

  // Friends not yet added, sorted: available first, cooldown last
  const availableFriends = useMemo(() => {
    return friends
      .filter((f) => !participantIds.has(f.character_id))
      .sort((a, b) => {
        const aCd = a.last_completed_at ? 1 : 0;
        const bCd = b.last_completed_at ? 1 : 0;
        return aCd - bCd;
      });
  }, [friends, participantIds]);

  // Unified search results: own chars first, then friends
  const q = search.toLowerCase().trim();
  const filteredOwn = q
    ? availableOwn.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.class.toLowerCase().includes(q)
      )
    : availableOwn;

  const filteredFriends = q
    ? availableFriends.filter((f) =>
        f.character_name.toLowerCase().includes(q) ||
        f.character_class.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q)
      )
    : availableFriends;

  function handleAddOwn(c: Character) {
    const account = accounts?.find(a => a.id === c.account_id);
    const serverId = account?.server_id;

    // Validate: same account_id not already in party (own chars only)
    const ownParticipants = participants.filter(p => p.type === "own");
    if (ownParticipants.some(p => p.account_id === c.account_id)) {
      showValidation("Já existe um personagem dessa conta no grupo.");
      return;
    }

    // Validate: server_id must match existing participants
    if (serverId && participants.length > 0) {
      const existingServerId = participants.find(p => p.server_id)?.server_id;
      if (existingServerId && existingServerId !== serverId) {
        showValidation("Esse personagem é de um servidor diferente dos demais.");
        return;
      }
    }

    onAdd({
      type: "own",
      character_id: c.id,
      user_id: c.user_id,
      character_name: c.name,
      character_class: c.class,
      character_level: c.level,
      account_id: c.account_id,
      server_id: serverId,
    });
  }

  function handleAddFriend(f: EligibleFriend) {
    onAdd({
      type: "friend",
      character_id: f.character_id,
      user_id: f.user_id,
      character_name: f.character_name,
      character_class: f.character_class,
      character_level: f.character_level,
      username: f.username,
      avatar_url: f.avatar_url,
    });
  }

  const hasResults = filteredOwn.length > 0 || filteredFriends.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <h4 className="text-xs font-semibold text-[#6B5A8A] uppercase tracking-wide">
        Participantes {participants.length > 0 && `(${participants.length})`}
      </h4>

      {/* Validation error */}
      {validationError && (
        <div className="px-3 py-2 rounded bg-red-900/40 border border-red-500/30 text-xs text-red-300">
          {validationError}
        </div>
      )}

      {/* Current participants */}
      {participants.map((p) => (
        <div
          key={p.character_id}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#2a1f40] border border-[#3D2A5C]"
        >
          {p.type === "own" ? (
            <span className="w-5 h-5 rounded-full bg-[#7C3AED] flex items-center justify-center text-[10px] text-white flex-shrink-0">♦</span>
          ) : p.avatar_url ? (
            <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
          ) : (
            <span className="w-5 h-5 rounded-full bg-[#3D2A5C] flex items-center justify-center text-[10px] text-[#A89BC2] flex-shrink-0">?</span>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-xs text-white font-medium truncate block">{p.character_name}</span>
            <span className="text-[10px] text-[#6B5A8A]">
              {p.character_class} Lv.{p.character_level}
              {p.type === "friend" && p.username && ` · @${p.username}`}
            </span>
          </div>
          {p.character_id !== lockedCharId && (
            <button
              type="button"
              onClick={() => onRemove(p.character_id)}
              className="text-xs text-[#6B5A8A] hover:text-red-400 cursor-pointer transition-colors flex-shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {/* Unified search box */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar personagem ou amigo..."
        className="w-full rounded-lg bg-[#0f0a1a] border border-[#3D2A5C] px-3 py-2 text-xs text-white placeholder-[#6B5A8A] outline-none focus:border-[#7C3AED] transition-colors"
      />

      {/* Results list: own chars first, then friends */}
      {friendsLoading ? (
        <div className="flex items-center justify-center py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#7C3AED] border-t-transparent" />
        </div>
      ) : !hasResults ? (
        <p className="text-xs text-[#6B5A8A] italic px-1">
          {q ? "Nenhum resultado." : "Todos já adicionados."}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
          {/* Own characters */}
          {filteredOwn.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleAddOwn(c)}
              className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-xs hover:bg-[#2a1f40] transition-colors cursor-pointer"
            >
              <span className="w-5 h-5 rounded-full bg-[#7C3AED]/30 flex items-center justify-center text-[10px] text-[#7C3AED] flex-shrink-0">♦</span>
              <span className="text-white truncate">{c.name}</span>
              <span className="text-[#6B5A8A]">{c.class} Lv.{c.level}</span>
            </button>
          ))}

          {/* Separator if both sections have items */}
          {filteredOwn.length > 0 && filteredFriends.length > 0 && (
            <div className="border-t border-[#3D2A5C]/50 my-1" />
          )}

          {/* Friends */}
          {filteredFriends.map((f) => {
            const onCooldown = !!f.last_completed_at;
            return (
              <button
                key={`${f.user_id}-${f.character_id}`}
                type="button"
                onClick={() => handleAddFriend(f)}
                className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-xs hover:bg-[#2a1f40] transition-colors cursor-pointer ${
                  onCooldown ? "opacity-60" : ""
                }`}
              >
                {f.avatar_url ? (
                  <img src={f.avatar_url} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-[#3D2A5C] flex items-center justify-center text-[10px] text-[#A89BC2] flex-shrink-0">?</span>
                )}
                <span className="text-white truncate">{f.character_name}</span>
                <span className="text-[#6B5A8A]">{f.character_class} · @{f.username}</span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ml-auto ${onCooldown ? "bg-orange-400" : "bg-green-500"}`} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
