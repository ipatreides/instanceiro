"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import type { Server } from "@/lib/types";

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: Server[];
  onCreate: (name: string, serverId: number) => Promise<void>;
}

export function CreateAccountModal({ isOpen, onClose, servers, onCreate }: CreateAccountModalProps) {
  const [name, setName] = useState("");
  const [serverId, setServerId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setServerId(null);
      setCreating(false);
    }
  }, [isOpen]);

  const isValid = name.trim().length > 0 && serverId !== null;

  async function handleCreate() {
    if (!isValid || creating || serverId === null) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), serverId);
      onClose();
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && isValid && !creating) {
      handleCreate();
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova Conta">
      <div className="flex flex-col gap-5">
        {/* Name input */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[#A89BC2]">Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nome da conta"
            autoFocus
            className="bg-[#2a1f40] border border-[#3D2A5C] rounded-md px-3 py-2 text-white placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
          />
        </div>

        {/* Server selector */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[#A89BC2]">Servidor</label>
          <div className="flex gap-2">
            {servers.map((server) => (
              <button
                key={server.id}
                type="button"
                onClick={() => setServerId(server.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  serverId === server.id
                    ? "bg-[#7C3AED] text-white"
                    : "bg-[#2a1f40] text-[#A89BC2] border border-[#3D2A5C] hover:text-white hover:border-[#7C3AED]"
                }`}
              >
                {server.name}
              </button>
            ))}
          </div>
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!isValid || creating}
          className="w-full py-2 rounded-md bg-[#7C3AED] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
        >
          {creating ? "Criando..." : "Criar"}
        </button>
      </div>
    </Modal>
  );
}
