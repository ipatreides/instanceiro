import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

interface HeartbeatClient {
  character_id: number
  account_id: number
  map: string
  name: string
  in_instance: boolean
  instance_name: string
}

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  console.log('[HEARTBEAT DEBUG]', JSON.stringify({ tokenId: ctx.tokenId, body }))
  const { config_version, client_version, clients, current_map } = body

  // Support both old format (current_map) and new format (clients array)
  const clientList: HeartbeatClient[] = clients ?? (current_map ? [{
    character_id: 0,
    account_id: 0,
    map: current_map,
    name: '',
    in_instance: false,
    instance_name: '',
  }] : [])

  const now = new Date().toISOString()

  // Upsert one session per client
  for (const client of clientList) {
    await supabase
      .from('telemetry_sessions')
      .upsert(
        {
          token_id: ctx.tokenId,
          user_id: ctx.userId,
          character_id: client.character_id,
          account_id: client.account_id,
          group_id: ctx.groupId,
          current_map: client.in_instance ? null : (client.map || null),
          character_name: client.name || null,
          client_version: client_version ?? null,
          in_instance: client.in_instance ?? false,
          instance_name: client.instance_name || null,
          last_heartbeat: now,
        },
        { onConflict: 'token_id,character_id' }
      )
  }

  // Clean stale sessions for this token (clients that disconnected)
  // Only clean if we have real clients — empty array means sniffer hasn't detected characters yet
  const activeCharIds = clientList.map(c => c.character_id)
  if (activeCharIds.length > 0 && activeCharIds.some(id => id !== 0)) {
    const { data: allSessions } = await supabase
      .from('telemetry_sessions')
      .select('id, character_id')
      .eq('token_id', ctx.tokenId)

    const staleIds = (allSessions ?? [])
      .filter(s => !activeCharIds.includes(s.character_id))
      .map(s => s.id)

    if (staleIds.length > 0) {
      await supabase
        .from('telemetry_sessions')
        .delete()
        .in('id', staleIds)
    }
  }

  // Clean legacy sessions with character_id=0 when real clients are reported
  const hasRealClients = clientList.some(c => c.character_id !== 0)
  if (hasRealClients) {
    await supabase
      .from('telemetry_sessions')
      .delete()
      .eq('token_id', ctx.tokenId)
      .eq('character_id', 0)
  }

  // Get config version
  const { data: configRow } = await supabase
    .from('telemetry_sessions')
    .select('config_version')
    .eq('token_id', ctx.tokenId)
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    status: 'ok',
    config_version: configRow?.config_version ?? 1,
  })
}
