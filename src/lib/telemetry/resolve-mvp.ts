import type { SupabaseClient } from '@supabase/supabase-js'

// Maps sniffer map names to the canonical map_name used in the mvps table
const MAP_ALIASES: Record<string, string> = {
  lhz_dun_n: 'lhz_dun05',
}

export function resolveMapAlias(map: string | null | undefined): string | null {
  if (!map || map === 'unknown') return null
  return MAP_ALIASES[map] ?? map
}

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
  const rawMap = (map && map !== 'unknown') ? map : null
  const resolvedMap = rawMap ? (MAP_ALIASES[rawMap] ?? rawMap) : null

  if (resolvedMap) {
    let query = supabase
      .from('mvps')
      .select('id')
      .eq('server_id', serverId)
      .eq('map_name', resolvedMap)

    // monster_id=0 means resolve by map only (e.g. Convex Mirror)
    if (monsterId > 0) {
      query = query.eq('monster_id', monsterId)
    }

    const { data: mvpRows } = await query

    if (!mvpRows || mvpRows.length === 0) {
      return { mvpIds: [], ignored: true, reason: 'map not in mvps whitelist (likely instance)' }
    }

    return { mvpIds: mvpRows.map(m => m.id), ignored: false }
  }

  return { mvpIds: [], ignored: true, reason: 'no map provided' }
}
