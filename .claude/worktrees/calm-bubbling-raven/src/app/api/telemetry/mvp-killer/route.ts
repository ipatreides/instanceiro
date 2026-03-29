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

  const { map, tomb_x, tomb_y, killer_name } = await request.json()

  if (!killer_name) {
    return NextResponse.json({ error: 'Missing killer_name' }, { status: 400 })
  }

  // Find kill by tomb coordinates + map in this group
  let query = supabase
    .from('mvp_kills')
    .select('id')
    .eq('group_id', ctx.groupId)

  if (tomb_x != null && tomb_y != null) {
    query = query.eq('tomb_x', tomb_x).eq('tomb_y', tomb_y)
  }

  const { data: kill } = await query
    .order('killed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!kill) {
    return NextResponse.json({ action: 'ignored', reason: 'no matching kill' })
  }

  // Try to resolve killer_name to a character_id in the group
  const { data: members } = await supabase
    .from('mvp_group_members')
    .select('character_id, characters!inner(name)')
    .eq('group_id', ctx.groupId)

  const match = members?.find(
    (m: any) => m.characters?.name === killer_name
  )

  const updates: Record<string, any> = { killer_name_raw: killer_name }
  if (match) {
    updates.killer_character_id = match.character_id
  }

  await supabase
    .from('mvp_kills')
    .update(updates)
    .eq('id', kill.id)

  return NextResponse.json({
    action: 'updated',
    kill_id: kill.id,
    killer_resolved: !!match,
  })
}
