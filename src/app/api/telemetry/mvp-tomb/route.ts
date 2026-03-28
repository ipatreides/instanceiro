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

  const { map, tomb_x, tomb_y, timestamp } = await request.json()

  if (!map || tomb_x == null || tomb_y == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve character row UUID for registered_by
  const { data: charRow } = await supabase
    .from('characters')
    .select('id')
    .eq('user_id', ctx.userId)
    .limit(1)
    .single()

  if (!charRow) {
    return NextResponse.json({ error: 'Character not found' }, { status: 400 })
  }

  const registeredBy = charRow.id

  // Get MVP IDs that spawn on this map
  const { data: mapMvps } = await supabase
    .from('mvps')
    .select('id')
    .eq('map_name', map)
    .eq('server_id', ctx.serverId)

  const mapMvpIds = mapMvps?.map((m) => m.id) ?? []

  if (mapMvpIds.length === 0) {
    return NextResponse.json({ action: 'ignored', reason: 'no MVP on this map' })
  }

  // Find recent kill on this map without tomb coords (within 2 minutes)
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  const { data: kill } = await supabase
    .from('mvp_kills')
    .select('id, mvp_id')
    .eq('group_id', ctx.groupId)
    .in('mvp_id', mapMvpIds)
    .is('tomb_x', null)
    .gte('killed_at', cutoff)
    .order('killed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (kill) {
    // Update existing kill with tomb coords
    await supabase
      .from('mvp_kills')
      .update({ tomb_x, tomb_y })
      .eq('id', kill.id)

    return NextResponse.json({ action: 'updated', kill_id: kill.id })
  }

  // No matching kill found — create new kill from tomb data
  // Use already-resolved mapMvps (filtered by map and server above)
  // If exactly one MVP on this map, create the kill
  const mvpId = mapMvps!.length === 1 ? mapMvps![0].id : null

  const { data: newKill } = await supabase
    .from('mvp_kills')
    .insert({
      group_id: ctx.groupId,
      mvp_id: mvpId,
      killed_at: new Date().toISOString(),
      tomb_x,
      tomb_y,
      registered_by: registeredBy,
      source: 'telemetry',
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

  return NextResponse.json({
    action: 'created',
    kill_id: newKill?.id,
    needs_mvp_resolution: mapMvps!.length > 1,
  }, { status: 201 })
}
