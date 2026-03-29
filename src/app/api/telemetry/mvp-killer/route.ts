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
    const now = new Date()
    const brtDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const brtIso = `${brtDate}T${String(kill_hour).padStart(2, '0')}:${String(kill_minute).padStart(2, '0')}:00-03:00`
    const killDate = new Date(brtIso)
    if (killDate.getTime() > now.getTime()) {
      killDate.setDate(killDate.getDate() - 1)
    }
    killedAt = killDate.toISOString()
  }

  // Resolve MVP by map
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

  // Resolve killer to character_id
  const { data: members } = await supabase
    .from('mvp_group_members')
    .select('character_id, characters!inner(name)')
    .eq('group_id', ctx.groupId)

  const killerMatch = members?.find(
    (m: any) => m.characters?.name === killer_name
  )

  // Use atomic RPC for kill registration — handles dedup + sighting cleanup
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: matchMvpIds.length > 0 ? matchMvpIds : [0],
    p_killed_at: killedAt ?? new Date().toISOString(),
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: ctx.sessionId,
    p_killer_name: killer_name,
    p_killer_char_id: killerMatch?.character_id ?? null,
  })

  if (rpcErr) {
    return NextResponse.json({ error: 'Failed to register kill' }, { status: 500 })
  }

  return NextResponse.json({
    action: rpcResult?.action ?? 'created',
    kill_id: rpcResult?.kill_id,
    killer_resolved: !!killerMatch,
  }, { status: rpcResult?.action === 'created' ? 201 : 200 })
}
