import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMvpIds } from '@/lib/telemetry/resolve-mvp'
import { validateTimestamp } from '@/lib/telemetry/validate-payload'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

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

  // Bug 3 fix: validate timestamp before processing
  const tsResult = validateTimestamp(timestamp)
  if (!tsResult.valid) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-kill',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { monster_id, map, timestamp },
      result: 'ignored',
      reason: tsResult.reason,
    })
    return NextResponse.json({ action: 'ignored', reason: tsResult.reason })
  }

  // Resolve monster_id → mvp_ids via shared lib
  const mvpResult = await resolveMvpIds(supabase, ctx.serverId, monster_id, map)
  if (mvpResult.ignored) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-kill',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { monster_id, map, timestamp },
      result: 'ignored',
      reason: mvpResult.reason,
    })
    return NextResponse.json({ action: 'ignored', reason: mvpResult.reason })
  }

  const mvpIds = mvpResult.mvpIds
  const killedAt = tsResult.date.toISOString()

  // Atomic kill registration — handles dedup, overwrite, and sighting cleanup in one transaction
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('telemetry_register_kill', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mvpIds,
    p_killed_at: killedAt,
    p_tomb_x: x ?? null,
    p_tomb_y: y ?? null,
    p_registered_by: ctx.characterUuid,
    p_source: 'telemetry',
    p_session_id: null,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-kill',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { monster_id, map, timestamp },
      result: 'error',
      reason: rpcErr.message,
    })
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

  logTelemetryEvent(supabase, {
    endpoint: 'mvp-kill',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { monster_id, map, timestamp },
    result: action === 'created' ? 'created' : 'updated',
    killId: killId ?? null,
  })

  const status = action === 'created' ? 201 : 200
  return NextResponse.json({ action, kill_id: killId }, { status })
}
