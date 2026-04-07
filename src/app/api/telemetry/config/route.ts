import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function GET(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  // Fetch MVP monster_ids for this server
  const { data: mvps } = await supabase
    .from('mvps')
    .select('monster_id')
    .eq('server_id', ctx.serverId)

  const monsterIds = mvps?.map((m) => m.monster_id) ?? []

  // Get current config_version from the server's version table
  const { data: configVersion } = await supabase
    .from('telemetry_config_versions')
    .select('version')
    .eq('server_id', ctx.serverId)
    .maybeSingle()

  // Resolved game characters (linked to Instanceiro characters)
  const { data: resolvedChars } = await supabase
    .from('characters')
    .select('game_char_id, name, id, accounts!inner(game_account_id)')
    .eq('user_id', ctx.userId)
    .not('game_char_id', 'is', null)

  const resolved_characters = (resolvedChars ?? []).map((c: any) => ({
    game_char_id: c.game_char_id,
    game_account_id: c.accounts?.game_account_id ?? 0,
    character_id: c.id,
    name: c.name,
  }))

  // Unresolved game characters (from game_characters not yet linked in Instanceiro)
  const { data: unresolvedChars } = await supabase
    .from('game_characters')
    .select('char_id, account_id, name')
    .eq('server_id', ctx.serverId)

  const linkedCharIds = new Set(resolved_characters.map((c: any) => c.game_char_id).filter(Boolean))
  const unresolved_characters = (unresolvedChars ?? [])
    .filter((c: any) => !linkedCharIds.has(c.char_id))
    .map((c: any) => ({
      game_char_id: c.char_id,
      game_account_id: c.account_id ?? 0,
      char_name: c.name,
    }))

  return NextResponse.json({
    config_version: configVersion?.version ?? 1,
    server_id: ctx.serverId,
    group_id: ctx.groupId,
    resolved_characters,
    unresolved_characters,
    events: {
      mvp_kill: {
        enabled: true,
        monster_ids: monsterIds,
        batch_window_ms: 3000,
      },
      mvp_tomb: {
        enabled: true,
        npc_id: 565,
      },
      mvp_killer: {
        enabled: true,
      },
      heartbeat: {
        interval_ms: 60000,
      },
    },
  })
}
