"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TelemetryToken } from "@/lib/types";
import { formatDateTimeBRT } from "@/lib/date-brt";
import { UserPlus } from "lucide-react";

interface TelemetryEventLog {
  id: string;
  endpoint: string;
  result: 'created' | 'updated' | 'ignored' | 'error';
  reason: string | null;
  timestamp: string;
  token_id: string | null;
}

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
  character_id: number;
  character_name: string | null;
  in_instance: boolean;
  instance_name: string | null;
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

function heartbeatHealth(lastHeartbeat: string): 'available' | 'soon' | 'error' {
  const diff = Date.now() - new Date(lastHeartbeat).getTime()
  if (diff < 2 * 60 * 1000) return 'available'
  if (diff < 5 * 60 * 1000) return 'soon'
  return 'error'
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const ENDPOINT_ABBREV: Record<string, string> = {
  'mvp-kill': 'kill',
  'mvp-killer': 'killer',
  'mvp-tomb': 'tomb',
  'mvp-spotted': 'spotted',
  'mvp-event': 'event',
  'heartbeat': 'hb',
  'mvp-broadcast': 'bcast',
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
        Personagens Ativos
      </h4>
      <div className="space-y-2">
        {tokens.map((token) => {
          const tokenSessions = sessions.filter((s) => s.token_id === token.id);
          const anyOnline = tokenSessions.some((s) => isOnline(s.last_heartbeat));

          return (
            <div key={token.id} className="bg-bg border border-border rounded-md px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      anyOnline ? "bg-status-available animate-pulse" : "bg-text-secondary"
                    }`}
                  />
                  <span className="text-sm text-text-primary">{token.name ?? "Claudinho"}</span>
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

              {tokenSessions.length > 0 ? tokenSessions.filter((s) => s.character_id !== 0 && Date.now() - new Date(s.last_heartbeat).getTime() < 30 * 60 * 1000).map((s) => {
                const health = heartbeatHealth(s.last_heartbeat)
                const dotColor = health === 'available' ? 'bg-status-available' : health === 'soon' ? 'bg-status-soon' : 'bg-status-error'
                const location = s.in_instance ? (s.instance_name || 'Instância') : (s.current_map || null)
                return (
                <div key={s.id} className="flex items-center gap-2 pl-4">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} title={`Último heartbeat: ${formatRelativeTime(s.last_heartbeat)} atrás`} />
                  <span className="text-xs text-text-secondary">
                    {s.character_name || `Char #${s.character_id}`}
                    {location && <span className="text-text-secondary/60"> · {location}</span>}
                  </span>
                </div>
                )
              }) : (
                <span className="text-xs text-text-secondary pl-4">Último uso: {formatDateTimeBRT(token.last_used_at)}</span>
              )}
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

function EventLog({ events, loading, filterErrors, onToggleFilter }: {
  events: TelemetryEventLog[]
  loading: boolean
  filterErrors: boolean
  onToggleFilter: () => void
}) {
  const displayed = filterErrors ? events.filter(e => e.result === 'error' || e.result === 'ignored') : events

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          Log de Eventos
        </h4>
        <button
          onClick={onToggleFilter}
          className={`text-[10px] px-2 py-0.5 rounded-sm border cursor-pointer transition-colors ${
            filterErrors
              ? 'border-status-error text-status-error-text bg-[color-mix(in_srgb,var(--status-error)_15%,transparent)]'
              : 'border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          Só erros/ignored
        </button>
      </div>
      {/* TODO: telemetry_event_log requires service role. Currently fetched via client
          which returns empty due to RLS. Needs an RPC or API route filtered by group token_ids. */}
      {loading ? (
        <p className="text-xs text-text-secondary italic">Carregando...</p>
      ) : displayed.length === 0 ? (
        <p className="text-xs text-text-secondary italic">
          {filterErrors ? 'Nenhum erro registrado.' : 'Nenhum evento registrado.'}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto scrollbar-thin">
          {displayed.map((e) => {
            const resultColor =
              e.result === 'created' ? 'text-status-available-text' :
              e.result === 'updated' ? 'text-primary' :
              e.result === 'ignored' ? 'text-status-soon-text' :
              'text-status-error-text'
            const endpoint = ENDPOINT_ABBREV[e.endpoint] ?? e.endpoint
            return (
              <div key={e.id} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-bg">
                <span className="text-text-secondary tabular-nums w-8 flex-shrink-0">{formatRelativeTime(e.timestamp)}</span>
                <span className="text-text-primary font-medium w-12 flex-shrink-0">{endpoint}</span>
                <span className={`font-semibold w-14 flex-shrink-0 ${resultColor}`}>{e.result}</span>
                {e.reason && <span className="text-text-secondary truncate">{e.reason}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UnresolvedCharsList({ chars, userId, onRefresh }: { chars: any[]; userId: string; onRefresh: () => void }) {
  const [creating, setCreating] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  if (chars.length === 0) return null;

  async function handleCreateChar(char: any) {
    setCreating(char.game_char_id);
    setErrors((prev) => { const next = { ...prev }; delete next[char.game_char_id]; return next; });
    try {
      const supabase = createClient();

      // Find the correct account by game_account_id
      let accountId: string | null = null;
      if (char.game_account_id) {
        const { data: matched } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', userId)
          .eq('game_account_id', char.game_account_id)
          .maybeSingle();
        accountId = matched?.id ?? null;
      }
      if (!accountId) {
        const msg = char.game_account_id
          ? `Conta do jogo #${char.game_account_id} não encontrada. Cadastre a conta primeiro na aba de personagens.`
          : 'Conta desconhecida. Cadastre o personagem manualmente na aba de personagens.';
        setErrors((prev) => ({ ...prev, [char.game_char_id]: msg }));
        return;
      }

      // Insert character with name + level. Class left empty for user to fill.
      // report-characters will auto-match on next heartbeat via name.
      const { error: insertError } = await supabase
        .from('characters')
        .insert({
          user_id: userId,
          account_id: accountId,
          name: char.char_name,
          class: '',
          class_path: [],
          level: char.char_level ?? 1,
        });

      if (insertError) {
        setErrors((prev) => ({ ...prev, [char.game_char_id]: 'Erro ao criar personagem.' }));
        return;
      }

      // Remove from unresolved
      await supabase
        .from('unresolved_game_characters')
        .delete()
        .eq('game_char_id', char.game_char_id);

      onRefresh();
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
        Personagens não vinculados ({chars.length})
      </h4>
      <div className="space-y-1">
        {chars.map((char) => (
          <div key={char.game_char_id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between bg-bg border border-border rounded-md px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-status-soon flex-shrink-0" />
                <span className="text-sm text-text-primary">{char.char_name}</span>
                {char.char_level && (
                  <span className="text-xs text-text-secondary">Nv. {char.char_level}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-text-secondary">
                  {char.game_account_id ? `Conta #${char.game_account_id}` : 'Conta desconhecida'}
                </span>
                <button
                  onClick={() => handleCreateChar(char)}
                  disabled={creating === char.game_char_id}
                  title="Criar personagem"
                  className="text-text-secondary hover:text-primary transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
                >
                  <UserPlus
                    size={15}
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity="var(--icon-fill-opacity)"
                    className={creating === char.game_char_id ? 'opacity-50' : ''}
                  />
                </button>
              </div>
            </div>
            {errors[char.game_char_id] && (
              <p className="text-[10px] text-status-error-text pl-3">{errors[char.game_char_id]}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text-secondary mt-2">
        Personagens detectados pelo Claudinho que ainda não estão cadastrados no Instanceiro.
        Clique em <UserPlus size={10} className="inline" stroke="var(--primary)" /> para criar e vincular automaticamente.
      </p>
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
  const [eventLog, setEventLog] = useState<TelemetryEventLog[]>([]);
  const [eventLogLoading, setEventLogLoading] = useState(false);
  const [filterErrors, setFilterErrors] = useState(false);
  const [unresolvedChars, setUnresolvedChars] = useState<any[]>([]);

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
      .select("id, token_id, current_map, client_version, last_heartbeat, started_at, character_id, character_name, in_instance, instance_name")
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

  const fetchUnresolved = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('unresolved_game_characters')
      .select('game_char_id, game_account_id, char_name, char_level, char_class, first_seen_at')
      .eq('user_id', userId)
      .order('first_seen_at', { ascending: false });
    setUnresolvedChars(data ?? []);
  }, [userId]);

  const fetchEventLog = useCallback(async () => {
    setEventLogLoading(true);
    const supabase = createClient();
    // TODO: telemetry_event_log has no RLS — this will return empty until an RPC or API route
    // is added that filters by the user's token_ids (requires service role access).
    const { data } = await supabase
      .from('telemetry_event_log')
      .select('id, endpoint, result, reason, timestamp, token_id')
      .order('timestamp', { ascending: false })
      .limit(50);
    setEventLog(data ?? []);
    setEventLogLoading(false);
  }, []);

  useEffect(() => {
    fetchTokens();
    fetchSessions();
    fetchVersion();
    fetchEventLog();
    fetchUnresolved();
  }, [fetchTokens, fetchSessions, fetchVersion, fetchEventLog, fetchUnresolved]);

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

      <UnresolvedCharsList
        chars={unresolvedChars}
        userId={userId}
        onRefresh={fetchUnresolved}
      />

      <EventLog
        events={eventLog}
        loading={eventLogLoading}
        filterErrors={filterErrors}
        onToggleFilter={() => setFilterErrors(f => !f)}
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
