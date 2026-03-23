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
    }
  }, [isOpen]);

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
          <label className="text-sm font-medium text-[#A89BC2]">Nome da conta</label>
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={saveName}
            onKeyDown={handleNameKeyDown}
            className="bg-[#2a1f40] border border-[#3D2A5C] rounded-md px-3 py-2 text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
          />
        </div>

        {/* Server (read-only) */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#6B5A8A]">Servidor:</span>
          <span className="px-2 py-0.5 text-xs rounded bg-[#2a1f40] border border-[#3D2A5C] text-[#A89BC2]">
            {serverName}
          </span>
        </div>

        {/* Character list */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-[#A89BC2]">
            Personagens ({characters.length})
          </span>
          {characters.length === 0 ? (
            <p className="text-sm text-[#6B5A8A] py-2">Nenhum personagem nesta conta.</p>
          ) : (
            <div className="flex flex-col gap-1 mt-1">
              {characters.map((char) => (
                <div
                  key={char.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-[#0f0a1a] border border-[#3D2A5C]"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-white">{char.name}</span>
                    <span className="text-xs text-[#6B5A8A]">
                      {char.class} Lv.{char.level}
                    </span>
                  </div>
                  {confirmDeleteChar === char.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-400">Excluir?</span>
                      <button
                        onClick={() => handleDeleteChar(char.id)}
                        disabled={deletingChar === char.id}
                        className="text-xs text-red-400 hover:text-red-300 cursor-pointer disabled:opacity-50"
                      >
                        {deletingChar === char.id ? "..." : "Sim"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteChar(null)}
                        className="text-xs text-[#A89BC2] hover:text-white cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteChar(char.id)}
                      className="text-red-400/60 hover:text-red-400 text-sm cursor-pointer transition-colors"
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
          <div className="border border-[#3D2A5C] rounded-md p-3 bg-[#0f0a1a]">
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
            className="w-full py-2 rounded-md border border-dashed border-[#3D2A5C] text-sm text-[#A89BC2] hover:text-white hover:border-[#7C3AED] transition-colors cursor-pointer"
          >
            + Adicionar personagem
          </button>
        )}

        {/* Delete account */}
        <div className="pt-2 border-t border-[#3D2A5C]">
          {confirmDeleteAccount ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-red-400">
                Excluir conta e todos os {characters.length} personagens?
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deletingAccount}
                  className="px-3 py-1.5 text-xs text-red-400 bg-red-900/20 border border-red-900/50 rounded hover:bg-red-900/40 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deletingAccount ? "Excluindo..." : "Confirmar"}
                </button>
                <button
                  onClick={() => setConfirmDeleteAccount(false)}
                  className="px-3 py-1.5 text-xs text-[#A89BC2] bg-[#1a1230] border border-[#3D2A5C] rounded hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteAccount(true)}
              className="text-sm text-red-400/70 hover:text-red-400 transition-colors cursor-pointer"
            >
              Excluir conta
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
