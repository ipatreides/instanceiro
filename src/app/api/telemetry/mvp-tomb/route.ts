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

  // Find recent kill on this map without tomb coords (within 2 minutes)
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  const { data: kill } = await supabase
    .from('mvp_kills')
    .select('id, mvp_id')
    .eq('group_id', ctx.groupId)
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
  // Resolve MVP by map (may match multiple MVPs)
  const { data: mvps } = await supabase
    .from('mvps')
    .select('id')
    .eq('map_name', map)
    .eq('server_id', ctx.serverId)

  if (!mvps || mvps.length === 0) {
    return NextResponse.json({ action: 'ignored', reason: 'no MVP on this map' })
  }

  // If exactly one MVP on this map, create the kill
  const mvpId = mvps.length === 1 ? mvps[0].id : null

  const { data: newKill } = await supabase
    .from('mvp_kills')
    .insert({
      group_id: ctx.groupId,
      mvp_id: mvpId,
      killed_at: new Date().toISOString(),
      tomb_x,
      tomb_y,
      registered_by: ctx.userId,
      source: 'telemetry',
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

  return NextResponse.json({
    action: 'created',
    kill_id: newKill?.id,
    needs_mvp_resolution: mvps.length > 1,
  }, { status: 201 })
}
