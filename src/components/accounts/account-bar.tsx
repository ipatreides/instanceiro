"use client";

import type { Account, Character } from "@/lib/types";
import { AccountContainer } from "./account-container";
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
import { useMemo, useRef, useState, useEffect, useCallback } from "react";

interface AccountBarProps {
  accounts: Account[];
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onOpenAccountModal: (account: Account) => void;
  onCreateAccount: () => void;
  onReorderAccounts: (orderedIds: string[]) => void;
  onReorderCharacters: (
    accountId: string,
    orderedCharIds: string[]
  ) => void;
}

function SortableAccountItem({
  account,
  characters,
  selectedCharId,
  onSelectChar,
  onEditChar,
  onOpenAccountModal,
  onReorderChars,
}: {
  account: Account;
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onOpenAccountModal: () => void;
  onReorderChars: (orderedCharIds: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `account-${account.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <AccountContainer
        account={account}
        characters={characters}
        selectedCharId={selectedCharId}
        onSelectChar={onSelectChar}
        onEditChar={onEditChar}
        onOpenAccountModal={onOpenAccountModal}
        onReorderChars={onReorderChars}
        dragListeners={listeners}
      />
    </div>
  );
}

export function AccountBar({
  accounts,
  characters,
  selectedCharId,
  onSelectChar,
  onEditChar,
  onOpenAccountModal,
  onCreateAccount,
  onReorderAccounts,
  onReorderCharacters,
}: AccountBarProps) {
  const charsByAccount = useMemo(() => {
    const map = new Map<string, Character[]>();
    for (const account of accounts) {
      map.set(account.id, []);
    }
    for (const char of characters) {
      const list = map.get(char.account_id);
      if (list) {
        list.push(char);
      }
    }
    return map;
  }, [accounts, characters]);

  const accountIds = accounts.map((a) => `account-${a.id}`);

  // Require 10px of movement before starting drag — allows clicks to work
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Account-level reorder only — char reorder handled by each AccountContainer's own DndContext
    if (activeId.startsWith("account-") && overId.startsWith("account-")) {
      const oldIndex = accountIds.indexOf(activeId);
      const newIndex = accountIds.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(
          accounts.map((a) => a.id),
          oldIndex,
          newIndex
        );
        onReorderAccounts(newOrder);
      }
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, accounts, characters]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" });
  };

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext
        items={accountIds}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex items-stretch gap-2">
          {/* Scrollable accounts area */}
          <div className="relative min-w-0 flex-1">
            {/* Left arrow */}
            {canScrollLeft && (
              <button
                onClick={() => scroll("left")}
                className="absolute left-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-gradient-to-r from-bg to-transparent cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                aria-label="Rolar para esquerda"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-primary">
                  <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}

            <div
              ref={scrollRef}
              className="flex items-stretch gap-2 overflow-x-auto pb-1 select-none scrollbar-thin"
            >
              {accounts.map((account) => (
                <SortableAccountItem
                  key={account.id}
                  account={account}
                  characters={charsByAccount.get(account.id) ?? []}
                  selectedCharId={selectedCharId}
                  onSelectChar={onSelectChar}
                  onEditChar={onEditChar}
                  onOpenAccountModal={() => onOpenAccountModal(account)}
                  onReorderChars={(orderedCharIds) =>
                    onReorderCharacters(account.id, orderedCharIds)
                  }
                />
              ))}
            </div>

            {/* Right arrow */}
            {canScrollRight && (
              <button
                onClick={() => scroll("right")}
                className="absolute right-0 top-0 bottom-0 z-10 w-8 flex items-center justify-center bg-gradient-to-l from-bg to-transparent cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                aria-label="Rolar para direita"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-primary">
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Add account button — always visible */}
          <button
            onClick={onCreateAccount}
            className="flex-shrink-0 flex items-center justify-center w-12 rounded-lg border-2 border-dashed border-border text-text-secondary hover:border-primary-hover hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Adicionar conta"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}
