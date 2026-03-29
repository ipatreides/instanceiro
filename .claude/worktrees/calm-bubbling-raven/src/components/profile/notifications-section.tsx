"use client";

import { useState } from "react";
import { useDiscordNotifications } from "@/hooks/use-discord-notifications";

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? "";

function getDiscordOAuthURL(): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID ?? "";
  const redirectUri = encodeURIComponent(
    `${window.location.origin}/api/discord-notify-callback`
  );
  const state = crypto.randomUUID();
  document.cookie = `discord_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`;
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join&state=${state}`;
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
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
  );
}

export function NotificationsSection() {
  const {
    loading, discordUserId, hourlyEnabled, scheduleEnabled, discordUsername,
    isDiscordLogin, toggleHourly, toggleSchedule, disconnect, sendTest,
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

  // Not connected
  if (!discordUserId) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-[22px] font-semibold text-text-primary">Notificacoes</h2>
        <p className="text-sm text-text-secondary">
          Receba mensagens no Discord sobre instancias horarias e agendamentos.
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

  const anyEnabled = hourlyEnabled || scheduleEnabled;

  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-[22px] font-semibold text-text-primary">Notificacoes</h2>
      <p className="text-sm text-text-secondary">
        Receba mensagens no Discord sobre instancias horarias e agendamentos.
      </p>

      {/* Server invite for Discord-login users */}
      {isDiscordLogin && !anyEnabled && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
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

      {/* Connected info */}
      {discordUsername && (
        <span className="text-sm text-text-secondary">
          Conectado como {discordUsername}
        </span>
      )}

      {/* Hourly toggle */}
      <div className="flex items-center justify-between py-1">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">Instancias horarias</span>
          <span className="text-[13px] text-text-secondary">Aviso quando cooldown expirar</span>
        </div>
        <Toggle enabled={hourlyEnabled} onToggle={() => toggleHourly(!hourlyEnabled)} />
      </div>

      {/* Schedule toggle */}
      <div className="flex items-center justify-between py-1">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">Agendamentos</span>
          <span className="text-[13px] text-text-secondary">Aviso antes do horario agendado</span>
        </div>
        <Toggle enabled={scheduleEnabled} onToggle={() => toggleSchedule(!scheduleEnabled)} />
      </div>

      {/* Test button */}
      {anyEnabled && (
        <button
          onClick={handleTest}
          disabled={testSending}
          className="text-[13px] text-primary hover:text-primary-hover transition-colors cursor-pointer disabled:opacity-50 self-start"
        >
          {testSending ? "Enviando..." : "Enviar notificacao teste"}
        </button>
      )}

      {testResult && (
        <p className={`text-[13px] ${testResult.includes("enviada") ? "text-status-available" : "text-status-error"}`}>
          {testResult}
        </p>
      )}

      {/* Disconnect */}
      {!isDiscordLogin && (
        <button
          onClick={disconnect}
          className="text-[13px] text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
        >
          Desconectar Discord
        </button>
      )}
    </div>
  );
}
