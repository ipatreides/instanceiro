import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMapAlias } from '@/lib/telemetry/resolve-mvp'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const { map: rawMap, tomb_x, tomb_y, timestamp, dry_run } = await request.json()
  const map = resolveMapAlias(rawMap)

  if (!map || tomb_x == null || tomb_y == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Get MVP IDs that spawn on this map
  const { data: mapMvps } = await supabase
    .from('mvps')
    .select('id')
    .eq('map_name', map)
    .eq('server_id', ctx.serverId)

  const mapMvpIds = mapMvps?.map((m) => m.id) ?? []

  // Fetch MVP name for toast
  const { data: mvpRow } = mapMvpIds.length > 0
    ? await supabase.from('mvps').select('name').eq('id', mapMvpIds[0]).maybeSingle()
    : { data: null }
  const mvpName = mvpRow?.name ?? null

  if (dry_run) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-tomb',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { map, tomb_x, tomb_y, dry_run: true },
      result: 'ignored',
      reason: 'dry_run',
    })
    return NextResponse.json({
      action: 'dry_run',
      resolved_map: map,
      map_mvp_ids: mapMvpIds,
      mvp_name: mvpName,
    })
  }

  if (mapMvpIds.length === 0) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-tomb',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { map, tomb_x, tomb_y },
      result: 'ignored',
      reason: 'no MVP on this map',
    })
    return NextResponse.json({ action: 'ignored', reason: 'no MVP on this map' })
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('update_kill_from_tomb', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mapMvpIds,
    p_tomb_x: tomb_x,
    p_tomb_y: tomb_y,
    p_registered_by: ctx.characterUuid,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-tomb', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { map, tomb_x, tomb_y }, result: 'error', reason: rpcErr.message })
    return NextResponse.json({ error: 'Failed to process tomb' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'ignored'
  const killId = rpcResult?.kill_id
  const wasSentinel = rpcResult?.was_sentinel ?? false

  logTelemetryEvent(supabase, {
    endpoint: 'mvp-tomb',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { map, tomb_x, tomb_y, unknown_time: wasSentinel },
    result: action,
    killId: killId ?? null,
  })

  return NextResponse.json({ action, kill_id: killId, mvp_name: mvpName, was_sentinel: wasSentinel })
}
