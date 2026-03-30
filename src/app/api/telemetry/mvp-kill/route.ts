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
  const { monster_id, map, x, y, timestamp, loots, party_character_ids } = body

  if (!monster_id || timestamp == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Resolve monster_id → mvp_ids (prefer map-specific match, fallback to all)
  let query = supabase
    .from('mvps')
    .select('id')
    .eq('monster_id', monster_id)
    .eq('server_id', ctx.serverId)

  if (map && map !== 'unknown') {
    query = query.eq('map_name', map)
  }

  const { data: mvpRows } = await query

  // If map was provided but no MVP found, this is likely an instance — ignore
  // Only fallback to no-map query when map is genuinely unknown
  if ((!mvpRows || mvpRows.length === 0) && (!map || map === 'unknown')) {
    const { data: allRows } = await supabase
      .from('mvps')
      .select('id')
      .eq('monster_id', monster_id)
      .eq('server_id', ctx.serverId)
    mvpRows = allRows
  }

  if (!mvpRows || mvpRows.length === 0) {
    return NextResponse.json({ action: 'ignored', reason: 'map mismatch (likely instance)' })
  }

  const mvpIds = mvpRows.map(m => m.id)
  const killedAt = new Date(timestamp * 1000).toISOString()

  // Atomic kill registration — handles dedup, overwrite, and sighting cleanup in one transaction
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mvpIds,
    p_killed_at: killedAt,
    p_tomb_x: x ?? null,
    p_tomb_y: y ?? null,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: ctx.sessionId,
  })

  if (rpcErr) {
    return NextResponse.json({ error: 'Failed to register kill' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'created'
  const killId = rpcResult?.kill_id

  // Insert loots as suggestions (only for new kills)
  if (action === 'created' && killId && loots && Array.isArray(loots) && loots.length > 0) {
    const itemIds = loots.map((l: any) => l.item_id)
    const { data: items } = await supabase
      .from('items')
      .select('item_id, name_pt')
      .in('item_id', itemIds)

    const itemNameMap = new Map(items?.map((i) => [i.item_id, i.name_pt]) ?? [])

    const lootRows = loots.map((l: any) => ({
      kill_id: killId,
      item_id: l.item_id,
      item_name: itemNameMap.get(l.item_id) ?? `Item #${l.item_id}`,
      quantity: l.amount ?? 1,
      source: 'telemetry',
      accepted: null,
    }))

    await supabase.from('mvp_kill_loots').insert(lootRows)
  }

  // Insert party members
  if (action === 'created' && killId && party_character_ids && Array.isArray(party_character_ids) && party_character_ids.length > 0) {
    const { data: groupMembers } = await supabase
      .from('mvp_group_members')
      .select('character_id, characters!inner(id, user_id)')
      .eq('group_id', ctx.groupId)

    const memberCharMap = new Map<string, string>(
      (groupMembers ?? []).map((m: any) => [m.characters.user_id, m.character_id as string])
    )

    const { data: sessions } = await supabase
      .from('telemetry_sessions')
      .select('user_id, character_id')
      .eq('group_id', ctx.groupId)
      .in('character_id', party_character_ids)

    const resolvedIds = (sessions ?? [])
      .map((s: any) => memberCharMap.get(s.user_id))
      .filter((id): id is string => id !== undefined)

    if (resolvedIds.length > 0) {
      const partyRows = resolvedIds.map((charUuid) => ({
        kill_id: killId,
        character_id: charUuid,
      }))
      await supabase.from('mvp_kill_party').insert(partyRows)
    }
  }

  const status = action === 'created' ? 201 : 200
  return NextResponse.json({ action, kill_id: killId }, { status })
}
