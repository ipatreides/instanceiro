"use client";

import type { Account, Character } from "@/lib/types";
import { AccountContainer } from "./account-container";
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

  function handleMoveAccount(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= accounts.length) return;
    const ids = accounts.map((a) => a.id);
    // Swap
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    onReorderAccounts(ids);
  }

  return (
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1 select-none">
      {accounts.map((account, index) => (
        <AccountContainer
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
          onMoveLeft={index > 0 ? () => handleMoveAccount(index, -1) : undefined}
          onMoveRight={index < accounts.length - 1 ? () => handleMoveAccount(index, 1) : undefined}
        />
      ))}

      {/* Add account button */}
      <button
        onClick={onCreateAccount}
        className="flex-shrink-0 flex items-center justify-center w-12 rounded-lg border-2 border-dashed border-border text-text-secondary hover:border-primary-hover hover:text-text-primary transition-colors cursor-pointer"
        aria-label="Adicionar conta"
      >
        <span className="text-xl leading-none">+</span>
      </button>
    </div>
  );
}
