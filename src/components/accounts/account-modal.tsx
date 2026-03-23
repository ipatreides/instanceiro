"use client";

import { useState, useRef, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { CharacterForm } from "@/components/characters/character-form";
import type { Account, Character, Server } from "@/lib/types";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  characters: Character[];
  servers: Server[];
  onUpdateName: (name: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onCreateCharacter: (data: { name: string; class_name: string; class_path: string[]; level: number; account_id: string }) => Promise<void>;
  onDeleteCharacter: (charId: string) => Promise<void>;
  autoShowCharForm?: boolean;
}

export function AccountModal({
  isOpen,
  onClose,
  account,
  characters,
  servers,
  onUpdateName,
  onDeleteAccount,
  onCreateCharacter,
  onDeleteCharacter,
  autoShowCharForm,
}: AccountModalProps) {
  const [editName, setEditName] = useState("");
  const [showCharForm, setShowCharForm] = useState(false);
  const [confirmDeleteChar, setConfirmDeleteChar] = useState<string | null>(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletingChar, setDeletingChar] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (account) setEditName(account.name);
  }, [account]);

  useEffect(() => {
    if (!isOpen) {
      setShowCharForm(false);
      setConfirmDeleteChar(null);
      setConfirmDeleteAccount(false);
    } else if (autoShowCharForm) {
      setShowCharForm(true);
    }
  }, [isOpen, autoShowCharForm]);

  if (!account) return null;

  const serverName = servers.find((s) => s.id === account.server_id)?.name ?? "—";

  async function saveName() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== account!.name) {
      await onUpdateName(trimmed);
    } else {
      setEditName(account!.name);
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  }

  async function handleDeleteChar(charId: string) {
    setDeletingChar(charId);
    try {
      await onDeleteCharacter(charId);
    } finally {
      setDeletingChar(null);
      setConfirmDeleteChar(null);
    }
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      await onDeleteAccount();
    } finally {
      setDeletingAccount(false);
      setConfirmDeleteAccount(false);
    }
  }

  async function handleCreateCharacter(data: { name: string; class_name: string; class_path: string[]; level: number; account_id?: string }) {
    await onCreateCharacter({
      name: data.name,
      class_name: data.class_name,
      class_path: data.class_path,
      level: data.level,
      account_id: account!.id,
    });
    setShowCharForm(false);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Conta">
      <div className="flex flex-col gap-5">
        {/* Account name (editable) */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-secondary">Nome da conta</label>
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={saveName}
            onKeyDown={handleNameKeyDown}
            className="bg-surface border border-border rounded-md px-3 py-2 text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Server (read-only) */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Servidor:</span>
          <span className="px-2 py-0.5 text-xs rounded bg-surface border border-border text-text-secondary">
            {serverName}
          </span>
        </div>

        {/* Character list */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-secondary">
            Personagens ({characters.length})
          </span>
          {characters.length === 0 ? (
            <p className="text-sm text-text-secondary py-2">Nenhum personagem nesta conta.</p>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              {characters.map((char) => (
                <div
                  key={char.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-bg border border-border"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-text-primary">{char.name}</span>
                    <span className="text-xs text-text-secondary">
                      {char.class} Lv.{char.level}
                    </span>
                  </div>
                  {confirmDeleteChar === char.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-status-error">Excluir?</span>
                      <button
                        onClick={() => handleDeleteChar(char.id)}
                        disabled={deletingChar === char.id}
                        className="text-xs text-status-error hover:text-red-300 cursor-pointer disabled:opacity-50"
                      >
                        {deletingChar === char.id ? "..." : "Sim"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteChar(null)}
                        className="text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteChar(char.id)}
                      className="text-status-error/60 hover:text-status-error text-sm cursor-pointer transition-colors"
                      title="Excluir personagem"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add character */}
        {showCharForm ? (
          <div className="border border-border rounded-md p-3 bg-bg">
            <CharacterForm
              accountId={account.id}
              onSubmit={handleCreateCharacter}
              onCancel={() => setShowCharForm(false)}
              submitLabel="Adicionar"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowCharForm(true)}
            className="w-full py-2 rounded-md border border-dashed border-border text-sm text-text-secondary hover:text-text-primary hover:border-primary transition-colors cursor-pointer"
          >
            + Adicionar personagem
          </button>
        )}

        {/* Delete account */}
        <div className="pt-2 border-t border-border">
          {confirmDeleteAccount ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-status-error">
                Excluir conta e todos os {characters.length} personagens?
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="px-3 py-1.5 text-xs text-status-error bg-red-900/20 border border-red-900/50 rounded hover:bg-red-900/40 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deletingAccount ? "Excluindo..." : "Confirmar"}
                </button>
                <button
                  onClick={() => setConfirmDeleteAccount(false)}
                  className="px-3 py-1.5 text-xs text-text-secondary bg-surface border border-border rounded hover:text-text-primary transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteAccount(true)}
              className="text-sm text-status-error/70 hover:text-status-error transition-colors cursor-pointer"
            >
              Excluir conta
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
