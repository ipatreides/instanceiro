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

  const { map, tomb_x, tomb_y, killer_name } = await request.json()

  if (!killer_name) {
    return NextResponse.json({ error: 'Missing killer_name' }, { status: 400 })
  }

  // Find kill by tomb coordinates + map in this group
  let query = supabase
    .from('mvp_kills')
    .select('id')
    .eq('group_id', ctx.groupId)

  if (tomb_x != null && tomb_y != null) {
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
    // Update existing kill with killer info
    const updates: Record<string, any> = { killer_name_raw: killer_name }
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
  // killed_at=NOW() is approximate (MVP died sometime before now)

  // Resolve MVP by map
  const resolvedMap = (map && map !== 'unknown') ? map : null
  let mvpId: number | null = null

  if (resolvedMap) {
    const { data: mvps } = await supabase
      .from('mvps')
      .select('id')
      .eq('map_name', resolvedMap)
      .eq('server_id', ctx.serverId)

    if (mvps && mvps.length === 1) {
      mvpId = mvps[0].id
    }
  }

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
      killed_at: new Date().toISOString(),
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
