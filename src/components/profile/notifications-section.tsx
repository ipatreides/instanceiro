"use client";

import { useState } from "react";
import { useDiscordNotifications } from "@/hooks/use-discord-notifications";

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "";

function getDiscordOAuthURL(): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "";
  const redirectUri = encodeURIComponent(
    `${window.location.origin}/api/discord-notify-callback`
  );
  // Generate CSRF state, store in cookie
  const state = crypto.randomUUID();
  document.cookie = `discord_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`;
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join&state=${state}`;
}

export function NotificationsSection() {
  const {
    loading, discordUserId, enabled, discordUsername,
    isDiscordLogin, toggle, disconnect, sendTest,
  } = useDiscordNotifications();

  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (loading) return null;

  async function handleTest() {
    setTestSending(true);
    setTestResult(null);
    const result = await sendTest();
    if (result.ok) {
      setTestResult("Notificacao enviada! Verifique seu Discord.");
    } else if (result.error?.includes("servidor")) {
      setTestResult(result.error);
    } else {
      setTestResult(result.error ?? "Erro ao enviar. Verifique se voce esta no servidor e com DMs ativadas.");
    }
    setTestSending(false);
    if (result.ok) setTimeout(() => setTestResult(null), 5000);
  }

  // State: Google login, no Discord linked
  if (!discordUserId) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-text-primary">Notificacoes</h2>
        <p className="text-xs text-text-secondary">
          Receba uma mensagem no Discord quando suas instancias horarias ficarem disponiveis.
        </p>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.location.href = getDiscordOAuthURL(); }}
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
        >
          Conectar Discord
        </a>
      </div>
    );
  }

  // State: Discord detected (login or linked)
  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-text-primary">Notificacoes</h2>
      <p className="text-xs text-text-secondary">
        Receba uma mensagem no Discord quando suas instancias horarias ficarem disponiveis.
      </p>

      {/* Server invite (always visible for Discord-login users who might not be in server) */}
      {isDiscordLogin && !enabled && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-secondary">
            Para receber notificacoes, entre no servidor do Instanceiro:
          </p>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
          >
            Entrar no servidor
          </a>
        </div>
      )}

      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm text-text-primary">Instancias horarias</span>
          {discordUsername && (
            <span className="text-xs text-text-secondary">
              Conectado como {discordUsername}
            </span>
          )}
        </div>
        <button
          onClick={() => toggle(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
            enabled ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Test button + result */}
      {enabled && (
        <button
          onClick={handleTest}
          disabled={testSending}
          className="text-xs text-primary hover:text-primary-hover transition-colors cursor-pointer disabled:opacity-50 self-start"
        >
          {testSending ? "Enviando..." : "Enviar notificacao teste"}
        </button>
      )}

      {testResult && (
        <p className={`text-xs ${testResult.includes("enviada") ? "text-status-available" : "text-status-error"}`}>
          {testResult}
        </p>
      )}

      {/* Disconnect (Google-linked users only) */}
      {!isDiscordLogin && (
        <button
          onClick={disconnect}
          className="text-xs text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
        >
          Desconectar Discord
        </button>
      )}
    </div>
  );
}
