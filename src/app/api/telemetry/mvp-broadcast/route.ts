import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

const BIO5_CODES: Record<string, { type: string; mvp?: string }> = {
  YGjm: { type: 'pre_spawn' },
  YWjm: { type: 'summon', mvp: 'Rune Knight Seyren' },
  Ymjm: { type: 'summon', mvp: 'Mechanic Howard' },
  Y2jm: { type: 'summon', mvp: 'Guillotine Cross Eremes' },
  ZGjm: { type: 'summon', mvp: 'Warlock Kathryne' },
  ZWjm: { type: 'summon', mvp: 'Archbishop Margaretha' },
  Zmjm: { type: 'summon', mvp: 'Ranger Cecil' },
  Z2jm: { type: 'summon', mvp: 'Royal Guard Randel' },
  aGjm: { type: 'summon', mvp: 'Genetic Flamel' },
  aWjm: { type: 'summon', mvp: 'Shadow Chaser Gertie' },
  amjm: { type: 'summon', mvp: 'Sorcerer Celia' },
  a2jm: { type: 'summon', mvp: 'Sura Chen' },
  bGjm: { type: 'summon', mvp: 'Wanderer Trentini' },
  bWjm: { type: 'summon', mvp: 'Minstrel Alphoccio' },
  gGjm: { type: 'mvp_spawn', mvp: 'Guillotine Cross Eremes' },
  gmjm: { type: 'mvp_spawn', mvp: 'Archbishop Margaretha' },
  hGjm: { type: 'mvp_spawn', mvp: 'Ranger Cecil' },
  hmjm: { type: 'mvp_spawn', mvp: 'Mechanic Howard' },
  iGjm: { type: 'mvp_spawn', mvp: 'Warlock Kathryne' },
  imjm: { type: 'mvp_spawn', mvp: 'Rune Knight Seyren' },
  jGjm: { type: 'mvp_spawn', mvp: 'Royal Guard Randel' },
  jmjm: { type: 'mvp_spawn', mvp: 'Genetic Flamel' },
  kGjm: { type: 'mvp_spawn', mvp: 'Sorcerer Celia' },
  kmjm: { type: 'mvp_spawn', mvp: 'Sura Chen' },
  lGjm: { type: 'mvp_spawn', mvp: 'Shadow Chaser Gertie' },
  lmjm: { type: 'mvp_spawn', mvp: 'Minstrel Alphoccio' },
  mGjm: { type: 'mvp_spawn', mvp: 'Wanderer Trentini' },
  mmjm: { type: 'mvp_killed_success' },
  mWjm: { type: 'mvp_killed_respawn' },
  fmjm: { type: 'failed' },
  fWjm: { type: 'waiting' },
}

const MAP_TO_COOLDOWN_GROUP: Record<string, string> = {
  lhz_dun_n: 'bio_lab_5',
  lhz_dun05: 'bio_lab_5',
}

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { code, map } = body

  if (!code || !map) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-broadcast',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { code, map },
      result: 'error',
      reason: 'missing_fields',
    })
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const event = BIO5_CODES[code]
  if (!event) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-broadcast',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { code, map },
      result: 'ignored',
      reason: 'unknown_code',
    })
    return NextResponse.json({ action: 'ignored', reason: 'unknown_code' })
  }

  const normalizedMap = String(map).replace(/\.gat$/, '')
  const cooldownGroup = MAP_TO_COOLDOWN_GROUP[normalizedMap]
  if (!cooldownGroup) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-broadcast',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { code, map: normalizedMap },
      result: 'ignored',
      reason: 'unknown_map',
    })
    return NextResponse.json({ action: 'ignored', reason: 'unknown_map' })
  }

  const { error } = await supabase
    .from('mvp_broadcast_events')
    .upsert(
      {
        group_id: ctx.groupId,
        cooldown_group: cooldownGroup,
        code,
        event_type: event.type,
        mvp_name: event.mvp ?? null,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      { onConflict: 'group_id,cooldown_group' }
    )

  if (error) {
    logTelemetryEvent(supabase, {
      endpoint: 'mvp-broadcast',
      tokenId: ctx.tokenId,
      characterId: ctx.characterUuid,
      payloadSummary: { code, map: normalizedMap, cooldown_group: cooldownGroup },
      result: 'error',
      reason: error.message,
    })
    return NextResponse.json({ error: 'Failed to store broadcast event' }, { status: 500 })
  }

  logTelemetryEvent(supabase, {
    endpoint: 'mvp-broadcast',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { code, map: normalizedMap, event_type: event.type, cooldown_group: cooldownGroup },
    result: 'created',
    reason: event.type,
  })

  return NextResponse.json({ action: 'stored', event_type: event.type }, { status: 200 })
}
