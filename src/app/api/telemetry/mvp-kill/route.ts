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

  // Resolve monster_id → mvp_id
  const { data: mvp } = await supabase
    .from('mvps')
    .select('id')
    .eq('monster_id', monster_id)
    .eq('server_id', ctx.serverId)
    .limit(1)
    .single()

  if (!mvp) {
    return NextResponse.json({ error: 'Unknown MVP for this server' }, { status: 400 })
  }

  // Use the character that's in the MVP group
  const registeredBy = ctx.characterUuid

  const killedAt = new Date(timestamp * 1000).toISOString()

  // Dedup: same mvp_id in group within last 30 seconds
  const dedupCutoff = new Date(timestamp * 1000 - 30000).toISOString()
  const { data: existing } = await supabase
    .from('mvp_kills')
    .select('id')
    .eq('mvp_id', mvp.id)
    .eq('group_id', ctx.groupId)
    .gte('killed_at', dedupCutoff)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ action: 'dedup' })
  }

  // Overwrite: delete only the most recent (active timer) kill for this MVP, not the entire history
  const { data: activeKill } = await supabase
    .from('mvp_kills')
    .select('id')
    .eq('mvp_id', mvp.id)
    .eq('group_id', ctx.groupId)
    .lt('killed_at', dedupCutoff)
    .order('killed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeKill) {
    await supabase
      .from('mvp_kills')
      .delete()
      .eq('id', activeKill.id)
  }

  // Insert new kill
  const { data: kill, error: killErr } = await supabase
    .from('mvp_kills')
    .insert({
      group_id: ctx.groupId,
      mvp_id: mvp.id,
      killed_at: killedAt,
      tomb_x: x ?? null,
      tomb_y: y ?? null,
      registered_by: registeredBy,
      source: 'telemetry',
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

  // Clear sightings for this MVP — it's dead now
  if (kill) {
    await supabase
      .from('mvp_sightings')
      .delete()
      .eq('mvp_id', mvp.id)
      .eq('group_id', ctx.groupId)
  }

  if (killErr || !kill) {
    return NextResponse.json({ error: 'Failed to insert kill' }, { status: 500 })
  }

  // Insert loots as suggestions
  if (loots && Array.isArray(loots) && loots.length > 0) {
    // Resolve item names from items table
    const itemIds = loots.map((l: any) => l.item_id)
    const { data: items } = await supabase
      .from('items')
      .select('item_id, name_pt')
      .in('item_id', itemIds)

    const itemNameMap = new Map(items?.map((i) => [i.item_id, i.name_pt]) ?? [])

    const lootRows = loots.map((l: any) => ({
      kill_id: kill.id,
      item_id: l.item_id,
      item_name: itemNameMap.get(l.item_id) ?? `Item #${l.item_id}`,
      quantity: l.amount ?? 1,
      source: 'telemetry',
      accepted: null,
    }))

    await supabase.from('mvp_kill_loots').insert(lootRows)
  }

  // Insert party members — resolve RO character IDs (integers) to character UUIDs
  if (party_character_ids && Array.isArray(party_character_ids) && party_character_ids.length > 0) {
    // Look up character UUIDs for this group's members by user
    const { data: groupMembers } = await supabase
      .from('mvp_group_members')
      .select('character_id, characters!inner(id, user_id)')
      .eq('group_id', ctx.groupId)

    // Build a map from user_id → character UUID for group members
    const memberCharMap = new Map<string, string>(
      (groupMembers ?? []).map((m: any) => [m.characters.user_id, m.character_id as string])
    )

    // Resolve each RO character ID to a group member character UUID via telemetry sessions
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
        kill_id: kill.id,
        character_id: charUuid,
      }))
      await supabase.from('mvp_kill_party').insert(partyRows)
    }
  }

  // queue_mvp_alerts trigger fires automatically on insert

  return NextResponse.json({ action: 'created', kill_id: kill.id }, { status: 201 })
}
