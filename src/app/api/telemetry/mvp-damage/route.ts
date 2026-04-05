import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const killId = request.nextUrl.searchParams.get('kill_id')
  if (!killId) {
    return NextResponse.json({ error: 'kill_id required' }, { status: 400 })
  }

  const supabase = await createClient()

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

  // Aggregate by source
  const damageBySource = new Map<string, number>()
  for (const hit of hits) {
    damageBySource.set(hit.source_name, (damageBySource.get(hit.source_name) ?? 0) + hit.damage)
  }

  const totalDamage = Array.from(damageBySource.values()).reduce((a, b) => a + b, 0)
  const durationMs = Math.max(...hits.map(h => h.elapsed_ms))

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
  for (const hit of hits) {
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

  const snifferCount = new Set(hits.map(h => h.reported_by).filter(Boolean)).size

  return NextResponse.json({
    kill_id: killId,
    first_hitter: kill.first_hitter_name,
    duration_ms: durationMs,
    sniffer_count: Math.max(snifferCount, 1),
    attackers,
    timeline,
  })
}
