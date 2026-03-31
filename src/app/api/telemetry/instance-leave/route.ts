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
  const { flag, timestamp, character_id: bodyCharId } = body as {
    flag?: number
    timestamp?: number
    character_id?: number
  }

  // flag=0 is internal map change, ignore
  if (flag === 0) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-leave',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { flag },
      result: 'ignored',
      reason: 'flag_zero',
    })
    return NextResponse.json({ action: 'ignored', reason: 'flag_zero' })
  }

  // Validate timestamp
  let completedAt: string | undefined
  if (timestamp != null) {
    const tsResult = validateTimestamp(timestamp)
    if (!tsResult.valid) {
      logTelemetryEvent(supabase, {
        endpoint: 'instance-leave',
        tokenId: ctx.tokenId,
        characterId: ctx.characterUuid,
        payloadSummary: { flag, timestamp },
        result: 'ignored',
        reason: tsResult.reason,
      })
      return NextResponse.json({ action: 'ignored', reason: tsResult.reason })
    }
    completedAt = tsResult.date.toISOString()
  }

  const sessionCharId = bodyCharId ?? parseInt(ctx.characterId, 10) ?? 0

  // Read current session to get instance_id
  const { data: session } = await supabase
    .from('telemetry_sessions')
    .select('id, current_instance_id')
    .eq('token_id', ctx.tokenId)
    .eq('character_id', sessionCharId)
    .maybeSingle()

  if (!session?.current_instance_id) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-leave',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { flag, session_char_id: sessionCharId },
      result: 'ignored',
      reason: 'leave_without_enter',
    })
    return NextResponse.json({ action: 'ignored', reason: 'leave_without_enter' })
  }

  // Create instance_completions record
  const completionData: Record<string, unknown> = {
    character_id: ctx.characterUuid,
    instance_id: session.current_instance_id,
    telemetry_session_id: session.id,
    source: 'telemetry',
  }
  if (completedAt) completionData.completed_at = completedAt

  const { error: insertErr } = await supabase
    .from('instance_completions')
    .insert(completionData)

  if (insertErr) {
    logTelemetryEvent(supabase, {
      endpoint: 'instance-leave',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { flag, instance_id: session.current_instance_id },
      result: 'error',
      reason: insertErr.message,
    })
    return NextResponse.json({ error: 'Failed to create completion' }, { status: 500 })
  }

  // Clear session instance state
  await supabase
    .from('telemetry_sessions')
    .update({
      current_instance_id: null,
      in_instance: false,
      instance_name: null,
    })
    .eq('id', session.id)

  logTelemetryEvent(supabase, {
    endpoint: 'instance-leave',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { flag, instance_id: session.current_instance_id, session_char_id: sessionCharId },
    result: 'created',
  })

  return NextResponse.json({ action: 'completed', instance_id: session.current_instance_id }, { status: 201 })
}
