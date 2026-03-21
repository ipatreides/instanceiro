import { formatTimeRemaining } from "@/components/instances/instance-card";

describe("formatTimeRemaining", () => {
  const baseNow = new Date("2026-01-15T12:00:00Z");

  // 1. Returns empty string when expiresAt is null and no availableDay
  it("returns empty string when expiresAt is null and no availableDay", () => {
    expect(formatTimeRemaining(null, null, baseNow)).toBe("");
  });

  // 2. Returns "Quinta" when availableDay is "thursday" and no expiry
  it('returns "Quinta" when availableDay is "thursday" and no expiry', () => {
    expect(formatTimeRemaining(null, "thursday", baseNow)).toBe("Quinta");
  });

  // 3. Returns "Sexta" when availableDay is "friday" and no expiry
  it('returns "Sexta" when availableDay is "friday" and no expiry', () => {
    expect(formatTimeRemaining(null, "friday", baseNow)).toBe("Sexta");
  });

  // 4. Returns "Fim de semana" when availableDay is "weekend" and no expiry
  it('returns "Fim de semana" when availableDay is "weekend" and no expiry', () => {
    expect(formatTimeRemaining(null, "weekend", baseNow)).toBe("Fim de semana");
  });

  // 5. Returns available day label when cooldown expired but day not available
  it("returns available day label when cooldown expired but day not available", () => {
    const pastExpiry = new Date("2026-01-15T11:00:00Z"); // 1h before now
    expect(formatTimeRemaining(pastExpiry, "thursday", baseNow)).toBe("Quinta");
  });

  // 6. Returns minutes format "30min" for less than 1 hour remaining
  it('returns minutes format "30min" for less than 1 hour remaining', () => {
    const expiry = new Date(baseNow.getTime() + 30 * 60_000);
    expect(formatTimeRemaining(expiry, null, baseNow)).toBe("30min");
  });

  // 7. Returns hours+min format "2h 30min" for hours remaining
  it('returns hours+min format "2h 30min" for hours remaining', () => {
    const expiry = new Date(baseNow.getTime() + (2 * 60 + 30) * 60_000);
    expect(formatTimeRemaining(expiry, null, baseNow)).toBe("2h 30min");
  });

  // 8. Returns hours only "5h" when minutes are 0
  it('returns hours only "5h" when minutes are 0', () => {
    const expiry = new Date(baseNow.getTime() + 5 * 60 * 60_000);
    expect(formatTimeRemaining(expiry, null, baseNow)).toBe("5h");
  });

  // 9. Returns days+hours format "1d 14h" for more than 24h
  it('returns days+hours format "1d 14h" for more than 24h', () => {
    const expiry = new Date(baseNow.getTime() + (24 + 14) * 60 * 60_000);
    expect(formatTimeRemaining(expiry, null, baseNow)).toBe("1d 14h");
  });

  // 10. Returns days only "3d" when hours are 0
  it('returns days only "3d" when hours are 0', () => {
    const expiry = new Date(baseNow.getTime() + 3 * 24 * 60 * 60_000);
    expect(formatTimeRemaining(expiry, null, baseNow)).toBe("3d");
  });

  // 11. Returns empty string when cooldown expired and no available day
  it("returns empty string when cooldown expired and no available day", () => {
    const pastExpiry = new Date("2026-01-15T11:00:00Z"); // 1h before now
    expect(formatTimeRemaining(pastExpiry, null, baseNow)).toBe("");
  });
});
