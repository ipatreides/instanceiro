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

  // Resolve monster_id → mvp_id + map_name
  const { data: mvp } = await supabase
    .from('mvps')
    .select('id, map_name')
    .eq('monster_id', monster_id)
    .eq('server_id', ctx.serverId)
    .limit(1)
    .maybeSingle()

  // Use MVP's known map if sniffer didn't provide one
  const resolvedMap = (map && map !== 'unknown') ? map : (mvp?.map_name ?? 'unknown')

  if (!mvp) {
    return NextResponse.json({ error: 'Unknown MVP' }, { status: 400 })
  }

  // Dedup: don't insert if we already spotted this MVP in the last 30 seconds
  const cutoff = new Date(Date.now() - 30000).toISOString()
  const { data: recent } = await supabase
    .from('mvp_sightings')
    .select('id')
    .eq('mvp_id', mvp.id)
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
      mvp_id: mvp.id,
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
