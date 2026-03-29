import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { monster_id, x, y } = body
  const map = body.map || 'unknown'

  if (!monster_id || x == null || y == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve monster_id → ALL mvp_ids + map_name
  const { data: mvpRows } = await supabase
    .from('mvps')
    .select('id, map_name')
    .eq('monster_id', monster_id)
    .eq('server_id', ctx.serverId)

  if (!mvpRows || mvpRows.length === 0) {
    return NextResponse.json({ error: 'Unknown MVP' }, { status: 400 })
  }

  const mvpIds = mvpRows.map(m => m.id)
  const mvpId = mvpRows[0].id
  const resolvedMap = (map && map !== 'unknown') ? map : (mvpRows[0].map_name ?? 'unknown')

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
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

  return NextResponse.json({ action: 'created', sighting_id: sighting?.id }, { status: 201 })
}
