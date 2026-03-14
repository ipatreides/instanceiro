import type { CooldownType } from "./types";

const BRT_OFFSET_HOURS = -3; // UTC-3 (Brasília Time)
const RESET_HOUR_BRT = 4; // 4:00 AM BRT

/**
 * Convert a UTC Date to the "wall clock" components in BRT (UTC-3).
 */
function toBRT(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const brtMs = date.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000;
  const d = new Date(brtMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),   // 0-indexed
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/**
 * Create a UTC Date from BRT wall clock components.
 * month is 0-indexed.
 */
function fromBRT(year: number, month: number, day: number, hour: number, minute = 0, second = 0): Date {
  // BRT = UTC-3, so UTC = BRT + 3
  return new Date(Date.UTC(year, month, day, hour - BRT_OFFSET_HOURS, minute, second));
}

/**
 * Returns the first 4:00 AM BRT strictly after the given date.
 */
function nextResetAfter(date: Date): Date {
  const { year, month, day, hour, minute, second } = toBRT(date);

  // Determine if 4 AM BRT of the same day is strictly after `date`
  const todayReset = fromBRT(year, month, day, RESET_HOUR_BRT);

  // "strictly after" means the reset must be > date (not equal)
  if (todayReset > date) {
    return todayReset;
  }
  // Otherwise, use next day's 4 AM
  // Advance by one day using UTC arithmetic to avoid DST issues
  const tomorrowBRTMs = Date.UTC(year, month, day + 1, RESET_HOUR_BRT - BRT_OFFSET_HOURS, 0, 0);
  return new Date(tomorrowBRTMs);
}

/**
 * Returns the BRT day-of-week (0=Sunday, 1=Monday, ..., 6=Saturday)
 * for the given UTC Date.
 */
function brtDayOfWeek(date: Date): number {
  const brtMs = date.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(brtMs).getUTCDay();
}

/**
 * Given a base Date (at 4:00 AM BRT), advance to the first occurrence
 * of the target day-of-week at 4:00 AM BRT that is >= base.
 */
function advanceToDay(base: Date, targetDow: number): Date {
  const currentDow = brtDayOfWeek(base);
  let daysAhead = (targetDow - currentDow + 7) % 7;
  if (daysAhead === 0) {
    // Already on target day — use same day (base is already on that day at 4 AM)
    return base;
  }
  return new Date(base.getTime() + daysAhead * 24 * 60 * 60 * 1000);
}

/**
 * Calculates the cooldown expiry Date for a given instance completion.
 *
 * @param completedAt  - When the instance was completed
 * @param cooldownType - "hourly" | "daily" | "three_day" | "weekly"
 * @param cooldownHours - Number of hours (required for "hourly", else null)
 * @param availableDay  - "thursday" | "friday" | "weekend" | null
 */
export function calculateCooldownExpiry(
  completedAt: Date,
  cooldownType: CooldownType,
  cooldownHours: number | null,
  availableDay: string | null
): Date {
  switch (cooldownType) {
    case "hourly": {
      if (cooldownHours === null) {
        throw new Error("cooldownHours is required for hourly cooldown type");
      }
      return new Date(completedAt.getTime() + cooldownHours * 60 * 60 * 1000);
    }

    case "daily": {
      return nextResetAfter(completedAt);
    }

    case "three_day": {
      const after72h = new Date(completedAt.getTime() + 72 * 60 * 60 * 1000);
      return nextResetAfter(after72h);
    }

    case "weekly": {
      const after168h = new Date(completedAt.getTime() + 168 * 60 * 60 * 1000);
      const baseReset = nextResetAfter(after168h);

      if (!availableDay) {
        return baseReset;
      }

      // Advance baseReset to the target day of week
      const targetDow = availableDayToDow(availableDay);
      if (targetDow === null) {
        return baseReset;
      }
      return advanceToDay(baseReset, targetDow);
    }

    default: {
      const _exhaustive: never = cooldownType;
      throw new Error(`Unknown cooldown type: ${_exhaustive}`);
    }
  }
}

/**
 * Maps an availableDay string to a day-of-week number (0=Sun, 6=Sat).
 * Returns null for "weekend" (handled specially) or unrecognized values.
 * For "weekend", returns null since it spans two days — handled by isAvailableDay.
 */
function availableDayToDow(availableDay: string): number | null {
  switch (availableDay) {
    case "thursday": return 4;
    case "friday": return 5;
    case "weekend":
      // Weekend = Saturday (6). Return Saturday as start of weekend.
      return 6;
    default:
      return null;
  }
}

/**
 * Returns true if the given date falls on an "available" day for the instance.
 *
 * @param availableDay - "thursday" | "friday" | "weekend" | null
 * @param now          - The current date/time to check
 */
export function isAvailableDay(availableDay: string | null, now: Date): boolean {
  if (availableDay === null) {
    return true;
  }

  const dow = brtDayOfWeek(now); // 0=Sun, 1=Mon, ..., 6=Sat

  switch (availableDay) {
    case "thursday":
      return dow === 4;
    case "friday":
      return dow === 5;
    case "weekend":
      // Saturday (6) or Sunday (0)
      return dow === 6 || dow === 0;
    default:
      return false;
  }
}
