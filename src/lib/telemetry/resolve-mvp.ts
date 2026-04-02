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
