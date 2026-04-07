import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const killId = request.nextUrl.searchParams.get('kill_id')
  if (!killId) {
    return NextResponse.json({ error: 'kill_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: kill, error: killError } = await supabase
    .from('mvp_kills')
    .select('id, first_hitter_name')
    .eq('id', killId)
    .single()

  if (killError || !kill) {
    return NextResponse.json({ error: 'Kill not found' }, { status: 404 })
  }

  const { data: hits, error: hitsError } = await supabase
    .from('mvp_kill_damage_hits')
    .select('source_name, damage, server_tick, elapsed_ms, skill_id, reported_by')
    .eq('kill_id', killId)
    .order('elapsed_ms', { ascending: true })

  if (hitsError || !hits || hits.length === 0) {
    return NextResponse.json(null)
  }

  // Resolve "actor_NNNNN" names from cache (actor_id = account_id for players)
  const unresolvedIds = [...new Set(
    hits.filter(h => h.source_name.startsWith('actor_')).map(h => h.source_name.replace('actor_', ''))
  )].map(Number).filter(n => !isNaN(n))

  const nameMap = new Map<string, string>()
  if (unresolvedIds.length > 0) {
    // Get server_id from kill's group
    const { data: killGroup } = await supabase
      .from('mvp_kills')
      .select('mvp_entries!inner(server_id)')
      .eq('id', killId)
      .single()
    const serverId = (killGroup as any)?.mvp_entries?.server_id

    if (serverId) {
      const { data: cached } = await supabase
        .from('game_accounts')
        .select('account_id, name')
        .eq('server_id', serverId)
        .in('account_id', unresolvedIds)

      for (const c of cached ?? []) {
        nameMap.set(`actor_${c.account_id}`, c.name)
      }
    }
  }

  // Apply resolved names to hits
  const resolvedHits = hits.map(h => ({
    ...h,
    source_name: nameMap.get(h.source_name) ?? h.source_name,
  }))

  // Aggregate by source
  const damageBySource = new Map<string, number>()
  for (const hit of resolvedHits) {
    damageBySource.set(hit.source_name, (damageBySource.get(hit.source_name) ?? 0) + hit.damage)
  }

  const totalDamage = Array.from(damageBySource.values()).reduce((a, b) => a + b, 0)
  const durationMs = Math.max(...resolvedHits.map(h => h.elapsed_ms))

  const attackers = Array.from(damageBySource.entries())
    .map(([name, total_damage]) => ({
      name,
      total_damage,
      pct: totalDamage > 0 ? Math.round(total_damage / totalDamage * 100) : 0,
      is_first_hitter: name === kill.first_hitter_name,
    }))
    .sort((a, b) => b.total_damage - a.total_damage)

  // Build cumulative timeline (1-second buckets, only attackers >=1%)
  const timelineAttackers = new Set(attackers.filter(a => a.pct >= 1).map(a => a.name))
  const bucketMs = 1000
  const numBuckets = Math.ceil(durationMs / bucketMs) + 1

  const cumulative = new Map<string, number>()
  for (const name of timelineAttackers) {
    cumulative.set(name, 0)
  }

  const bucketedHits = new Map<number, Map<string, number>>()
  for (const hit of resolvedHits) {
    if (!timelineAttackers.has(hit.source_name)) continue
    const bucket = Math.floor(hit.elapsed_ms / bucketMs)
    if (!bucketedHits.has(bucket)) bucketedHits.set(bucket, new Map())
    const bm = bucketedHits.get(bucket)!
    bm.set(hit.source_name, (bm.get(hit.source_name) ?? 0) + hit.damage)
  }

  const timeline: Record<string, number>[] = []
  for (let i = 0; i < numBuckets; i++) {
    const point: Record<string, number> = { elapsed_ms: i * bucketMs }
    const bucketDmg = bucketedHits.get(i)
    for (const name of timelineAttackers) {
      if (bucketDmg) {
        cumulative.set(name, (cumulative.get(name) ?? 0) + (bucketDmg.get(name) ?? 0))
      }
      point[name] = cumulative.get(name) ?? 0
    }
    timeline.push(point)
  }

  const snifferCount = new Set(resolvedHits.map(h => h.reported_by).filter(Boolean)).size

  // Build raw hits with per-attacker hit_index and cumulative damage
  const cumulativeBySource = new Map<string, number>()
  const hitIndexBySource = new Map<string, number>()
  const rawHits = resolvedHits
    .filter(h => timelineAttackers.has(h.source_name))
    .map(h => {
      const prevCum = cumulativeBySource.get(h.source_name) ?? 0
      const cumulative = prevCum + h.damage
      cumulativeBySource.set(h.source_name, cumulative)
      const idx = (hitIndexBySource.get(h.source_name) ?? 0) + 1
      hitIndexBySource.set(h.source_name, idx)
      return {
        source_name: h.source_name,
        damage: h.damage,
        cumulative,
        hit_index: idx,
        elapsed_ms: h.elapsed_ms,
        skill_id: h.skill_id,
      }
    })

  return NextResponse.json({
    kill_id: killId,
    first_hitter: kill.first_hitter_name,
    duration_ms: durationMs,
    sniffer_count: Math.max(snifferCount, 1),
    attackers,
    timeline,
    raw_hits: rawHits,
  })
}
