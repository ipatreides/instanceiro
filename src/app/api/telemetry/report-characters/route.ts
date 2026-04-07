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

    // Always populate game identity store (triggers backfill placeholders)
    await supabase.from('game_characters').upsert({
      char_id: char.char_id,
      server_id: ctx.serverId,
      account_id: account_id && account_id !== 0 ? account_id : null,
      name: char.name,
      level: char.level ?? null,
      class_id: char.class_id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'char_id,server_id' })

    // Check if already resolved
    const { data: existingChar } = await supabase
      .from('characters')
      .select('id, name, account_id, game_char_id')
      .eq('game_char_id', char.char_id)
      .maybeSingle()

    if (existingChar) {
      // Already resolved — update level if provided
      if (char.level && char.level > 0) {
        await supabase.from('characters').update({ level: char.level }).eq('id', existingChar.id)
      }

      // Update account link if missing
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
      // Name match — resolve + update level
      const updateFields: Record<string, any> = { game_char_id: char.char_id }
      if (char.level && char.level > 0) updateFields.level = char.level
      await supabase
        .from('characters')
        .update(updateFields)
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

      continue
    }

    // No match in Instanceiro — char exists in game_characters (already upserted above)
    unresolved.push({
      game_char_id: char.char_id,
      char_name: char.name,
      game_account_id: account_id && account_id !== 0 ? account_id : null,
    })
  }

  // Populate game_accounts with the first character's name
  if (account_id && account_id !== 0 && characters.length > 0) {
    const firstChar = characters.find(c => c.name) ?? characters[0]
    await supabase.from('game_accounts').upsert({
      account_id,
      server_id: ctx.serverId,
      name: firstChar.name,
      last_active_char_id: firstChar.char_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,server_id' })
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
