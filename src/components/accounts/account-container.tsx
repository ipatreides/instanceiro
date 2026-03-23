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
    ? "bg-primary-secondary border-primary-secondary text-white"
    : "bg-primary border-primary text-white";
  const unselectedClass = isShared
    ? "bg-surface border-primary-secondary/40 text-primary-secondary hover:border-primary-secondary hover:text-white"
    : "bg-surface border-border text-text-secondary hover:border-primary-hover hover:text-white";
  const subTextSelected = isShared ? "text-bg/70" : "text-primary-secondary";
  const subTextUnselected = isShared ? "text-primary-secondary/60" : "text-text-secondary";

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
          isSelected ? subTextSelected : "text-text-secondary"
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
            isSelected ? subTextSelected : "text-primary-secondary/50"
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
      <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 py-2.5 rounded-lg border border-border bg-surface min-h-[100px] gap-1">
        <button
          onClick={onOpenAccountModal}
          className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors truncate max-w-[80px]"
          title={account.name}
        >
          {account.name}
        </button>
        <span className="text-[10px] text-text-secondary">
          ({characters.length})
        </span>
        <button
          onClick={onToggleCollapse}
          className="text-text-secondary hover:text-text-secondary transition-colors text-xs mt-1"
          aria-label="Expandir"
        >
          ►
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-border p-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <button
          onClick={onOpenAccountModal}
          className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors truncate flex items-center gap-1"
          title="Gerenciar conta"
        >
          {account.name}
          <span className="text-[10px] opacity-50">⚙</span>
        </button>
        <button
          onClick={onToggleCollapse}
          className="text-text-secondary hover:text-text-primary transition-colors text-xs flex-shrink-0"
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
