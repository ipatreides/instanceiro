"use client";

import type { Character } from "@/lib/types";

interface CharacterBarProps {
  characters: Character[];
  selectedId: string | null;
  onSelect: (character: Character) => void;
  onAddClick: () => void;
  onEdit?: (character: Character) => void;
}

export function CharacterBar({ characters, selectedId, onSelect, onAddClick, onEdit }: CharacterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {characters.map((character) => {
        const isSelected = character.id === selectedId;
        return (
          <button
            key={character.id}
            onClick={() => isSelected && onEdit ? onEdit(character) : onSelect(character)}
            className={`flex-shrink-0 flex flex-col items-start px-4 py-2.5 rounded-lg border transition-colors cursor-pointer min-w-[120px] text-left ${
              isSelected
                ? "bg-[#7C3AED] border-[#9B6DFF] text-white"
                : "bg-[#1a1230] border-[#3D2A5C] text-[#A89BC2] hover:border-[#6D28D9] hover:text-white"
            }`}
          >
            <span className={`text-xs font-medium truncate max-w-full ${isSelected ? "text-[#C49AFF]" : "text-[#A89BC2]"}`}>
              {character.class}
            </span>
            <span className="text-sm font-semibold truncate max-w-full">{character.name}</span>
            <span className={`text-xs ${isSelected ? "text-[#C49AFF]" : "text-[#6B5A8A]"}`}>
              Nv. {character.level}
            </span>
          </button>
        );
      })}

      {/* Add button */}
      <button
        onClick={onAddClick}
        className="flex-shrink-0 flex items-center justify-center w-12 h-[68px] rounded-lg border-2 border-dashed border-[#3D2A5C] text-[#6B5A8A] hover:border-[#6D28D9] hover:text-[#A89BC2] transition-colors cursor-pointer"
        aria-label="Adicionar personagem"
      >
        <span className="text-xl leading-none">+</span>
      </button>
    </div>
  );
}
