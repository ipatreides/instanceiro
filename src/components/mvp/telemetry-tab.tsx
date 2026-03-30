"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TelemetryToken } from "@/lib/types";
import { formatDateTimeBRT } from "@/lib/date-brt";

interface TelemetryTabProps {
  userId: string;
}

interface TelemetrySession {
  id: string;
  token_id: string;
  current_map: string | null;
  client_version: string | null;
  last_heartbeat: string;
  started_at: string;
}

interface VersionInfo {
  latest_version: string;
  download_url: string;
  changelog: string;
}

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

function isOnline(lastHeartbeat: string): boolean {
  return Date.now() - new Date(lastHeartbeat).getTime() < ONLINE_THRESHOLD_MS;
}

// --- Sub-components ---

function VersionStatus({
  tokens,
  sessions,
  versionInfo,
  versionOffline,
}: {
  tokens: TelemetryToken[];
  sessions: TelemetrySession[];
  versionInfo: VersionInfo | null;
  versionOffline: boolean;
}) {
  if (tokens.length === 0) return null;

  const onlineSession = sessions.find((s) => isOnline(s.last_heartbeat));
  const clientVersion = onlineSession?.client_version ?? sessions[0]?.client_version ?? null;
  const latestVersion = versionInfo?.latest_version ?? null;
  const isUpToDate = clientVersion && latestVersion && clientVersion === latestVersion;
  const isOutdated = clientVersion && latestVersion && clientVersion !== latestVersion;
  const online = !!onlineSession;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
        Versão do Claudinho
      </h4>
      {online && isUpToDate && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-status-available animate-pulse inline-block" />
          <span className="text-sm text-status-available-text font-medium">
            Online · v{clientVersion} (atualizado)
          </span>
        </div>
      )}
      {online && isOutdated && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-available animate-pulse inline-block" />
            <span className="text-sm text-status-error-text font-medium">
              Online · v{clientVersion} (desatualizado)
            </span>
          </div>
          {versionInfo?.download_url && (
            <a
              href={versionInfo.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 text-xs font-medium text-white bg-primary rounded-md px-3 py-1.5 hover:bg-primary-hover transition-colors"
            >
              Baixar v{latestVersion}
            </a>
          )}
        </div>
      )}
      {online && !clientVersion && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-available animate-pulse inline-block" />
            <span className="text-sm text-status-error-text font-medium">
              Online · versão desatualizada
            </span>
          </div>
          {versionInfo?.download_url && (
            <a
              href={versionInfo.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-1 text-xs font-medium text-white bg-primary rounded-md px-3 py-1.5 hover:bg-primary-hover transition-colors"
            >
              Baixar v{latestVersion}
            </a>
          )}
        </div>
      )}
      {!online && clientVersion && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-text-secondary inline-block" />
          <span className="text-sm text-text-secondary">
            Offline · última versão conhecida: v{clientVersion}
          </span>
        </div>
      )}
      {!online && !clientVersion && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-text-secondary inline-block" />
          <span className="text-sm text-text-secondary">Offline · versão desconhecida</span>
        </div>
      )}
      {versionOffline && (
        <p className="text-xs text-text-secondary italic">
          (servidor de versão indisponível)
        </p>
      )}
    </div>
  );
}

