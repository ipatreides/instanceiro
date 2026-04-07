import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { resolveMvpIds } from '@/lib/telemetry/resolve-mvp'
import { validateTimestamp, reconstructKilledAt } from '@/lib/telemetry/validate-payload'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { monster_id, map, timestamp, tomb_x, tomb_y, killer_name, kill_hour, kill_minute, loots, party_account_ids, dry_run } = body

  if (!monster_id || !map || timestamp == null) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'error', reason: 'missing required fields' })
    return NextResponse.json({ error: 'Missing required fields (monster_id, map, timestamp)' }, { status: 400 })
  }

  const tsResult = validateTimestamp(timestamp)
  if (!tsResult.valid) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, timestamp }, result: 'ignored', reason: tsResult.reason })
    return NextResponse.json({ action: 'ignored', reason: tsResult.reason })
  }

  const mvpResult = await resolveMvpIds(supabase, ctx.serverId, monster_id, map)
  if (mvpResult.ignored) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'ignored', reason: mvpResult.reason })
    return NextResponse.json({ action: 'ignored', reason: mvpResult.reason })
  }

  // Timestamp priority: tomb time > sniffer timestamp
  let killedAt: string
  const tombTime = reconstructKilledAt(kill_hour, kill_minute, tsResult.date)
  if (tombTime) {
    killedAt = tombTime.toISOString()
  } else {
    killedAt = tsResult.date.toISOString()
  }

  // Save killer_name as-is — backfill triggers resolve placeholders when game identity arrives
  const resolvedKillerName = killer_name ?? null

  // Resolve killer to Instanceiro character for group membership detection
  let killerCharId: string | null = null
  if (resolvedKillerName && !resolvedKillerName.startsWith('actor_') && !resolvedKillerName.startsWith('char_')) {
    const { data: members } = await supabase
      .from('mvp_group_members')
      .select('character_id, characters!inner(name)')
      .eq('group_id', ctx.groupId)
    const match = members?.find((m: any) => m.characters?.name?.toLowerCase() === resolvedKillerName?.toLowerCase())
    killerCharId = match?.character_id ?? null
  }

  if (dry_run) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, kill_hour, kill_minute, killer_name, loot_count: loots?.length ?? 0, dry_run: true }, result: 'ignored', reason: 'dry_run' })
    return NextResponse.json({
      action: 'dry_run',
      mvp_ids: mvpResult.mvpIds,
      resolved_map: map,
      killed_at: killedAt,
      killer_resolved: !!killerCharId,
      killer_name: killer_name ?? null,
      loot_count: loots?.length ?? 0,
    })
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('register_kill_from_event', {
    p_group_id: ctx.groupId,
    p_mvp_ids: mvpResult.mvpIds,
    p_killed_at: killedAt,
    p_tomb_x: tomb_x ?? null,
    p_tomb_y: tomb_y ?? null,
    p_killer_name: killer_name ?? null,
    p_killer_char_id: killerCharId,
    p_registered_by: ctx.characterUuid,
  })

  if (rpcErr) {
    logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map }, result: 'error', reason: rpcErr.message })
    return NextResponse.json({ error: 'Failed to register kill' }, { status: 500 })
  }

  const action = rpcResult?.action ?? 'created'
  const killId = rpcResult?.kill_id

  // Insert loots (only for new kills)
  if (action === 'created' && killId && loots && Array.isArray(loots) && loots.length > 0) {
    const itemIds = loots.map((l: any) => l.item_id)
    const { data: items } = await supabase.from('items').select('item_id, name_pt').in('item_id', itemIds)
    const itemNameMap = new Map(items?.map((i) => [i.item_id, i.name_pt]) ?? [])
    await supabase.from('mvp_kill_loots').insert(
      loots.map((l: any) => ({
        kill_id: killId,
        item_id: l.item_id,
        item_name: itemNameMap.get(l.item_id) ?? `Item #${l.item_id}`,
        quantity: l.amount ?? 1,
        source: 'telemetry',
        accepted: null,
      }))
    )
  }

  // Insert party members
  if (action === 'created' && killId && party_account_ids && Array.isArray(party_account_ids) && party_account_ids.length > 0) {
    const { data: groupMembers } = await supabase
      .from('mvp_group_members')
      .select('character_id, characters!inner(id, user_id)')
      .eq('group_id', ctx.groupId)
    const memberCharMap = new Map<string, string>(
      (groupMembers ?? []).map((m: any) => [m.characters.user_id, m.character_id as string])
    )
    const { data: sessions } = await supabase
      .from('telemetry_sessions')
      .select('user_id, account_id')
      .eq('group_id', ctx.groupId)
      .in('account_id', party_account_ids)
    const resolvedIds = (sessions ?? [])
      .map((s: any) => memberCharMap.get(s.user_id))
      .filter((id): id is string => id !== undefined)
    if (resolvedIds.length > 0) {
      await supabase.from('mvp_kill_party').insert(
        resolvedIds.map((charUuid) => ({ kill_id: killId, character_id: charUuid }))
      )
    }
  }

  // Insert damage hits if provided (even if kill was deduplicated — allows multi-sniffer aggregation)
  if (killId && Array.isArray(body.damage_hits) && body.damage_hits.length > 0) {
    const hits = body.damage_hits.map((h: {
      source_id: number
      source_name: string
      damage: number
      server_tick: number
      elapsed_ms: number
      skill_id?: number | null
    }) => ({
      kill_id: killId,
      source_id: h.source_id,
      source_name: h.source_name,
      damage: h.damage,
      server_tick: h.server_tick,
      elapsed_ms: h.elapsed_ms,
      skill_id: h.skill_id ?? null,
      reported_by: null,
    }))

    const { error: hitsError } = await supabase
      .from('mvp_kill_damage_hits')
      .upsert(hits, { onConflict: 'kill_id,source_id,server_tick,damage', ignoreDuplicates: true })

    if (hitsError) {
      console.error('Failed to insert damage hits:', hitsError.message)
    }

    // Populate game_accounts from resolved damage hit names (trigger backfills placeholders)
    const resolvedNames = new Map<number, string>()
    for (const h of body.damage_hits) {
      if (h.source_name && !h.source_name.startsWith('actor_') && !h.source_name.startsWith('char_')) {
        resolvedNames.set(h.source_id, h.source_name)
      }
    }
    if (resolvedNames.size > 0) {
      const rows = Array.from(resolvedNames.entries()).map(([account_id, name]) => ({
        account_id,
        server_id: ctx.serverId,
        name,
        updated_at: new Date().toISOString(),
      }))
      await supabase.from('game_accounts').upsert(rows, { onConflict: 'account_id,server_id' })
    }
  }

  // Save first_hitter_name as-is — trigger backfills when identity arrives
  if (killId && body.first_hitter_name) {
    await supabase
      .from('mvp_kills')
      .update({ first_hitter_name: body.first_hitter_name })
      .eq('id', killId)
      .is('first_hitter_name', null)
  }

  logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, has_tomb: !!tomb_x, has_killer: !!killer_name, loot_count: loots?.length ?? 0, damage_hits: body.damage_hits?.length ?? 0 }, result: action, killId })

  return NextResponse.json({ action, kill_id: killId }, { status: action === 'created' ? 201 : 200 })
}
