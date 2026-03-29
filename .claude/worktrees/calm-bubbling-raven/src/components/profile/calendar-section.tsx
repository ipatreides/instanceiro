"use client";

import { useCalendarConnections } from "@/hooks/use-calendar-connections";

export function CalendarSection() {
  const { loading, connections, isGoogleLogin, toggle, disconnect } = useCalendarConnections();

  if (loading) return null;

  const google = connections.find((c) => c.provider === "google");
  const outlook = connections.find((c) => c.provider === "outlook");

  return (
    <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-text-primary">Calendario</h2>
      <p className="text-xs text-text-secondary">
        Sincronize agendamentos com seu calendario. Eventos sao criados automaticamente quando voce participa de um agendamento.
      </p>

      {/* Google Calendar */}
      {google ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-text-primary">Google Calendar</span>
              {google.lastSyncError && (
                <span className="text-xs text-status-error">{google.lastSyncError}</span>
              )}
            </div>
            <button
              onClick={() => toggle("google", !google.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                google.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                google.enabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          </div>
          <button
            onClick={() => disconnect("google")}
            className="text-xs text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
          >
            Desconectar Google Calendar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {isGoogleLogin && (
            <p className="text-xs text-text-secondary italic">
              Voce ja esta logado com Google, mas precisamos de permissao extra para acessar seu calendario.
            </p>
          )}
          <a
            href="/api/calendar/google/connect"
            className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-surface border border-border text-text-primary font-semibold text-sm hover:border-primary transition-colors cursor-pointer"
          >
            Conectar Google Calendar
          </a>
        </div>
      )}

      {/* Outlook */}
      {outlook ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-text-primary">Outlook</span>
              {outlook.lastSyncError && (
                <span className="text-xs text-status-error">{outlook.lastSyncError}</span>
              )}
            </div>
            <button
              onClick={() => toggle("outlook", !outlook.enabled)}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                outlook.enabled ? "bg-primary" : "bg-border"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                outlook.enabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </button>
          </div>
          <button
            onClick={() => disconnect("outlook")}
            className="text-xs text-text-secondary hover:text-status-error transition-colors cursor-pointer self-start"
          >
            Desconectar Outlook
          </button>
        </div>
      ) : (
        <a
          href="/api/calendar/outlook/connect"
          className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-md bg-surface border border-border text-text-primary font-semibold text-sm hover:border-primary transition-colors cursor-pointer"
        >
          Conectar Outlook
        </a>
      )}
    </div>
  );
}
