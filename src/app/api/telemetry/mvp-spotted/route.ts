import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMvpIds } from '@/lib/telemetry/resolve-mvp'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { monster_id, x, y, dry_run } = body
  const map = body.map || 'unknown'

  if (!monster_id || x == null || y == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve monster_id → mvp_ids via shared lib
  const mvpResult = await resolveMvpIds(supabase, ctx.serverId, monster_id, map)

  if (mvpResult.ignored) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-spotted',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { monster_id, map, x, y },
      result: 'ignored',
      reason: mvpResult.reason,
    })
    return NextResponse.json({ action: 'ignored', reason: mvpResult.reason })
  }

  const mvpIds = mvpResult.mvpIds
  const mvpId = mvpIds[0]
  const resolvedMap = (map && map !== 'unknown') ? map : 'unknown'

  // Fetch MVP name for response
  const { data: mvpRow } = await supabase
    .from('mvps')
    .select('name')
    .eq('id', mvpId)
    .maybeSingle()
  const mvpName = mvpRow?.name ?? null

  if (dry_run) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-spotted',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { monster_id, map, x, y, dry_run: true },
      result: 'ignored',
      reason: 'dry_run',
    })
    return NextResponse.json({
      action: 'dry_run',
      mvp_ids: mvpIds,
      mvp_id: mvpId,
      mvp_name: mvpName,
      resolved_map: resolvedMap,
    })
  }

  // Ignore sighting if MVP was killed recently (within 5 minutes)
  const killCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recentKill } = await supabase
    .from('mvp_kills')
    .select('id')
    .in('mvp_id', mvpIds)
    .eq('group_id', ctx.groupId)
    .gte('killed_at', killCutoff)
    .limit(1)

  if (recentKill && recentKill.length > 0) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-spotted',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { monster_id, map, x, y },
      result: 'ignored',
      reason: 'MVP killed recently',
    })
    return NextResponse.json({ action: 'ignored', reason: 'MVP killed recently' })
  }

  // Dedup: don't insert if we already spotted this MVP in the last 30 seconds
  const cutoff = new Date(Date.now() - 30000).toISOString()
  const { data: recent } = await supabase
    .from('mvp_sightings')
    .select('id')
    .eq('mvp_id', mvpId)
    .eq('group_id', ctx.groupId)
    .gte('spotted_at', cutoff)
    .limit(1)

  if (recent && recent.length > 0) {
    // Update position instead of inserting
    await supabase
      .from('mvp_sightings')
      .update({ map_name: resolvedMap, x, y, spotted_at: new Date().toISOString() })
      .eq('id', recent[0].id)

    logTelemetryEvent(supabase, {
      endpoint: 'mvp-spotted',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { monster_id, map, x, y },
      result: 'updated',
    })
    return NextResponse.json({ action: 'updated', sighting_id: recent[0].id })
  }

  // Insert new sighting
  const { data: sighting } = await supabase
    .from('mvp_sightings')
    .insert({
      mvp_id: mvpId,
      group_id: ctx.groupId,
      map_name: resolvedMap,
      x,
      y,
      telemetry_session_id: null,
    })
    .select('id')
    .single()

  logTelemetryEvent(supabase, {
    endpoint: 'mvp-spotted',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { monster_id, map, x, y },
    result: 'created',
  })
  return NextResponse.json({ action: 'created', sighting_id: sighting?.id, mvp_name: mvpName }, { status: 201 })
}
