import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTelemetryContext } from '@/lib/telemetry'

export async function POST(request: NextRequest) {
  const result = await resolveTelemetryContext(request)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { ctx } = result
  const supabase = createAdminClient()

  const body = await request.json()
  const { current_map, config_version } = body

  // Update session with current map and heartbeat
  await supabase
    .from('telemetry_sessions')
    .update({
      current_map: current_map ?? null,
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', ctx.sessionId)

  // Get current config_version
  const { data: session } = await supabase
    .from('telemetry_sessions')
    .select('config_version')
    .eq('id', ctx.sessionId)
    .single()

  return NextResponse.json({
    status: 'ok',
    config_version: session?.config_version ?? 1,
  })
}
