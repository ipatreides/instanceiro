import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'
import { validateTimestamp } from '@/lib/telemetry/validate-payload'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { instance_name, timestamp, character_id: bodyCharId } = body as {
    instance_name?: string
    timestamp?: number
    character_id?: number
  }

  if (!instance_name || typeof instance_name !== 'string') {
    return NextResponse.json({ error: 'Missing instance_name' }, { status: 400 })
  }

  if (timestamp != null) {
    const tsResult = validateTimestamp(timestamp)
    if (!tsResult.valid) {
      logTelemetryEvent(supabase, {
        endpoint: 'instance-enter',
        tokenId: ctx.tokenId,
        characterId: ctx.characterUuid,
        payloadSummary: { instance_name, timestamp },
        result: 'ignored',
        reason: tsResult.reason,
      })
      return NextResponse.json({ action: 'ignored', reason: tsResult.reason })
    }
  }

  const { data: mapping } = await supabase
    .from('instance_name_mappings')
    .select('instance_id')
    .eq('packet_name', instance_name)
    .maybeSingle()

  if (!mapping) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-enter',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { instance_name },
      result: 'ignored',
      reason: 'unknown_instance',
    })
    return NextResponse.json({ action: 'ignored', reason: 'unknown_instance' })
  }

  const sessionCharId = bodyCharId ?? parseInt(ctx.characterId, 10) ?? 0

  // Require character_id — sniffer must know who is entering
  if (sessionCharId === 0) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-enter',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { instance_name },
      result: 'ignored',
      reason: 'missing_character_id',
    })
    return NextResponse.json({ action: 'ignored', reason: 'missing_character_id' })
  }

  // Check if already in an instance (ENTER while in instance → clear previous without completion)
  const { data: currentSession } = await supabase
    .from('telemetry_sessions')
    .select('current_instance_id')
    .eq('token_id', ctx.tokenId)
    .eq('character_id', sessionCharId)
    .maybeSingle()

  if (currentSession?.current_instance_id && currentSession.current_instance_id !== mapping.instance_id) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-enter',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { previous_instance_id: currentSession.current_instance_id, new_instance_id: mapping.instance_id },
      result: 'ok',
      reason: 'switched_instance',
    })
  }

  const { error: updateErr } = await supabase
    .from('telemetry_sessions')
    .update({
      current_instance_id: mapping.instance_id,
      in_instance: true,
      instance_name: instance_name,
    })
    .eq('token_id', ctx.tokenId)
    .eq('character_id', sessionCharId)

  if (updateErr) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-enter',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { instance_name, session_char_id: sessionCharId },
      result: 'error',
      reason: updateErr.message,
    })
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }

  logTelemetryEvent(supabase, {
    endpoint: 'instance-enter',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { instance_name, instance_id: mapping.instance_id, session_char_id: sessionCharId },
    result: 'ok',
  })

  return NextResponse.json({ action: 'entered', instance_id: mapping.instance_id })
}
