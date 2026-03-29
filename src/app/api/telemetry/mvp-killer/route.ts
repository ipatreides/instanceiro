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

  const { map, tomb_x, tomb_y, killer_name, kill_hour, kill_minute } = await request.json()

  if (!killer_name) {
    return NextResponse.json({ error: 'Missing killer_name' }, { status: 400 })
  }

  // Build killed_at from tomb time if available (hours:minutes in BRT server time)
  let killedAt: string | null = null
  if (kill_hour != null && kill_minute != null && kill_hour >= 0 && kill_minute >= 0) {
    // The time from the tomb is in the game server's timezone (BRT = UTC-3)
    const now = new Date()
    // Get today's date in BRT
    const brtDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    // Construct BRT time and convert to UTC
    const brtIso = `${brtDate}T${String(kill_hour).padStart(2, '0')}:${String(kill_minute).padStart(2, '0')}:00-03:00`
    const killDate = new Date(brtIso)
    // If the kill time is in the future (crossed midnight), subtract a day
    if (killDate.getTime() > now.getTime()) {
      killDate.setDate(killDate.getDate() - 1)
    }
    killedAt = killDate.toISOString()
  }

  // Resolve MVP by map to find the most recent kill
  const resolvedMap = (map && map !== 'unknown') ? map : null
  let matchMvpIds: number[] = []

  if (resolvedMap) {
    const { data: mapMvps } = await supabase
      .from('mvps')
      .select('id')
      .eq('map_name', resolvedMap)
      .eq('server_id', ctx.serverId)

    matchMvpIds = mapMvps?.map(m => m.id) ?? []
  }

  // Find the most recent kill for this MVP in the group (within last 24h)
  const killCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('mvp_kills')
    .select('id')
    .eq('group_id', ctx.groupId)
    .gte('killed_at', killCutoff)

  if (matchMvpIds.length > 0) {
    query = query.in('mvp_id', matchMvpIds)
  } else if (tomb_x != null && tomb_y != null) {
    // Fallback: match by tomb coords if we can't resolve MVP
    query = query.eq('tomb_x', tomb_x).eq('tomb_y', tomb_y)
  }

  const { data: kill } = await query
    .order('killed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Try to resolve killer_name to a character_id in the group
  const { data: members } = await supabase
    .from('mvp_group_members')
    .select('character_id, characters!inner(name)')
    .eq('group_id', ctx.groupId)

  const killerMatch = members?.find(
    (m: any) => m.characters?.name === killer_name
  )

  if (kill) {
    // Update existing kill with killer info + corrected time from tomb
    const updates: Record<string, any> = { killer_name_raw: killer_name }
    if (killedAt) {
      updates.killed_at = killedAt
    }
    if (killerMatch) {
      updates.killer_character_id = killerMatch.character_id
    }
    // Also update tomb coords if provided and not already set
    if (tomb_x != null && tomb_y != null) {
      updates.tomb_x = tomb_x
      updates.tomb_y = tomb_y
    }

    await supabase
      .from('mvp_kills')
      .update(updates)
      .eq('id', kill.id)

    return NextResponse.json({
      action: 'updated',
      kill_id: kill.id,
      killer_resolved: !!killerMatch,
    })
  }

  // No existing kill — create one from tomb click info
  // This is the most reliable source: user clicked the tomb and we have killer name
  const mvpId = matchMvpIds.length === 1 ? matchMvpIds[0] : null

  // Resolve character for registered_by
  const { data: charRow } = await supabase
    .from('characters')
    .select('id')
    .eq('user_id', ctx.userId)
    .limit(1)
    .single()

  const { data: newKill } = await supabase
    .from('mvp_kills')
    .insert({
      group_id: ctx.groupId,
      mvp_id: mvpId,
      killed_at: killedAt ?? new Date().toISOString(),
      tomb_x: tomb_x ?? null,
      tomb_y: tomb_y ?? null,
      killer_character_id: killerMatch?.character_id ?? null,
      killer_name_raw: killer_name,
      registered_by: charRow?.id ?? ctx.userId,
      source: 'telemetry',
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

  return NextResponse.json({
    action: 'created',
    kill_id: newKill?.id,
    killer_resolved: !!killerMatch,
  }, { status: 201 })
}
