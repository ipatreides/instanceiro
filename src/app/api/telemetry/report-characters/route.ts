import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'
import { logTelemetryEvent } from '@/lib/telemetry/log-event'

interface ReportChar {
  char_id: number
  name: string
  level?: number
  class_id?: number
}

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { account_id, characters } = body as { account_id?: number; characters?: ReportChar[] }

  if (!characters || !Array.isArray(characters) || characters.length === 0) {
    return NextResponse.json({ error: 'Missing characters array' }, { status: 400 })
  }

  const resolved: any[] = []
  const unresolved: any[] = []

  for (const char of characters) {
    if (!char.char_id || !char.name) continue

    // Check if already resolved
    const { data: existingChar } = await supabase
      .from('characters')
      .select('id, name, account_id, game_char_id')
      .eq('game_char_id', char.char_id)
      .maybeSingle()

    if (existingChar) {
      // Already resolved — but update account link if missing
      const { data: account } = await supabase
        .from('accounts')
        .select('id, game_account_id')
        .eq('id', existingChar.account_id)
        .maybeSingle()

      if (account && !account.game_account_id && account_id && account_id !== 0) {
        await supabase
          .from('accounts')
          .update({ game_account_id: account_id })
          .eq('id', account.id)
          .is('game_account_id', null)
      }

      resolved.push({
        game_char_id: char.char_id,
        character_id: existingChar.id,
        name: existingChar.name,
        game_account_id: account?.game_account_id ?? account_id ?? 0,
      })
      continue
    }

    // Try match by name (case-insensitive, scoped to user)
    const { data: matchedChar } = await supabase
      .from('characters')
      .select('id, name, account_id')
      .eq('user_id', ctx.userId)
      .ilike('name', char.name)
      .is('game_char_id', null)
      .maybeSingle()

    if (matchedChar) {
      // Name match — resolve
      await supabase
        .from('characters')
        .update({ game_char_id: char.char_id })
        .eq('id', matchedChar.id)

      // Link account if we have account_id
      if (account_id && account_id !== 0) {
        const { error: accErr } = await supabase
          .from('accounts')
          .update({ game_account_id: account_id })
          .eq('id', matchedChar.account_id)
          .is('game_account_id', null)

        if (accErr && accErr.code === '23505') {
          // UNIQUE violation — account already linked to another user
          logTelemetryEvent(supabase, {
            endpoint: 'report-characters',
            tokenId: ctx.tokenId,
            characterId: ctx.characterUuid,
            payloadSummary: { char_name: char.name, account_id, conflict: true },
            result: 'error',
            reason: 'account_already_linked',
          })
        }
      }

      const { data: account } = await supabase
        .from('accounts')
        .select('game_account_id')
        .eq('id', matchedChar.account_id)
        .maybeSingle()

      resolved.push({
        game_char_id: char.char_id,
        character_id: matchedChar.id,
        name: matchedChar.name,
        game_account_id: account?.game_account_id ?? account_id ?? 0,
      })

      // Remove from unresolved if was there
      await supabase
        .from('unresolved_game_characters')
        .delete()
        .eq('game_char_id', char.char_id)

      continue
    }

    // No match — create/update unresolved
    await supabase
      .from('unresolved_game_characters')
      .upsert({
        game_char_id: char.char_id,
        game_account_id: account_id && account_id !== 0 ? account_id : null,
        char_name: char.name,
        char_level: char.level ?? null,
        char_class: char.class_id?.toString() ?? null,
        user_id: ctx.userId,
        group_id: ctx.groupId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'game_char_id' })

    unresolved.push({
      game_char_id: char.char_id,
      char_name: char.name,
      game_account_id: account_id && account_id !== 0 ? account_id : null,
    })
  }

  logTelemetryEvent(supabase, {
    endpoint: 'report-characters',
    tokenId: ctx.tokenId,
    characterId: ctx.characterUuid,
    payloadSummary: { account_id, char_count: characters.length, resolved: resolved.length, unresolved: unresolved.length },
    result: 'ok',
  })

  return NextResponse.json({ resolved, unresolved })
}
