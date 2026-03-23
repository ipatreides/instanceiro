"use client";

import type { Account, Instance, Character } from "@/lib/types";
import type { EligibleFriend } from "@/hooks/use-schedules";
import ParticipantList, { type Participant } from "./participant-list";

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

export interface InstanceModalDetailsProps {
  instance: Instance;
  characters: Character[];
  accounts?: Account[];
  instanceId: number;
  lockedCharId?: string | null;
  getEligibleFriends: (instanceId: number) => Promise<EligibleFriend[]>;
  participants: Participant[];
  onAddParticipant: (p: Participant) => void;
  onRemoveParticipant: (characterId: string) => void;
}

export function InstanceModalDetails({
  instance,
  characters,
  accounts,
  instanceId,
  lockedCharId,
  getEligibleFriends,
  participants,
  onAddParticipant,
  onRemoveParticipant,
}: InstanceModalDetailsProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Badges row */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-[#A89BC2] bg-[#2a1f40] px-2 py-0.5 rounded-full">
          Nv. {instance.level_required}{instance.level_max ? `\u2013${instance.level_max}` : '+'}
        </span>
        {instance.difficulty && (
          <DifficultyBadge difficulty={instance.difficulty} />
        )}
        <span className="text-xs text-[#A89BC2] bg-[#2a1f40] px-2 py-0.5 rounded-full">
          {instance.is_solo ? "Solo" : `${instance.party_min}+ jogadores`}
        </span>
        {instance.start_map && (
          <span className="text-xs text-[#D4A843] bg-[#2a1f40] px-2 py-0.5 rounded-full">
            {instance.start_map}
          </span>
        )}
        {instance.mutual_exclusion_group && (
          <span className="text-xs text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded-full">
            Cooldown compartilhado
          </span>
        )}
        {instance.liga_tier && (
          <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full">
            Liga {instance.liga_tier} — {instance.liga_coins} moedas
          </span>
        )}
        {instance.reward && (
          <span className="text-xs text-[#6B5A8A] bg-[#2a1f40] px-2 py-0.5 rounded-full">
            {instance.reward}
          </span>
        )}
        {instance.wiki_url && (
          <a
            href={instance.wiki_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full hover:bg-blue-900/50 transition-colors"
          >
            bROWiki ↗
          </a>
        )}
      </div>

      {/* Participant list */}
      <ParticipantList
        characters={characters}
        accounts={accounts}
        instanceId={instanceId}
        getEligibleFriends={getEligibleFriends}
        participants={participants}
        lockedCharId={lockedCharId}
        onAdd={onAddParticipant}
        onRemove={onRemoveParticipant}
      />
    </div>
  );
}
