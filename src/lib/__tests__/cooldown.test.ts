import {
  calculateCooldownExpiry,
  isAvailableDay,
} from "../cooldown";

// Helper: create a Date from a BRT date string (UTC-3)
function brt(dateStr: string): Date {
  return new Date(dateStr + "-03:00");
}

describe("calculateCooldownExpiry", () => {
  // 1. hourly: adds exact hours
  it("hourly: adds exact cooldown hours", () => {
    const completedAt = brt("2026-03-14T10:00:00");
    const result = calculateCooldownExpiry(completedAt, "hourly", 2, null);
    expect(result.toISOString()).toBe(
      brt("2026-03-14T12:00:00").toISOString()
    );
  });

  // 2. hourly 12h: crosses midnight
  it("hourly 12h: crosses midnight correctly", () => {
    const completedAt = brt("2026-03-14T20:00:00");
    const result = calculateCooldownExpiry(completedAt, "hourly", 12, null);
    expect(result.toISOString()).toBe(
      brt("2026-03-15T08:00:00").toISOString()
    );
  });

  // 3. daily: next 4 AM BRT after completion time (completed mid-day)
  it("daily: returns next 4 AM BRT after completion", () => {
    const completedAt = brt("2026-03-14T10:00:00");
    const result = calculateCooldownExpiry(completedAt, "daily", null, null);
    // Should be same day 4 AM? No — 10:00 AM is after 4 AM so next is tomorrow 4 AM
    expect(result.toISOString()).toBe(
      brt("2026-03-15T04:00:00").toISOString()
    );
  });

  // 4. daily: completed at 3:59 AM → same day 4 AM
  it("daily: completed at 3:59 AM returns same day 4 AM", () => {
    const completedAt = brt("2026-03-14T03:59:00");
    const result = calculateCooldownExpiry(completedAt, "daily", null, null);
    expect(result.toISOString()).toBe(
      brt("2026-03-14T04:00:00").toISOString()
    );
  });

  // 5. daily: exactly 4:00 AM → NEXT day 4 AM
  it("daily: completed exactly at 4:00 AM returns NEXT day 4 AM", () => {
    const completedAt = brt("2026-03-14T04:00:00");
    const result = calculateCooldownExpiry(completedAt, "daily", null, null);
    expect(result.toISOString()).toBe(
      brt("2026-03-15T04:00:00").toISOString()
    );
  });

  // 6. three_day: first 4 AM after +72h (lands after 4 AM)
  it("three_day: first 4 AM after +72h when +72h lands after 4 AM", () => {
    // completed at Mar 14 10:00 AM BRT → +72h = Mar 17 10:00 AM BRT
    // first 4 AM strictly after that = Mar 18 04:00 AM BRT
    const completedAt = brt("2026-03-14T10:00:00");
    const result = calculateCooldownExpiry(completedAt, "three_day", null, null);
    expect(result.toISOString()).toBe(
      brt("2026-03-18T04:00:00").toISOString()
    );
  });

  // 7. three_day: +72h lands before 4 AM → same day 4 AM
  it("three_day: +72h lands before 4 AM returns that day 4 AM", () => {
    // completed at Mar 14 02:00 AM BRT → +72h = Mar 17 02:00 AM BRT
    // first 4 AM strictly after Mar 17 02:00 = Mar 17 04:00 AM BRT
    const completedAt = brt("2026-03-14T02:00:00");
    const result = calculateCooldownExpiry(completedAt, "three_day", null, null);
    expect(result.toISOString()).toBe(
      brt("2026-03-17T04:00:00").toISOString()
    );
  });

  // 8. weekly: first 4 AM after +168h
  it("weekly (no specific day): first 4 AM after +168h", () => {
    // completed at Mar 14 10:00 AM BRT (Saturday) → +168h = Mar 21 10:00 AM BRT
    // first 4 AM strictly after that = Mar 22 04:00 AM BRT
    const completedAt = brt("2026-03-14T10:00:00");
    const result = calculateCooldownExpiry(completedAt, "weekly", null, null);
    expect(result.toISOString()).toBe(
      brt("2026-03-22T04:00:00").toISOString()
    );
  });

  // 9. weekly with thursday: waits for Thursday at/after cooldown
  it("weekly with thursday: finds first thursday at or after first 4 AM after +168h", () => {
    // completed at Mar 14 10:00 AM BRT (Saturday) → +168h = Mar 21 10:00 AM BRT (Saturday)
    // first 4 AM strictly after = Mar 22 04:00 AM (Sunday)
    // first Thursday at or after Mar 22 = Mar 26
    const completedAt = brt("2026-03-14T10:00:00");
    const result = calculateCooldownExpiry(completedAt, "weekly", null, "thursday");
    expect(result.toISOString()).toBe(
      brt("2026-03-26T04:00:00").toISOString()
    );
  });

  // Extra: weekly with thursday when base 4AM already lands on thursday
  it("weekly with thursday: returns that thursday if first 4 AM lands on thursday", () => {
    // completed at Mar 12 10:00 AM BRT (Thursday) → +168h = Mar 19 10:00 AM BRT (Thursday)
    // first 4 AM strictly after = Mar 20 04:00 AM (Friday)
    // first Thursday at or after Mar 20 = Mar 26
    const completedAt = brt("2026-03-12T10:00:00");
    const result = calculateCooldownExpiry(completedAt, "weekly", null, "thursday");
    expect(result.toISOString()).toBe(
      brt("2026-03-26T04:00:00").toISOString()
    );
  });
});

describe("isAvailableDay", () => {
  // 10. isAvailableDay: thursday true/false
  it("thursday: returns true on Thursday", () => {
    const thursday = brt("2026-03-12T12:00:00"); // Thursday
    expect(isAvailableDay("thursday", thursday)).toBe(true);
  });

  it("thursday: returns false on Saturday", () => {
    const saturday = brt("2026-03-14T12:00:00"); // Saturday
    expect(isAvailableDay("thursday", saturday)).toBe(false);
  });

  // 11. isAvailableDay: weekend sat/sun/mon
  it("weekend: returns true on Saturday", () => {
    const saturday = brt("2026-03-14T12:00:00"); // Saturday
    expect(isAvailableDay("weekend", saturday)).toBe(true);
  });

  it("weekend: returns true on Sunday", () => {
    const sunday = brt("2026-03-15T12:00:00"); // Sunday
    expect(isAvailableDay("weekend", sunday)).toBe(true);
  });

  it("weekend: returns false on Monday", () => {
    const monday = brt("2026-03-16T12:00:00"); // Monday
    expect(isAvailableDay("weekend", monday)).toBe(false);
  });

  // 12. isAvailableDay: null → always true
  it("null available_day: always returns true", () => {
    const anyDay = brt("2026-03-16T12:00:00"); // Monday
    expect(isAvailableDay(null, anyDay)).toBe(true);
  });

  it("null available_day: always returns true on any day", () => {
    const thursday = brt("2026-03-12T12:00:00");
    expect(isAvailableDay(null, thursday)).toBe(true);
  });

  // 13. friday available day
  it("friday: returns true on Friday", () => {
    const friday = brt("2026-03-13T12:00:00"); // Friday
    expect(isAvailableDay("friday", friday)).toBe(true);
  });

  it("friday: returns false on Saturday", () => {
    const saturday = brt("2026-03-14T12:00:00");
    expect(isAvailableDay("friday", saturday)).toBe(false);
  });
});
