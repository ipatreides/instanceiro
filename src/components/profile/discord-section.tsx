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

export function DiscordSection() {
  const {
    loading, discordUserId, discordUsername, isDiscordLogin,
    hourlyEnabled, scheduleEnabled,
    botGuildId, botChannelId, alertMinutes,
    toggleHourly, toggleSchedule, disconnect, sendTest,
    setBotChannel, setAlertMinutes, fetchChannels, getBotOAuthURL,
  } = useDiscordNotifications();

  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // Not connected
  if (!discordUserId) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-[22px] font-semibold text-text-primary">Discord</h2>
        <p className="text-sm text-text-secondary">
          Conecte seu Discord para receber notificações de instâncias e alertas de MVP.
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

  const loadChannels = async () => {
    setChannelsLoading(true);
    setChannelsError(null);
    const result = await fetchChannels();
    if ("error" in result) {
      setChannelsError(result.error === "bot_not_in_guild" ? "Bot não encontrado no servidor. Adicione novamente." : result.error);
      setChannels(null);
    } else {
      setChannels(result);
    }
    setChannelsLoading(false);
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-semibold text-text-primary">Discord</h2>
        {discordUsername && (
          <span className="text-sm text-text-secondary">
            Conectado como {discordUsername}
          </span>
        )}
      </div>

      {/* Section A: DM Notifications */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Notificações por DM</h3>

        {isDiscordLogin && DISCORD_INVITE_URL && (
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:text-text-primary transition-colors"
          >
            Entrar no servidor Instanceiro →
          </a>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">Instâncias horárias</span>
          <Toggle enabled={hourlyEnabled} onToggle={() => toggleHourly(!hourlyEnabled)} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">Agendamentos</span>
          <Toggle enabled={scheduleEnabled} onToggle={() => toggleSchedule(!scheduleEnabled)} />
        </div>
        <button
          onClick={async () => {
            setTestStatus("Enviando...");
            const result = await sendTest();
            setTestStatus(result.ok ? "Enviado!" : result.error ?? "Erro");
            setTimeout(() => setTestStatus(null), 3000);
          }}
          className="self-start text-xs text-primary hover:text-text-primary cursor-pointer transition-colors"
        >
          {testStatus ?? "Enviar teste"}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Section B: Bot MVP Timer */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Bot MVP Timer</h3>

        {/* Step B1: Add bot */}
        {!botGuildId ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-secondary">
              Adicione o bot do Instanceiro ao seu servidor para receber alertas de MVP.
            </p>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); window.location.href = getBotOAuthURL(); }}
              className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-[#5865F2] text-white font-semibold text-sm hover:bg-[#4752C4] transition-colors cursor-pointer"
            >
              Adicionar bot ao servidor
            </a>
          </div>
        ) : (
          <>
            {/* Step B2: Select channel */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-primary">Canal</span>
                <button
                  onClick={() => { window.location.href = getBotOAuthURL(); }}
                  className="text-[10px] text-text-secondary hover:text-primary cursor-pointer"
                >
                  Alterar servidor
                </button>
              </div>

              {!channels && !channelsError && (
                <button
                  onClick={loadChannels}
                  disabled={channelsLoading}
                  className="self-start text-xs text-primary hover:text-text-primary cursor-pointer transition-colors disabled:opacity-50"
                >
                  {channelsLoading ? "Carregando..." : "Selecionar canal"}
                </button>
              )}

              {channelsError && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-status-error-text">{channelsError}</span>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); window.location.href = getBotOAuthURL(); }}
                    className="text-xs text-primary cursor-pointer"
                  >
                    Adicionar bot novamente
                  </a>
                </div>
              )}

              {channels && (
                <select
                  value={botChannelId ?? ""}
                  onChange={(e) => { if (e.target.value) setBotChannel(e.target.value); }}
                  className="bg-bg border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-primary transition-colors"
                >
                  <option value="">Selecione um canal</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              )}

              {botChannelId && !channels && (
                <span className="text-xs text-text-secondary">
                  Canal configurado: {botChannelId}
                  <button onClick={loadChannels} className="text-primary ml-2 cursor-pointer">Alterar</button>
                </span>
              )}
            </div>

            {/* Step B3: Alert timing */}
            {botChannelId && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-primary">Alerta antes do spawn:</span>
                <div className="flex gap-1">
                  {([5, 10, 15] as const).map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setAlertMinutes(mins)}
                      className={`px-2.5 py-1 text-xs rounded-md cursor-pointer transition-colors ${
                        alertMinutes === mins
                          ? "bg-primary text-white"
                          : "bg-bg border border-border text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {mins}min
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Disconnect */}
      <div className="border-t border-border pt-3">
        <button
          onClick={disconnect}
          className="text-xs text-status-error-text hover:opacity-80 cursor-pointer"
        >
          Desconectar Discord
        </button>
      </div>
    </div>
  );
}
