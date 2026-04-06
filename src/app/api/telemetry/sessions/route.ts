import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('telemetry_sessions')
    .select('id, token_id, current_map, client_version, last_heartbeat, started_at, character_id, character_name, in_instance, instance_name')
    .eq('user_id', user.id)
    .order('last_heartbeat', { ascending: false })

  if (error) {
    console.error('[sessions] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const recent = (data ?? []).filter((s: any) => Date.now() - new Date(s.last_heartbeat).getTime() < 30 * 60 * 1000)
  console.log(`[sessions] user=${user.id} rows=${data?.length ?? 0} recent=${recent.length} sample=${JSON.stringify(recent.slice(0, 2).map((s: any) => ({ char: s.character_id, name: s.character_name, ver: s.client_version, hb: s.last_heartbeat })))}`)
  return NextResponse.json(data ?? [])
}
