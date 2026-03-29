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

  const registeredBy = ctx.characterUuid

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

  // Get MVP respawn time for dedup window (respawn - 1 min, floor 60s)
  const { data: mvpInfo } = await supabase
    .from('mvps')
    .select('respawn_ms')
    .eq('id', mapMvpIds[0])
    .single()

  const respawnMs = mvpInfo?.respawn_ms ?? 3540000
  const windowMs = Math.max((respawnMs - 60000), 60000)
  const cutoff = new Date(Date.now() - windowMs).toISOString()

  // Find most recent kill for this MVP within respawn window
  const { data: kill } = await supabase
    .from('mvp_kills')
    .select('id, mvp_id')
    .eq('group_id', ctx.groupId)
    .in('mvp_id', mapMvpIds)
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

  // No matching kill found within respawn window — ignore.
  // The tomb confirms the MVP is dead but we don't know WHEN it died.
  // The real kill time comes from the tomb click (NPC_TALK).
  return NextResponse.json({ action: 'ignored', reason: 'no kill within respawn window' })
}
