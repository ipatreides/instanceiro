// src/lib/telemetry/log-event.ts
import type { SupabaseClient } from '@supabase/supabase-js'

interface LogEventParams {
  endpoint: string
  tokenId: string | null
  characterId: string | null
  payloadSummary: Record<string, unknown>
  result: 'created' | 'updated' | 'ignored' | 'error' | 'ok'
  reason?: string
  killId?: string | null
}

/**
 * Fire-and-forget telemetry event log insertion.
 * Never throws — failures are silently dropped.
 */
export function logTelemetryEvent(supabase: SupabaseClient, params: LogEventParams): void {
  supabase
    .from('telemetry_event_log')
    .insert({
      endpoint: params.endpoint,
      token_id: params.tokenId,
      character_id: params.characterId,
      payload_summary: params.payloadSummary,
      result: params.result,
      reason: params.reason ?? null,
      kill_id: params.killId ?? null,
    })
    .then(() => {})
}
