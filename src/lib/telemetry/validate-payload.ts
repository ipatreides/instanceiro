const MAX_FUTURE_MS = 60_000      // 60 seconds
const MAX_AGE_MS = 24 * 3600_000  // 24 hours
const BRT_TIMEZONE = 'America/Sao_Paulo'

type TimestampResult =
  | { valid: true; date: Date }
  | { valid: false; reason: 'timestamp_future' | 'timestamp_stale' | 'timestamp_invalid' }

export function validateTimestamp(epochSeconds: number): TimestampResult {
  if (epochSeconds == null || typeof epochSeconds !== 'number' || isNaN(epochSeconds)) {
    return { valid: false, reason: 'timestamp_invalid' }
  }

  const ms = epochSeconds * 1000
  const now = Date.now()

  if (ms > now + MAX_FUTURE_MS) {
    return { valid: false, reason: 'timestamp_future' }
  }
  if (ms < now - MAX_AGE_MS) {
    return { valid: false, reason: 'timestamp_stale' }
  }

  return { valid: true, date: new Date(ms) }
}

export function reconstructKilledAt(
  killHour: number | null | undefined,
  killMinute: number | null | undefined,
  reference: Date,
  respawnMs?: number
): Date | null {
  if (killHour == null || killMinute == null || killHour < 0 || killMinute < 0) {
    return null
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BRT_TIMEZONE,
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(reference)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT-3'
  const offsetMatch = offsetPart.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3

  const brtDateStr = reference.toLocaleDateString('en-CA', { timeZone: BRT_TIMEZONE })
  const isoStr = `${brtDateStr}T${String(killHour).padStart(2, '0')}:${String(killMinute).padStart(2, '0')}:00Z`
  const result = new Date(isoStr)
  result.setHours(result.getHours() - offsetHours)

  if (result.getTime() > reference.getTime()) {
    result.setDate(result.getDate() - 1)
  }

  // Validate against respawn window if provided
  if (respawnMs != null) {
    const maxAge = respawnMs + 10 * 60 * 1000 // respawn + 10min
    const age = reference.getTime() - result.getTime()
    if (age < 0 || age > maxAge) {
      return null // Time is outside valid window
    }
  }

  return result
}
