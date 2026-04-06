import { resolveMapAlias } from '../telemetry/resolve-mvp'

describe('resolveMapAlias', () => {
  it('returns canonical name for known alias', () => {
    expect(resolveMapAlias('lhz_dun_n')).toBe('lhz_dun05')
  })

  it('returns same name when no alias exists', () => {
    expect(resolveMapAlias('prontera')).toBe('prontera')
  })

  it('returns null for unknown/empty map', () => {
    expect(resolveMapAlias('unknown')).toBeNull()
    expect(resolveMapAlias('')).toBeNull()
    expect(resolveMapAlias(null)).toBeNull()
    expect(resolveMapAlias(undefined)).toBeNull()
  })
})

// resolveMvpIds requires Supabase, tested via integration/endpoint tests.
// The key behavior change (monster_id=0 skips monster_id filter) is validated
// by the Rust sniffer tests + endpoint-level tests below.

describe('resolveMvpIds with monster_id=0 (Convex Mirror)', () => {
  // Mock Supabase client that simulates the query chain
  function mockSupabase(rows: { id: number }[]) {
    const chain: any = {
      from: () => chain,
      select: () => chain,
      eq: jest.fn(() => chain),
      data: rows,
      then: (fn: any) => fn({ data: rows }),
    }
    // Make the chain thenable so await works
    const query = {
      from: () => query,
      select: () => query,
      eq: jest.fn(function(this: any, col: string, val: any) {
        (query as any)._eqs = (query as any)._eqs || []
        ;(query as any)._eqs.push([col, val])
        return query
      }),
      then: (resolve: any) => resolve({ data: rows }),
    }
    return query as any
  }

  it('with monster_id > 0, calls eq for monster_id', async () => {
    const { resolveMvpIds } = await import('../telemetry/resolve-mvp')
    const supabase = mockSupabase([{ id: 42 }])
    const result = await resolveMvpIds(supabase, 2, 1768, 'ra_san05')

    expect(result.ignored).toBe(false)
    expect(result.mvpIds).toEqual([42])
    // Should have 3 eq calls: server_id, map_name, monster_id
    expect(supabase.eq).toHaveBeenCalledTimes(3)
    expect(supabase.eq).toHaveBeenCalledWith('monster_id', 1768)
  })

  it('with monster_id = 0 (mirror), skips monster_id filter', async () => {
    const { resolveMvpIds } = await import('../telemetry/resolve-mvp')
    const supabase = mockSupabase([{ id: 42 }])
    const result = await resolveMvpIds(supabase, 2, 0, 'ra_san05')

    expect(result.ignored).toBe(false)
    expect(result.mvpIds).toEqual([42])
    // Should have only 2 eq calls: server_id, map_name (no monster_id)
    expect(supabase.eq).toHaveBeenCalledTimes(2)
    expect(supabase.eq).toHaveBeenCalledWith('server_id', 2)
    expect(supabase.eq).toHaveBeenCalledWith('map_name', 'ra_san05')
  })

  it('with no map, returns ignored', async () => {
    const { resolveMvpIds } = await import('../telemetry/resolve-mvp')
    const supabase = mockSupabase([])
    const result = await resolveMvpIds(supabase, 2, 0, 'unknown')

    expect(result.ignored).toBe(true)
    expect(result.reason).toContain('no map')
  })

  it('with map but no matching MVPs, returns ignored', async () => {
    const { resolveMvpIds } = await import('../telemetry/resolve-mvp')
    const supabase = mockSupabase([])
    const result = await resolveMvpIds(supabase, 2, 0, 'prontera')

    expect(result.ignored).toBe(true)
    expect(result.reason).toContain('not in mvps whitelist')
  })
})
