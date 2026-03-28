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

  if (!monster_id || !map || timestamp == null) {
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

  // Overwrite: delete active kill for this MVP if exists (older than 30s)
  await supabase
    .from('mvp_kills')
    .delete()
    .eq('mvp_id', mvp.id)
    .eq('group_id', ctx.groupId)
    .lt('killed_at', dedupCutoff)

  // Insert new kill
  const { data: kill, error: killErr } = await supabase
    .from('mvp_kills')
    .insert({
      group_id: ctx.groupId,
      mvp_id: mvp.id,
      killed_at: killedAt,
      tomb_x: x ?? null,
      tomb_y: y ?? null,
      registered_by: ctx.userId,
      source: 'telemetry',
      telemetry_session_id: ctx.sessionId,
    })
    .select('id')
    .single()

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

  // Insert party members
  if (party_character_ids && Array.isArray(party_character_ids) && party_character_ids.length > 0) {
    const partyRows = party_character_ids.map((charId: number) => ({
      kill_id: kill.id,
      character_id: String(charId),
    }))

    await supabase.from('mvp_kill_party').insert(partyRows)
  }

  // queue_mvp_alerts trigger fires automatically on insert

  return NextResponse.json({ action: 'created', kill_id: kill.id }, { status: 201 })
}
