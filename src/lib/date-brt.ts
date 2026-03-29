/**
 * All dates in Instanceiro are displayed and input in BRT (America/Sao_Paulo).
 * This module provides helpers to ensure consistent timezone handling
 * regardless of the user's browser timezone.
 */

const BRT_TIMEZONE = 'America/Sao_Paulo'

/** Format a date/ISO string as HH:MM in BRT */
export function formatTimeBRT(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BRT_TIMEZONE,
  })
}

/** Format a date/ISO string as DD/MM in BRT */
export function formatDateBRT(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BRT_TIMEZONE,
  })
}

/** Format a date/ISO string as DD/MM HH:MM in BRT */
export function formatDateTimeBRT(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BRT_TIMEZONE,
  })
}

/** Get hours and minutes in BRT from a Date */
export function getHoursMinutesBRT(date: Date | string): { hours: number; minutes: number } {
  const d = typeof date === 'string' ? new Date(date) : date
  const parts = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: BRT_TIMEZONE,
  }).split(':')
  return { hours: parseInt(parts[0]), minutes: parseInt(parts[1]) }
}

/**
 * Create a Date from hours:minutes input interpreted as BRT.
 * If the resulting time is in the future, subtracts one day.
 */
export function parseBRTTimeToUTC(hours: number, minutes: number): Date {
  // Get current date parts in BRT
  const now = new Date()
  const brtDateStr = now.toLocaleDateString('en-CA', { timeZone: BRT_TIMEZONE }) // YYYY-MM-DD

  // Construct ISO string as if it's BRT, then convert
  // BRT is UTC-3 (standard) — but Sao_Paulo can have DST
  // Safest: use Intl to figure out the actual offset
  const isoStr = `${brtDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`

  // Create a formatter that gives us the UTC offset for BRT right now
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BRT_TIMEZONE,
    timeZoneName: 'shortOffset',
  })
  const parts = formatter.formatToParts(now)
  const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT-3'
  // offsetPart is like "GMT-3" or "GMT-2" (during DST)
  const offsetMatch = offsetPart.match(/GMT([+-]\d+)/)
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -3

  // Build UTC date: BRT time - offset = UTC
  const result = new Date(isoStr + 'Z')
  result.setHours(result.getHours() - offsetHours)

  // If in the future, subtract one day
  if (result.getTime() > Date.now()) {
    result.setDate(result.getDate() - 1)
  }

  return result
}
