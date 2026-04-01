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

  // Find the session to update — try exact match, then fall back to any session for this token
  let targetSession: { character_id: number; current_instance_id: number | null } | null = null

  if (sessionCharId !== 0) {
    const { data } = await supabase
      .from('telemetry_sessions')
      .select('character_id, current_instance_id')
      .eq('token_id', ctx.tokenId)
      .eq('character_id', sessionCharId)
      .maybeSingle()
    targetSession = data
  }

  if (!targetSession) {
    const { data } = await supabase
      .from('telemetry_sessions')
      .select('character_id, current_instance_id')
      .eq('token_id', ctx.tokenId)
      .order('last_heartbeat', { ascending: false })
      .limit(1)
      .maybeSingle()
    targetSession = data
  }

  const effectiveCharId = targetSession?.character_id ?? sessionCharId

  if (targetSession?.current_instance_id && targetSession.current_instance_id !== mapping.instance_id) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-enter',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { previous_instance_id: targetSession.current_instance_id, new_instance_id: mapping.instance_id },
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
    .eq('character_id', effectiveCharId)

  if (updateErr) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-enter',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { instance_name, session_char_id: effectiveCharId },
      result: 'error',
      reason: updateErr.message,
    })
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }

  logTelemetryEvent(supabase, {
    endpoint: 'instance-enter',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { instance_name, instance_id: mapping.instance_id, session_char_id: effectiveCharId },
    result: 'ok',
  })

  return NextResponse.json({ action: 'entered', instance_id: mapping.instance_id })
}
