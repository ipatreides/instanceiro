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

  // Get current config_version from any session for this token
  const { data: session } = await supabase
    .from('telemetry_sessions')
    .select('config_version')
    .eq('token_id', ctx.tokenId)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    config_version: session?.config_version ?? 1,
    server_id: ctx.serverId,
    group_id: ctx.groupId,
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
