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

  const body = await request.json()
  const { map, tomb_x, tomb_y, killer_name, kill_hour, kill_minute, dry_run } = body

  if (!killer_name) {
    return NextResponse.json({ error: 'Missing killer_name' }, { status: 400 })
  }

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

  // Fetch respawn_ms for time validation
  let respawnMs: number | undefined
  if (matchMvpIds.length > 0) {
    const { data: mvpData } = await supabase
      .from('mvps')
      .select('respawn_ms')
      .eq('id', matchMvpIds[0])
      .maybeSingle()
    respawnMs = mvpData?.respawn_ms ?? undefined
  }

  const killedAtDate = reconstructKilledAt(kill_hour, kill_minute, new Date(), respawnMs)
  const killedAt = killedAtDate ? killedAtDate.toISOString() : null

  // Resolve killer to character_id
  const { data: members } = await supabase
    .from('mvp_group_members')
    .select('character_id, characters!inner(name)')
    .eq('group_id', ctx.groupId)

  const killerMatch = members?.find(
    (m: any) => m.characters?.name?.toLowerCase() === killer_name?.toLowerCase()
  )

  if (dry_run) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-killer',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { map, killer_name, kill_hour, kill_minute, dry_run: true },
      result: 'ignored',
      reason: 'dry_run',
    })
    return NextResponse.json({
      action: 'dry_run',
      resolved_map: resolvedMap,
      match_mvp_ids: matchMvpIds,
      killed_at: killedAt,
      killer_resolved: !!killerMatch,
      killer_name,
    })
  }

  if (!killedAt) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-killer',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { map, killer_name, kill_hour, kill_minute },
      result: 'ignored',
      reason: 'invalid_time',
    })
    return NextResponse.json({ action: 'ignored', reason: 'invalid_time' })
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('update_kill_from_killer', {
    p_group_id: ctx.groupId,
    p_mvp_ids: matchMvpIds,
    p_killed_at: killedAt,
    p_killer_name: killer_name,
    p_killer_char_id: killerMatch?.character_id ?? null,
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_registered_by: ctx.characterUuid,
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
