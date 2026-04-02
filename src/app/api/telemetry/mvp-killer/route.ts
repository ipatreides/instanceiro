import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMapAlias } from '@/lib/telemetry/resolve-mvp'
import { reconstructKilledAt } from '@/lib/telemetry/validate-payload'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const { map, tomb_x, tomb_y, killer_name, kill_hour, kill_minute } = await request.json()

  if (!killer_name) {
    return NextResponse.json({ error: 'Missing killer_name' }, { status: 400 })
  }

  // Bug 1 fix: use shared reconstructKilledAt which properly handles day boundaries
  const killedAtDate = reconstructKilledAt(kill_hour, kill_minute, new Date())
  const killedAt = killedAtDate ? killedAtDate.toISOString() : null

  // Bug 5 fix: if no hour/minute provided, set p_update_only — only update existing kill
  const updateOnly = killedAtDate === null

  // Bug 2 fix: resolve MVP by map only. If no MVPs on map, return ignored instead of [0].
  const resolvedMap = resolveMapAlias(map)
  let matchMvpIds: number[] = []

  if (resolvedMap) {
    const { data: mapMvps } = await supabase
      .from('mvps')
      .select('id')
      .eq('map_name', resolvedMap)
      .eq('server_id', ctx.serverId)

    matchMvpIds = mapMvps?.map(m => m.id) ?? []
  }

  if (matchMvpIds.length === 0) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-killer',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { map, killer_name, kill_hour, kill_minute },
      result: 'ignored',
      reason: 'no MVP on map',
    })
    return NextResponse.json({ action: 'ignored', reason: 'no MVP on map' })
  }

  // Resolve killer to character_id
  const { data: members } = await supabase
    .from('mvp_group_members')
    .select('character_id, characters!inner(name)')
    .eq('group_id', ctx.groupId)

  const killerMatch = members?.find(
    (m: any) => m.characters?.name?.toLowerCase() === killer_name?.toLowerCase()
  )

  // Use atomic RPC for kill registration — handles dedup + sighting cleanup
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: matchMvpIds,
    p_killed_at: killedAt ?? new Date().toISOString(),
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: null,
    p_killer_name: killer_name,
    p_killer_char_id: killerMatch?.character_id ?? null,
    p_update_only: updateOnly,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-killer',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { map, killer_name, kill_hour, kill_minute },
      result: 'error',
      reason: rpcErr.message,
    })
    return NextResponse.json({ error: 'Failed to register kill' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'created'
  const killId = rpcResult?.kill_id

  logTelemetryEvent(supabase, {
    endpoint: 'mvp-killer',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { map, killer_name, kill_hour, kill_minute },
    result: action === 'created' ? 'created' : 'updated',
    killId: killId ?? null,
  })

  return NextResponse.json({
    action,
    kill_id: killId,
    killer_resolved: !!killerMatch,
  }, { status: action === 'created' ? 201 : 200 })
}