function SessionsList({
  tokens,
  sessions,
  revoking,
  onRevokeRequest,
  onRevokeConfirm,
  onRevokeCancel,
}: {
  tokens: TelemetryToken[];
  sessions: TelemetrySession[];
  revoking: string | null;
  onRevokeRequest: (tokenId: string) => void;
  onRevokeConfirm: (tokenId: string) => void;
  onRevokeCancel: () => void;
}) {
  if (tokens.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
        Sniffers Ativos
      </h4>
      <div className="space-y-2">
        {tokens.map((token) => {
          const tokenSession = sessions.find((s) => s.token_id === token.id);
          const online = tokenSession ? isOnline(tokenSession.last_heartbeat) : false;

          return (
            <div
              key={token.id}
              className="flex items-center justify-between bg-bg border border-border rounded-md px-3 py-2 gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    online ? "bg-status-available animate-pulse" : "bg-text-secondary"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm text-text-primary truncate">
                    {token.name ?? "Sniffer"}
                  </div>
                  <div className="text-xs text-text-secondary">
                    {online && tokenSession?.current_map ? (
                      <span>
                        {tokenSession.current_map} ·{" "}
                        {tokenSession.client_version
                          ? `v${tokenSession.client_version}`
                          : "versão desconhecida"}
                      </span>
                    ) : tokenSession ? (
                      <span>
                        Último uso: {formatDateTimeBRT(tokenSession.last_heartbeat)}
                      </span>
                    ) : (
                      <span>Último uso: {formatDateTimeBRT(token.last_used_at)}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0">
                {revoking !== token.id ? (
                  <button
                    onClick={() => onRevokeRequest(token.id)}
                    className="text-xs text-status-error-text hover:opacity-80 cursor-pointer transition-opacity"
                  >
                    Revogar
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => onRevokeConfirm(token.id)}
                      className="text-xs text-white bg-status-error rounded-md px-2 py-1 hover:opacity-80 cursor-pointer transition-opacity"
                    >
                      Confirmar revogação
                    </button>
                    <button
                      onClick={onRevokeCancel}
                      className="text-xs text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    question: "O que é o Claudinho?",
    answer:
      "Programa que roda junto com o Ragnarok e detecta automaticamente quando MVPs morrem, quem matou, e onde a tumba apareceu. As informações aparecem em tempo real no Instanceiro.",
  },
  {
    question: "É seguro?",
    answer:
      "O Claudinho apenas lê os pacotes de rede do jogo. Não modifica nada, não injeta código, não interage com o client. Funciona como um observador passivo.",
  },
  {
    question: "Preciso deixar aberto?",
    answer:
      "Sim, enquanto estiver jogando. Ele roda na bandeja do sistema (ao lado do relógio) e usa poucos recursos.",
  },
  {
    question: "Funciona com mais de um client?",
    answer:
      "Sim, detecta todos os clients do Ragnarok abertos automaticamente.",
  },
];

function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-1">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
        Perguntas Frequentes
      </h4>
      <div className="divide-y divide-border">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between py-2.5 text-left cursor-pointer group"
            >
              <span className="text-sm text-text-primary group-hover:text-primary transition-colors">
                {item.question}
              </span>
              <span className="text-text-secondary ml-2 flex-shrink-0 text-xs">
                {openIndex === i ? "▲" : "▼"}
              </span>
            </button>
            {openIndex === i && (
              <p className="pb-3 text-xs text-text-secondary leading-relaxed">
                {item.answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupGuide({
  latestVersion,
  downloadUrl,
}: {
  latestVersion: string | null;
  downloadUrl: string | null;
}) {
  const steps = [
    {
      label: "Baixe e instale o Npcap",
      link: { href: "https://npcap.com/#download", text: "npcap.com/#download" },
    },
    {
      label: latestVersion
        ? `Baixe o Claudinho v${latestVersion}`
        : "Baixe o Claudinho",
      link: downloadUrl ? { href: downloadUrl, text: "baixar aqui" } : null,
    },
    {
      label: "Abra o Claudinho",
      description: "ele aparece na bandeja do sistema",
    },
    {
      label: 'Clique em "Parear" no Claudinho e insira o código exibido no app',
    },
  ];

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
        Como configurar
      </h4>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] border border-primary text-primary text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <div className="text-sm text-text-primary pt-0.5">
              {step.label}
              {step.description && (
                <span className="text-text-secondary"> — {step.description}</span>
              )}
              {step.link && (
                <>
                  {" "}
                  <a
                    href={step.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs"
                  >
                    {step.link.text}
                  </a>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- Main Component ---

export function TelemetryTab({ userId }: TelemetryTabProps) {
  const [tokens, setTokens] = useState<TelemetryToken[]>([]);
  const [sessions, setSessions] = useState<TelemetrySession[]>([]);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionOffline, setVersionOffline] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("telemetry_tokens")
      .select("id, user_id, name, created_at, last_used_at, revoked_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    setTokens(data ?? []);
  }, [userId]);

  const fetchSessions = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("telemetry_sessions")
      .select("id, token_id, current_map, client_version, last_heartbeat, started_at")
      .eq("user_id", userId)
      .order("last_heartbeat", { ascending: false });
    setSessions(data ?? []);
  }, [userId]);

  const fetchVersion = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry/version");
      if (!res.ok) throw new Error("offline");
      const data = await res.json();
      setVersionInfo(data);
      setVersionOffline(false);
    } catch {
      setVersionOffline(true);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
    fetchSessions();
    fetchVersion();
  }, [fetchTokens, fetchSessions, fetchVersion]);

  // Poll sessions every 30s
  useEffect(() => {
    const interval = setInterval(fetchSessions, 30_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleRevokeConfirm = useCallback(
    async (tokenId: string) => {
      const supabase = createClient();
      await supabase
        .from("telemetry_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", tokenId);
      setRevoking(null);
      fetchTokens();
      fetchSessions();
    },
    [fetchTokens, fetchSessions]
  );

  const hasTokens = tokens.length > 0;

  return (
    <div className="space-y-3">
      <VersionStatus
        tokens={tokens}
        sessions={sessions}
        versionInfo={versionInfo}
        versionOffline={versionOffline}
      />

      <SessionsList
        tokens={tokens}
        sessions={sessions}
        revoking={revoking}
        onRevokeRequest={setRevoking}
        onRevokeConfirm={handleRevokeConfirm}
        onRevokeCancel={() => setRevoking(null)}
      />

      <FaqAccordion />

      {!hasTokens && (
        <SetupGuide
          latestVersion={versionInfo?.latest_version ?? null}
          downloadUrl={versionInfo?.download_url || null}
        />
      )}
    </div>
  );
}
