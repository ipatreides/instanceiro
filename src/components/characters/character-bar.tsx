"use client";

import type { Character } from "@/lib/types";

interface CharacterBarProps {
  characters: Character[];
  selectedId: string | null;
  onSelect: (character: Character) => void;
  onAddClick: () => void;
}

export function CharacterBar({ characters, selectedId, onSelect, onAddClick }: CharacterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {characters.map((character) => {
        const isSelected = character.id === selectedId;
        return (
          <button
            key={character.id}
            onClick={() => onSelect(character)}
            className={`flex-shrink-0 flex flex-col items-start px-4 py-2.5 rounded-lg border transition-colors cursor-pointer min-w-[120px] text-left ${
              isSelected
                ? "bg-blue-600 border-blue-400 text-white"
                : "bg-[#1a1a2e] border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white"
            }`}
          >
            <span className={`text-xs font-medium truncate max-w-full ${isSelected ? "text-blue-200" : "text-gray-400"}`}>
              {character.class}
            </span>
            <span className="text-sm font-semibold truncate max-w-full">{character.name}</span>
            <span className={`text-xs ${isSelected ? "text-blue-200" : "text-gray-500"}`}>
              Nv. {character.level}
            </span>
          </button>
        );
      })}

      {/* Add button */}
      <button
        onClick={onAddClick}
        className="flex-shrink-0 flex items-center justify-center w-12 h-[68px] rounded-lg border-2 border-dashed border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
        aria-label="Adicionar personagem"
      >
        <span className="text-xl leading-none">+</span>
      </button>
    </div>
  );
}
