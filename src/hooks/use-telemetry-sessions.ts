'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

export interface ActiveTelemetryMember {
  userId: string
  characterId: number
  characterName: string | null
  currentMap: string | null
  lastHeartbeat: string
  inInstance: boolean
}

export function useTelemetrySessions(groupId: string | null) {
  const [sessions, setSessions] = useState<ActiveTelemetryMember[]>([])

  useEffect(() => {
    if (!groupId) return

    const supabase = createClient()

    async function fetch() {
      const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString()

      const { data } = await supabase
        .from('telemetry_sessions')
        .select('user_id, character_id, character_name, current_map, last_heartbeat, in_instance')
        .eq('group_id', groupId)
        .gte('last_heartbeat', cutoff)

      setSessions(
        data?.map((s) => ({
          userId: s.user_id,
          characterId: s.character_id,
          characterName: s.character_name,
          currentMap: s.current_map,
          lastHeartbeat: s.last_heartbeat,
          inInstance: s.in_instance ?? false,
        })) ?? []
      )
    }

    fetch()
    const interval = setInterval(fetch, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [groupId])

  return sessions
}
