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
        const isShared = character.isShared ?? false;

        // Shared chars: gold theme. Own chars: purple theme.
        const selectedClass = isShared
          ? "bg-[#D4A843] border-[#D4A843] text-white"
          : "bg-[#7C3AED] border-[#9B6DFF] text-white";
        const unselectedClass = isShared
          ? "bg-[#1a1230] border-[#D4A843]/40 text-[#D4A843] hover:border-[#D4A843] hover:text-white"
          : "bg-[#1a1230] border-[#3D2A5C] text-[#A89BC2] hover:border-[#6D28D9] hover:text-white";
        const subTextSelected = isShared ? "text-[#1a1230]/70" : "text-[#C49AFF]";
        const subTextUnselected = isShared ? "text-[#D4A843]/60" : "text-[#6B5A8A]";

        return (
          <button
            key={character.id}
            onClick={() => isSelected && onEdit && !isShared ? onEdit(character) : onSelect(character)}
            className={`flex-shrink-0 flex flex-col items-start px-4 py-2.5 rounded-lg border transition-colors cursor-pointer min-w-[120px] text-left ${
              isSelected ? selectedClass : unselectedClass
            }`}
          >
            <span className={`text-xs font-medium truncate max-w-full ${isSelected ? subTextSelected : "text-[#A89BC2]"}`}>
              {character.class}
            </span>
            <span className="text-sm font-semibold truncate max-w-full">{character.name}</span>
            <span className={`text-xs ${isSelected ? subTextSelected : subTextUnselected}`}>
              Nv. {character.level}
            </span>
            <span className={`text-xs h-4 ${isShared && character.ownerUsername ? (isSelected ? subTextSelected : "text-[#D4A843]/50") : "invisible"}`}>
              {isShared && character.ownerUsername ? `@${character.ownerUsername}` : "\u00A0"}
            </span>
            {isSelected && !isShared && onEdit && (
              <span className="text-[10px] opacity-50 mt-0.5">toque para editar</span>
            )}
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
