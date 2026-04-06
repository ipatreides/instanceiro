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

  // Resolve killer name placeholders before matching
  let resolvedKillerName = killer_name ?? null
  if (resolvedKillerName?.startsWith('actor_')) {
    const accountId = Number(resolvedKillerName.replace('actor_', ''))
    if (!isNaN(accountId)) {
      const { data: cached } = await supabase
        .from('account_name_cache')
        .select('name')
        .eq('account_id', accountId)
        .eq('server_id', ctx.serverId)
        .maybeSingle()
      if (cached?.name && !cached.name.startsWith('char_') && !cached.name.startsWith('actor_')) {
        resolvedKillerName = cached.name
      }
    }
  }
  if (resolvedKillerName?.startsWith('char_')) {
    const charId = Number(resolvedKillerName.replace('char_', ''))
    if (!isNaN(charId)) {
      const { data: charRow } = await supabase
        .from('characters')
        .select('name')
        .eq('game_char_id', charId)
        .maybeSingle()
      if (charRow?.name) resolvedKillerName = charRow.name
    }
  }

  // Resolve killer character
  let killerCharId: string | null = null
  if (resolvedKillerName) {
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
    // Resolve "actor_NNNNN" names from account_name_cache before saving
    const unresolvedActorIds = [...new Set(
      body.damage_hits
        .filter((h: { source_name: string }) => h.source_name?.startsWith('actor_'))
        .map((h: { source_name: string }) => Number(h.source_name.replace('actor_', '')))
        .filter((n: number) => !isNaN(n))
    )]
    const nameCache = new Map<number, string>()
    if (unresolvedActorIds.length > 0) {
      const { data: cached } = await supabase
        .from('account_name_cache')
        .select('account_id, name')
        .eq('server_id', ctx.serverId)
        .in('account_id', unresolvedActorIds)
      for (const c of cached ?? []) {
        if (!c.name.startsWith('char_') && !c.name.startsWith('actor_')) {
          nameCache.set(c.account_id, c.name)
        }
      }
    }

    // Resolve "char_NNNNN" names from characters table by game_char_id
    const unresolvedCharIds = [...new Set(
      body.damage_hits
        .filter((h: { source_name: string }) => h.source_name?.startsWith('char_'))
        .map((h: { source_name: string }) => Number(h.source_name.replace('char_', '')))
        .filter((n: number) => !isNaN(n))
    )]
    const charNameCache = new Map<number, string>()
    if (unresolvedCharIds.length > 0) {
      const { data: chars } = await supabase
        .from('characters')
        .select('game_char_id, name')
        .in('game_char_id', unresolvedCharIds)
      for (const c of chars ?? []) {
        if (c.game_char_id && c.name) charNameCache.set(c.game_char_id, c.name)
      }
    }

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
      source_name: h.source_name?.startsWith('actor_')
        ? (nameCache.get(Number(h.source_name.replace('actor_', ''))) ?? h.source_name)
        : h.source_name?.startsWith('char_')
        ? (charNameCache.get(Number(h.source_name.replace('char_', ''))) ?? h.source_name)
        : h.source_name,
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

    // Populate account name cache from resolved names (source_id = account_id for players)
    const resolvedNames = new Map<number, string>()
    for (const h of body.damage_hits) {
      if (h.source_name && !h.source_name.startsWith('actor_') && !h.source_name.startsWith('char_')) {
        resolvedNames.set(h.source_id, h.source_name)
      }
    }

    if (resolvedNames.size > 0) {
      const cacheRows = Array.from(resolvedNames.entries()).map(([account_id, name]: [number, string]) => ({
        account_id,
        server_id: ctx.serverId,
        name,
        updated_at: new Date().toISOString(),
      }))
      await supabase
        .from('account_name_cache')
        .upsert(cacheRows, { onConflict: 'account_id,server_id' })

      // Backfill unresolved names in existing damage hits for this kill
      for (const [sourceId, name] of resolvedNames) {
        // Update hits with actor_N or char_N placeholders
        await supabase
          .from('mvp_kill_damage_hits')
          .update({ source_name: name })
          .eq('kill_id', killId)
          .eq('source_id', sourceId)
          .or('source_name.like.actor_%,source_name.like.char_%')
      }
    }
  }

  // Update first_hitter_name if provided and not yet set
  if (killId && body.first_hitter_name) {
    let firstHitter = body.first_hitter_name
    // Resolve "actor_NNNNN" via account_name_cache
    if (firstHitter.startsWith('actor_')) {
      const fhAccountId = Number(firstHitter.replace('actor_', ''))
      if (!isNaN(fhAccountId)) {
        const { data: fhCached } = await supabase
          .from('account_name_cache')
          .select('name')
          .eq('account_id', fhAccountId)
          .eq('server_id', ctx.serverId)
          .maybeSingle()
        if (fhCached?.name && !fhCached.name.startsWith('char_') && !fhCached.name.startsWith('actor_')) {
          firstHitter = fhCached.name
        }
      }
    }
    // Resolve "char_NNNNN" via characters table
    if (firstHitter.startsWith('char_')) {
      const fhCharId = Number(firstHitter.replace('char_', ''))
      if (!isNaN(fhCharId)) {
        const { data: fhChar } = await supabase
          .from('characters')
          .select('name')
          .eq('game_char_id', fhCharId)
          .maybeSingle()
        if (fhChar?.name) firstHitter = fhChar.name
      }
    }
    if (!firstHitter.startsWith('actor_') && !firstHitter.startsWith('char_')) {
      await supabase
        .from('mvp_kills')
        .update({ first_hitter_name: firstHitter })
        .eq('id', killId)
        .is('first_hitter_name', null)
    }
  }

  logTelemetryEvent(supabase, { endpoint: 'mvp-event', tokenId: ctx.tokenId, characterId: ctx.characterUuid, payloadSummary: { monster_id, map, has_tomb: !!tomb_x, has_killer: !!killer_name, loot_count: loots?.length ?? 0, damage_hits: body.damage_hits?.length ?? 0 }, result: action, killId })

  return NextResponse.json({ action, kill_id: killId }, { status: action === 'created' ? 201 : 200 })
}
