"use client";

import type { Account, Character } from "@/lib/types";
import { AccountContainer } from "./account-container";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";

interface AccountBarProps {
  accounts: Account[];
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onToggleCollapse: (accountId: string) => void;
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
  onToggleCollapse,
  onOpenAccountModal,
  onReorderChars,
}: {
  account: Account;
  characters: Character[];
  selectedCharId: string | null;
  onSelectChar: (char: Character) => void;
  onEditChar: (char: Character) => void;
  onToggleCollapse: () => void;
  onOpenAccountModal: () => void;
  onReorderChars: (orderedCharIds: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: `account-${account.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <AccountContainer
        account={account}
        characters={characters}
        selectedCharId={selectedCharId}
        onSelectChar={onSelectChar}
        onEditChar={onEditChar}
        onToggleCollapse={onToggleCollapse}
        onOpenAccountModal={onOpenAccountModal}
        onReorderChars={onReorderChars}
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
  onToggleCollapse,
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Account-level reorder
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
      return;
    }

    // Character-level reorder (within same account)
    if (activeId.startsWith("char-") && overId.startsWith("char-")) {
      const activeCharId = activeId.replace("char-", "");
      const overCharId = overId.replace("char-", "");

      const activeChar = characters.find((c) => c.id === activeCharId);
      const overChar = characters.find((c) => c.id === overCharId);

      if (
        activeChar &&
        overChar &&
        activeChar.account_id === overChar.account_id
      ) {
        const accountId = activeChar.account_id;
        const accountChars = charsByAccount.get(accountId) ?? [];
        const charIdList = accountChars.map((c) => c.id);

        const oldIndex = charIdList.indexOf(activeCharId);
        const newIndex = charIdList.indexOf(overCharId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(charIdList, oldIndex, newIndex);
          onReorderCharacters(accountId, newOrder);
        }
      }
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={accountIds}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1 select-none">
          {accounts.map((account) => (
            <SortableAccountItem
              key={account.id}
              account={account}
              characters={charsByAccount.get(account.id) ?? []}
              selectedCharId={selectedCharId}
              onSelectChar={onSelectChar}
              onEditChar={onEditChar}
              onToggleCollapse={() => onToggleCollapse(account.id)}
              onOpenAccountModal={() => onOpenAccountModal(account)}
              onReorderChars={(orderedCharIds) =>
                onReorderCharacters(account.id, orderedCharIds)
              }
            />
          ))}

          {/* Add account button */}
          <button
            onClick={onCreateAccount}
            className="flex-shrink-0 flex items-center justify-center w-12 rounded-lg border-2 border-dashed border-[#3D2A5C] text-[#6B5A8A] hover:border-[#6D28D9] hover:text-[#A89BC2] transition-colors cursor-pointer"
            aria-label="Adicionar conta"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}
