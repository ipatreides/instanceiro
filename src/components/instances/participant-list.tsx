"use client";

import { useState, useEffect, useMemo } from "react";
import type { Character } from "@/lib/types";

export interface Participant {
  type: "own" | "friend";
  character_id: string;
  user_id: string;
  character_name: string;
  character_class: string;
  character_level: number;
  username?: string;
  avatar_url?: string | null;
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
  instanceId: number;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  participants: Participant[];
  onAdd: (p: Participant) => void;
  onRemove: (characterId: string) => void;
}

type OpenPanel = "none" | "own" | "friend";

export default function ParticipantList({
  characters,
  instanceId,
  getEligibleFriends,
  participants,
  onAdd,
  onRemove,
}: ParticipantListProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>("none");
  const [friends, setFriends] = useState<EligibleFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");

  const participantIds = useMemo(
    () => new Set(participants.map((p) => p.character_id)),
    [participants],
  );

  const availableOwn = useMemo(
    () =>
      characters.filter(
        (c) => !c.isShared && !participantIds.has(c.id),
      ),
    [characters, participantIds],
  );

  // Fetch eligible friends when the friend panel opens
  useEffect(() => {
    if (openPanel !== "friend") return;
    let cancelled = false;
    setFriendsLoading(true);
    getEligibleFriends(instanceId).then((data) => {
      if (!cancelled) {
        setFriends(data);
        setFriendsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [openPanel, instanceId, getEligibleFriends]);

  const filteredFriends = useMemo(() => {
    const alreadyAdded = new Set(participants.map((p) => p.character_id));
    const available = friends.filter((f) => !alreadyAdded.has(f.character_id));

    if (!friendSearch.trim()) return available;
    const q = friendSearch.toLowerCase();
    return available.filter(
      (f) =>
        f.character_name.toLowerCase().includes(q) ||
        f.character_class.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q),
    );
  }, [friends, friendSearch, participants]);

  // Sort: available (no cooldown) first, then cooldown
  const sortedFriends = useMemo(() => {
    return [...filteredFriends].sort((a, b) => {
      const aOnCooldown = a.last_completed_at ? 1 : 0;
      const bOnCooldown = b.last_completed_at ? 1 : 0;
      return aOnCooldown - bOnCooldown;
    });
  }, [filteredFriends]);

  function togglePanel(panel: "own" | "friend") {
    setOpenPanel((prev) => (prev === panel ? "none" : panel));
    setFriendSearch("");
  }

  function handleAddOwn(c: Character) {
    onAdd({
      type: "own",
      character_id: c.id,
      user_id: c.user_id,
      character_name: c.name,
      character_class: c.class,
      character_level: c.level,
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

  return (
    <div className="space-y-2">
      {/* Header */}
      {participants.length > 0 && (
        <h4 className="text-xs font-semibold text-[#A89BC2]">
          Participantes ({participants.length})
        </h4>
      )}

      {/* Participant rows */}
      <div className="space-y-1">
        {participants.map((p) => (
          <div
            key={p.character_id}
            className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-[#2a1f40]"
          >
            <div className="flex items-center gap-2 min-w-0">
              {p.type === "own" ? (
                <span className="text-[#7C3AED] text-xs shrink-0">♦</span>
              ) : p.avatar_url ? (
                <img
                  src={p.avatar_url}
                  alt=""
                  className="w-4 h-4 rounded-full shrink-0"
                />
              ) : (
                <span className="w-4 h-4 rounded-full bg-[#3D2A5C] text-[#A89BC2] text-[10px] flex items-center justify-center shrink-0">
                  ?
                </span>
              )}
              <span className="text-[#e0d6f0] truncate">
                {p.character_name}
              </span>
              <span className="text-[#6B5A8A] text-xs truncate">
                {p.character_class} Lv.{p.character_level}
              </span>
              {p.type === "friend" && p.username && (
                <span className="text-[#6B5A8A] text-xs truncate">
                  · @{p.username}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemove(p.character_id)}
              className="text-[#6B5A8A] hover:text-red-400 text-sm px-1 shrink-0 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => togglePanel("own")}
          className="text-xs text-[#7C3AED] hover:underline cursor-pointer"
        >
          + Adicionar personagem
        </button>
        <button
          type="button"
          onClick={() => togglePanel("friend")}
          className="text-xs text-[#D4A843] hover:underline cursor-pointer"
        >
          🔍 Convidar amigo...
        </button>
      </div>

      {/* Own characters dropdown */}
      {openPanel === "own" && (
        <div className="rounded-lg border border-[#3D2A5C] bg-[#1a1230] p-2 space-y-1">
          {availableOwn.length === 0 ? (
            <p className="text-xs text-[#6B5A8A] px-2 py-1">
              Todos os personagens já adicionados
            </p>
          ) : (
            availableOwn.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleAddOwn(c)}
                className="w-full text-left rounded px-2 py-1 text-sm text-[#e0d6f0] hover:bg-[#2a1f40] cursor-pointer"
              >
                {c.name}{" "}
                <span className="text-[#6B5A8A] text-xs">
                  · {c.class} Lv.{c.level}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Friend search panel */}
      {openPanel === "friend" && (
        <div className="rounded-lg border border-[#3D2A5C] bg-[#1a1230] p-2 space-y-2">
          <input
            type="text"
            value={friendSearch}
            onChange={(e) => setFriendSearch(e.target.value)}
            placeholder="Buscar por nome, classe ou @username"
            className="w-full rounded bg-[#0f0a1a] border border-[#3D2A5C] px-2 py-1 text-xs text-[#e0d6f0] placeholder:text-[#6B5A8A] outline-none focus:border-[#7C3AED]"
          />

          {friendsLoading ? (
            <div className="flex items-center justify-center py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#7C3AED] border-t-transparent" />
            </div>
          ) : sortedFriends.length === 0 ? (
            <p className="text-xs text-[#6B5A8A] px-2 py-1">
              {friends.length === 0
                ? "Nenhum amigo com esta instância."
                : "Nenhum resultado."}
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {sortedFriends.map((f) => {
                const onCooldown = !!f.last_completed_at;
                return (
                  <button
                    key={f.character_id}
                    type="button"
                    onClick={() => handleAddFriend(f)}
                    className="w-full text-left rounded px-2 py-1 text-sm text-[#e0d6f0] hover:bg-[#2a1f40] flex items-center gap-2 cursor-pointer"
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                        onCooldown ? "bg-orange-400" : "bg-green-400"
                      }`}
                    />
                    <span className="truncate">
                      {f.character_name}{" "}
                      <span className="text-[#6B5A8A] text-xs">
                        · {f.character_class} Lv.{f.character_level}
                      </span>
                      <span className="text-[#6B5A8A] text-xs">
                        {" "}
                        · @{f.username}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
