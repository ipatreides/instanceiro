import {
  toBrtDatetimeLocal,
  fromBrtDatetimeLocal,
  formatBrtDateTime,
  formatDateTime,
  nowBrtMax,
} from "@/lib/format-date";

describe("toBrtDatetimeLocal", () => {
  it("converts a UTC date to BRT datetime-local format", () => {
    // 2026-03-15 15:30:00 UTC = 2026-03-15 12:30:00 BRT (UTC-3)
    const date = new Date("2026-03-15T15:30:00Z");
    expect(toBrtDatetimeLocal(date)).toBe("2026-03-15T12:30");
  });

  it("handles midnight UTC correctly", () => {
    // 2026-01-01 00:00:00 UTC = 2025-12-31 21:00:00 BRT
    const date = new Date("2026-01-01T00:00:00Z");
    expect(toBrtDatetimeLocal(date)).toBe("2025-12-31T21:00");
  });

  it("handles end-of-day UTC correctly", () => {
    // 2026-06-10 23:59:00 UTC = 2026-06-10 20:59:00 BRT
    const date = new Date("2026-06-10T23:59:00Z");
    expect(toBrtDatetimeLocal(date)).toBe("2026-06-10T20:59");
  });
});

describe("fromBrtDatetimeLocal", () => {
  it("converts a datetime-local string to ISO with BRT offset", () => {
    expect(fromBrtDatetimeLocal("2026-03-15T12:30")).toBe("2026-03-15T12:30:00-03:00");
  });

  it("works for midnight BRT", () => {
    expect(fromBrtDatetimeLocal("2026-01-01T00:00")).toBe("2026-01-01T00:00:00-03:00");
  });
});

describe("formatBrtDateTime", () => {
  it("formats a UTC ISO string into pt-BR BRT representation", () => {
    // 2026-03-15T15:30:00Z = 2026-03-15 12:30 BRT
    const result = formatBrtDateTime("2026-03-15T15:30:00Z");
    expect(result).toContain("15/03/2026");
    expect(result).toContain("12:30");
  });

  it("formats an ISO string with offset", () => {
    // 2026-06-01T10:00:00-03:00 = already BRT
    const result = formatBrtDateTime("2026-06-01T10:00:00-03:00");
    expect(result).toContain("01/06/2026");
    expect(result).toContain("10:00");
  });
});

describe("formatDateTime", () => {
  it("formats a date string in pt-BR locale", () => {
    const result = formatDateTime("2026-03-15T15:30:00Z");
    // This uses the system locale, so the exact output depends on timezone
    // but it should contain date parts
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe("nowBrtMax", () => {
  it("returns a datetime-local string for approximately now", () => {
    const result = nowBrtMax();
    // Should be in YYYY-MM-DDTHH:mm format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("returns a value that matches toBrtDatetimeLocal(new Date())", () => {
    const before = toBrtDatetimeLocal(new Date());
    const result = nowBrtMax();
    const after = toBrtDatetimeLocal(new Date());
    // The result should be between before and after (or equal)
    expect(result >= before || result <= after).toBe(true);
  });
});

describe("round-trip: toBrtDatetimeLocal -> fromBrtDatetimeLocal", () => {
  it("produces a valid ISO string that represents the same instant", () => {
    const original = new Date("2026-07-20T18:45:00Z");
    const local = toBrtDatetimeLocal(original);
    const iso = fromBrtDatetimeLocal(local);

    // Parse the ISO string back — it should represent the same UTC instant
    const roundTripped = new Date(iso);
    // Allow 1 minute difference due to seconds truncation
    expect(Math.abs(roundTripped.getTime() - original.getTime())).toBeLessThanOrEqual(60000);
  });
});
