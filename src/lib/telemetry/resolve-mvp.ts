import type { SupabaseClient } from '@supabase/supabase-js'

interface ResolveMvpResult {
  mvpIds: number[]
  ignored: boolean
  reason?: string
}

export async function resolveMvpIds(
  supabase: SupabaseClient,
  serverId: number,
  monsterId: number,
  map: string | null | undefined
): Promise<ResolveMvpResult> {
  const resolvedMap = (map && map !== 'unknown') ? map : null

  if (resolvedMap) {
    const { data: mvpRows } = await supabase
      .from('mvps')
      .select('id')
      .eq('monster_id', monsterId)
      .eq('server_id', serverId)
      .eq('map_name', resolvedMap)

    if (!mvpRows || mvpRows.length === 0) {
      return { mvpIds: [], ignored: true, reason: 'map not in mvps whitelist (likely instance)' }
    }

    return { mvpIds: mvpRows.map(m => m.id), ignored: false }
  }

  return { mvpIds: [], ignored: true, reason: 'no map provided' }
}
