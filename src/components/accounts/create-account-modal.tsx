"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { CharacterForm } from "@/components/characters/character-form";
import type { Server } from "@/lib/types";

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: Server[];
  onCreate: (name: string, serverId: number) => Promise<{ id: string }>;
  onCreateCharacter: (data: { name: string; class_name: string; class_path: string[]; level: number; account_id: string }) => Promise<void>;
}

export function CreateAccountModal({ isOpen, onClose, servers, onCreate, onCreateCharacter }: CreateAccountModalProps) {
  const [step, setStep] = useState<"account" | "character">("account");
  const [accountName, setAccountName] = useState("");
  const [serverId, setServerId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep("account");
      setAccountName("");
      setServerId(null);
      setCreating(false);
      setAccountId(null);
    }
  }, [isOpen]);

  const isValid = accountName.trim().length > 0 && serverId !== null;

  async function handleCreateAccount() {
    if (!isValid || creating || serverId === null) return;
    setCreating(true);
    try {
      const account = await onCreate(accountName.trim(), serverId);
      setAccountId(account.id);
      setStep("character");
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && isValid && !creating) {
      handleCreateAccount();
    }
  }

  async function handleCreateCharacter(data: { name: string; class_name: string; class_path: string[]; level: number; account_id?: string }) {
    if (!accountId) return;
    await onCreateCharacter({
      name: data.name,
      class_name: data.class_name,
      class_path: data.class_path,
      level: data.level,
      account_id: accountId,
    });
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={step === "account" ? "Nova Conta" : "Adicionar Personagem"}>
      {step === "account" ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Nome</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nome da conta"
              autoFocus
              className="bg-surface border border-border rounded-md px-3 py-2 text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-secondary">Servidor</label>
            <div className="flex gap-2">
              {servers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => setServerId(server.id)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    serverId === server.id
                      ? "bg-primary text-white"
                      : "bg-surface text-text-secondary border border-border hover:text-text-primary hover:border-primary"
                  }`}
                >
                  {server.name}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreateAccount}
            disabled={!isValid || creating}
            className="w-full py-2 rounded-md bg-primary text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors cursor-pointer"
          >
            {creating ? "Criando..." : "Criar e adicionar personagem"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            Conta <span className="text-text-primary font-medium">{accountName}</span> criada. Adicione seu primeiro personagem:
          </p>
          <CharacterForm
            accountId={accountId!}
            onSubmit={handleCreateCharacter}
            onCancel={onClose}
            submitLabel="Criar personagem"
          />
        </div>
      )}
    </Modal>
  );
}
