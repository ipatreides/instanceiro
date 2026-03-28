'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TelemetryToken } from '@/lib/types'

interface TelemetrySettingsProps {
  userId: string
}

export function TelemetrySettings({ userId }: TelemetrySettingsProps) {
  const [tokens, setTokens] = useState<TelemetryToken[]>([])
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    fetchTokens()
  }, [userId])

  async function fetchTokens() {
    const supabase = createClient()
    const { data } = await supabase
      .from('telemetry_tokens')
      .select('id, user_id, name, created_at, last_used_at, revoked_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })

    setTokens(data ?? [])
  }

  async function handleRevoke(tokenId: string) {
    const supabase = createClient()
    await supabase
      .from('telemetry_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenId)

    setRevoking(null)
    fetchTokens()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Telemetria</h3>

      {tokens.length === 0 ? (
        <p className="text-xs text-text-secondary">Nenhum sniffer conectado.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center justify-between bg-bg border border-border rounded-md px-3 py-2">
              <div>
                <span className="text-sm text-text-primary">{t.name ?? 'Sniffer'}</span>
                <span className="text-xs text-text-secondary ml-2">
                  Ultimo uso: {formatDate(t.last_used_at)}
                </span>
              </div>
              {revoking !== t.id ? (
                <button
                  onClick={() => setRevoking(t.id)}
                  className="text-xs text-status-error-text hover:underline"
                >
                  Revogar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRevoke(t.id)}
                    className="text-xs text-white bg-status-error rounded-md px-2 py-1"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setRevoking(null)}
                    className="text-xs text-text-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
