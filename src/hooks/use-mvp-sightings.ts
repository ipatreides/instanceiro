'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface MvpSighting {
  id: string
  mvp_id: number
  map_name: string
  x: number
  y: number
  spotted_at: string
}

/**
 * Subscribes to real-time MVP sightings for a group.
 * Returns the latest sighting per MVP (within the last 5 minutes).
 */
export function useMvpSightings(groupId: string | null) {
  const [sightings, setSightings] = useState<MvpSighting[]>([])

  useEffect(() => {
    if (!groupId) return

    const supabase = createClient()

    // Initial fetch: recent sightings (last 5 min)
    async function fetchRecent() {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('mvp_sightings')
        .select('id, mvp_id, map_name, x, y, spotted_at')
        .eq('group_id', groupId)
        .gte('spotted_at', cutoff)
        .order('spotted_at', { ascending: false })

      setSightings(data ?? [])
    }

    fetchRecent()

    // Realtime subscription
    const channel = supabase
      .channel(`mvp-sightings-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mvp_sightings',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as MvpSighting
            setSightings((prev) => {
              // Replace old sighting for same MVP, or add new
              const filtered = prev.filter((s) => s.mvp_id !== row.mvp_id)
              return [row, ...filtered]
            })
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as MvpSighting
            setSightings((prev) =>
              prev.map((s) => (s.id === row.id ? row : s))
            )
          }
        }
      )
      .subscribe()

    // Cleanup stale sightings every 30s
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000
      setSightings((prev) =>
        prev.filter((s) => new Date(s.spotted_at).getTime() > cutoff)
      )
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(cleanup)
    }
  }, [groupId])

  return sightings
}
