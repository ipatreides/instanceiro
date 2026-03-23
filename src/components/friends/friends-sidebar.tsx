"use client";

import { useState } from "react";
import { useFriendships } from "@/hooks/use-friendships";

interface FriendsSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function FriendsSidebar({ isOpen, onClose }: FriendsSidebarProps) {
  const {
    friends,
    pendingReceived,
    pendingSent,
    loading,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
  } = useFriendships();

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  async function handleSend() {
    if (!username.trim()) return;
    setSending(true);
    setError(null);
    const result = await sendRequest(username.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setUsername("");
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#3D2A5C]">
        <h2 className="text-sm font-semibold text-white">Amigos</h2>
        {onClose && (
          <button onClick={onClose} className="text-[#A89BC2] hover:text-white text-lg cursor-pointer lg:hidden">
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {loading ? (
          <p className="text-xs text-[#6B5A8A]">Carregando...</p>
        ) : (
          <>
            {/* Pending received */}
            {pendingReceived.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs text-[#6B5A8A] uppercase tracking-wide font-semibold">
                  Pedidos ({pendingReceived.length})
                </h3>
                {pendingReceived.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 bg-[#2a1f40] rounded px-3 py-2">
                    {f.avatar_url && (
                      <img src={f.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="text-xs text-[#A89BC2] flex-1 truncate">@{f.username}</span>
                    <button
                      onClick={() => acceptRequest(f.id)}
                      className="text-xs text-green-400 hover:text-green-300 cursor-pointer"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => rejectRequest(f.id)}
                      className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      ✗
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sent requests */}
            {pendingSent.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs text-[#6B5A8A] uppercase tracking-wide font-semibold">
                  Enviados ({pendingSent.length})
                </h3>
                {pendingSent.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 bg-[#2a1f40] rounded px-3 py-2">
                    {f.avatar_url && (
                      <img src={f.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="text-xs text-[#6B5A8A] flex-1 truncate">@{f.username}</span>
                    <span className="text-xs text-[#6B5A8A] italic">pendente</span>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs text-[#6B5A8A] uppercase tracking-wide font-semibold">
                Amigos ({friends.length})
              </h3>
              {friends.length === 0 ? (
                <p className="text-xs text-[#6B5A8A] italic">Nenhum amigo ainda</p>
              ) : (
                friends.map((f) => (
                  <div key={f.id} className="flex flex-col gap-1">
                    <div className="group flex items-center gap-2 bg-[#2a1f40] rounded px-3 py-2">
                      {f.avatar_url && (
                        <img src={f.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-white block truncate">@{f.username}</span>
                        {f.display_name && (
                          <span className="text-xs text-[#6B5A8A] block truncate">{f.display_name}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setConfirmRemoveId(f.id)}
                        className="text-xs text-red-400 hover:text-red-300 cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                    {confirmRemoveId === f.id && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 rounded text-xs">
                        <span className="text-red-400 flex-1">Remover @{f.username}?</span>
                        <button
                          onClick={() => { removeFriend(f.id); setConfirmRemoveId(null); }}
                          className="text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(null)}
                          className="text-[#A89BC2] hover:text-white cursor-pointer"
                        >
                          Não
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Add friend input */}
      <div className="px-4 py-3 border-t border-[#3D2A5C]">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B5A8A] text-xs font-medium">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="username"
              className="w-full bg-[#2a1f40] border border-[#3D2A5C] rounded pl-6 pr-2 py-1.5 text-white text-xs placeholder-[#6B5A8A] focus:outline-none focus:border-[#7C3AED] transition-colors"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !username.trim()}
            className="px-3 py-1.5 rounded bg-[#7C3AED] text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#6D28D9] transition-colors cursor-pointer"
          >
            {sending ? "..." : "Adicionar"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: always visible sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] flex-shrink-0 bg-[#1a1230] border-l border-[#3D2A5C] h-[calc(100vh-49px)] sticky top-[49px]">
        {content}
      </aside>

      {/* Mobile: drawer overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <aside className="absolute right-0 top-0 h-full w-[300px] bg-[#1a1230] border-l border-[#3D2A5C] flex flex-col">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
