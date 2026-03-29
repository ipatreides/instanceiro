"use client";

import type { Account, Character } from "@/lib/types";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface AccountContainerProps {
  account: Account;
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onOpenAccountModal: () => void;
  onReorderChars: (orderedCharIds: string[]) => void;
  dragListeners?: Record<string, unknown>;
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

  const selectedClass = "bg-primary border-primary text-bg";
  const unselectedClass = "bg-surface border-border text-text-secondary hover:border-primary-hover hover:text-text-primary";
  const subTextSelected = "text-primary-secondary";
  const subTextUnselected = "text-text-secondary";

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (isSelected) {
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
    </button>
  );
}

export function AccountContainer({
  account,
  characters,
  selectedCharId,
  onSelectChar,
  onEditChar,
  onOpenAccountModal,
  onReorderChars,
  dragListeners,
}: AccountContainerProps) {
  const charIds = characters.map((c) => `char-${c.id}`);

  const charSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  );

  function handleCharDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCharId = String(active.id).replace("char-", "");
    const overCharId = String(over.id).replace("char-", "");

    const currentIds = characters.map((c) => c.id);
    const oldIndex = currentIds.indexOf(activeCharId);
    const newIndex = currentIds.indexOf(overCharId);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderChars(arrayMove(currentIds, oldIndex, newIndex));
    }
  }

  return (
    <div className="flex-shrink-0 rounded-lg border border-border p-2">
      {/* Header — drag handle for the whole account */}
      <div
        className="flex items-center justify-between gap-2 mb-2 px-1 cursor-grab active:cursor-grabbing"
        {...dragListeners}
      >
        <button
          onClick={onOpenAccountModal}
          className="text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors truncate flex items-center gap-1"
          title="Gerenciar conta"
        >
          {account.name}
          <span className="text-[10px] opacity-50">⚙</span>
        </button>
      </div>

      {/* Character cards — own DndContext for char reordering */}
      {/* Wrap in a div that stops pointer events from bubbling to parent DndContext */}
      <div onPointerDown={(e) => e.stopPropagation()}>
      <DndContext
        collisionDetection={closestCenter}
        sensors={charSensors}
        onDragEnd={handleCharDragEnd}
      >
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
      </DndContext>
      </div>
    </div>
  );
}
