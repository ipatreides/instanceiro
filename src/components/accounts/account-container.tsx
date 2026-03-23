"use client";

import type { Account, Character } from "@/lib/types";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface AccountContainerProps {
  account: Account;
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onToggleCollapse: () => void;
  onOpenAccountModal: () => void;
  onReorderChars: (orderedCharIds: string[]) => void;
}

function SortableCharCard({
  character,
  isSelected,
  onSelect,
  onEdit,
}: {
  character: Character;
  isSelected: boolean;
  onSelect: (char: Character) => void;
  onEdit: (char: Character) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: `char-${character.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isShared = character.isShared ?? false;

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
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (isSelected && !isShared) {
          onEdit(character);
        } else {
          onSelect(character);
        }
      }}
      className={`flex-shrink-0 flex flex-col items-start px-4 py-2.5 rounded-lg border transition-colors cursor-pointer min-w-[120px] text-left ${
        isSelected ? selectedClass : unselectedClass
      }`}
    >
      <span
        className={`text-xs font-medium truncate max-w-full ${
          isSelected ? subTextSelected : "text-[#A89BC2]"
        }`}
      >
        {character.class}
      </span>
      <span className="text-sm font-semibold truncate max-w-full">
        {character.name}
      </span>
      <span
        className={`text-xs ${
          isSelected ? subTextSelected : subTextUnselected
        }`}
      >
        Nv. {character.level}
      </span>
      {isShared && character.ownerUsername && (
        <span
          className={`text-xs ${
            isSelected ? subTextSelected : "text-[#D4A843]/50"
          }`}
        >
          @{character.ownerUsername}
        </span>
      )}
    </button>
  );
}

export function AccountContainer({
  account,
  characters,
  selectedCharId,
  onSelectChar,
  onEditChar,
  onToggleCollapse,
  onOpenAccountModal,
  onReorderChars,
}: AccountContainerProps) {
  const charIds = characters.map((c) => `char-${c.id}`);

  if (account.is_collapsed) {
    return (
      <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 py-2.5 rounded-lg border border-[#3D2A5C] bg-[#1a1230] min-h-[100px] gap-1">
        <button
          onClick={onOpenAccountModal}
          className="text-xs font-semibold text-[#A89BC2] hover:text-white transition-colors truncate max-w-[80px]"
          title={account.name}
        >
          {account.name}
        </button>
        <span className="text-[10px] text-[#6B5A8A]">
          ({characters.length})
        </span>
        <button
          onClick={onToggleCollapse}
          className="text-[#6B5A8A] hover:text-[#A89BC2] transition-colors text-xs mt-1"
          aria-label="Expandir"
        >
          ►
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-[#3D2A5C] p-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <button
          onClick={onOpenAccountModal}
          className="text-xs font-semibold text-[#A89BC2] hover:text-white transition-colors truncate"
        >
          {account.name}
        </button>
        <button
          onClick={onToggleCollapse}
          className="text-[#6B5A8A] hover:text-[#A89BC2] transition-colors text-xs flex-shrink-0"
          aria-label="Recolher"
        >
          ▼
        </button>
      </div>

      {/* Character cards */}
      <SortableContext
        items={charIds}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex items-center gap-2">
          {characters.map((character) => (
            <SortableCharCard
              key={character.id}
              character={character}
              isSelected={character.id === selectedCharId}
              onSelect={onSelectChar}
              onEdit={onEditChar}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
