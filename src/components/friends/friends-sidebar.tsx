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
    suggestions,
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Amigos</h2>
        {onClose && (
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-lg cursor-pointer lg:hidden">
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {loading ? (
          <p className="text-xs text-text-secondary">Carregando...</p>
        ) : (
          <>
            {/* Pending received */}
            {pendingReceived.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs text-text-secondary uppercase tracking-wide font-semibold">
                  Pedidos ({pendingReceived.length})
                </h3>
                {pendingReceived.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 bg-surface rounded px-3 py-2">
                    {f.avatar_url && (
                      <img src={f.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="text-xs text-text-secondary flex-1 truncate">@{f.username}</span>
                    <button
                      onClick={() => acceptRequest(f.id)}
                      className="text-xs text-status-available hover:text-status-available-text cursor-pointer"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => rejectRequest(f.id)}
                      className="text-xs text-status-error hover:text-status-error-text cursor-pointer"
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
                <h3 className="text-xs text-text-secondary uppercase tracking-wide font-semibold">
                  Enviados ({pendingSent.length})
                </h3>
                {pendingSent.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 bg-surface rounded px-3 py-2">
                    {f.avatar_url && (
                      <img src={f.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="text-xs text-text-secondary flex-1 truncate">@{f.username}</span>
                    <span className="text-xs text-text-secondary italic">pendente</span>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <div className="flex flex-col gap-2">
              <h3 className="text-xs text-text-secondary uppercase tracking-wide font-semibold">
                Amigos ({friends.length})
              </h3>
              {friends.length === 0 ? (
                <p className="text-xs text-text-secondary italic">Nenhum amigo ainda</p>
              ) : (
                friends.map((f) => (
                  <div key={f.id} className="flex flex-col gap-1">
                    <div className="group flex items-center gap-2 bg-surface rounded px-3 py-2">
                      {f.avatar_url && (
                        <img src={f.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-text-primary block truncate">@{f.username}</span>
                        {f.display_name && (
                          <span className="text-xs text-text-secondary block truncate">{f.display_name}</span>
                        )}
                      </div>
                      <button
                        onClick={() => setConfirmRemoveId(f.id)}
                        className="text-xs text-status-error hover:text-status-error-text cursor-pointer opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                    {confirmRemoveId === f.id && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-status-error/10 rounded text-xs">
                        <span className="text-status-error flex-1">Remover @{f.username}?</span>
                        <button
                          onClick={() => { removeFriend(f.id); setConfirmRemoveId(null); }}
                          className="text-status-error hover:text-status-error-text font-semibold cursor-pointer"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(null)}
                          className="text-text-secondary hover:text-text-primary cursor-pointer"
                        >
                          Não
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs text-text-secondary uppercase tracking-wide font-semibold">
                  Sugestoes ({suggestions.length})
                </h3>
                {suggestions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 bg-surface rounded px-3 py-2">
                    {s.avatar_url && (
                      <img src={s.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-text-primary block truncate">@{s.username}</span>
                      {s.display_name && (
                        <span className="text-xs text-text-secondary block truncate">{s.display_name}</span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        const result = await sendRequest(s.username);
                        if (result.error) setError(result.error);
                      }}
                      className="text-xs text-primary hover:text-primary-hover cursor-pointer font-semibold"
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Add friend input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary text-xs font-medium">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="username"
              className="w-full bg-surface border border-border rounded pl-6 pr-2 py-1.5 text-text-primary text-xs placeholder-text-secondary focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !username.trim()}
            className="px-3 py-1.5 rounded bg-primary text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors cursor-pointer"
          >
            {sending ? "..." : "Adicionar"}
          </button>
        </div>
        {error && <p className="text-xs text-status-error mt-1">{error}</p>}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: always visible, fixed overlay on right */}
      <aside className="hidden lg:flex flex-col fixed right-4 bottom-4 w-[280px] h-[50vh] min-h-[300px] bg-surface border border-border rounded-[var(--radius-lg)] z-30 shadow-lg overflow-hidden">
        {content}
      </aside>

      {/* Mobile: drawer overlay, toggle controlled */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <aside className="absolute right-0 top-0 h-full w-[300px] bg-surface border-l border-border flex flex-col shadow-lg">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
