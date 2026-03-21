import { EMPTY_MESSAGES } from "@/lib/empty-messages";

describe("EMPTY_MESSAGES", () => {
  it("is an array", () => {
    expect(Array.isArray(EMPTY_MESSAGES)).toBe(true);
  });

  it("has exactly 100 entries", () => {
    expect(EMPTY_MESSAGES).toHaveLength(100);
  });

  it("all entries are non-empty strings", () => {
    for (const message of EMPTY_MESSAGES) {
      expect(typeof message).toBe("string");
      expect(message.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate entries", () => {
    const unique = new Set(EMPTY_MESSAGES);
    expect(unique.size).toBe(EMPTY_MESSAGES.length);
  });

  it("all entries are different (no repeated messages)", () => {
    for (let i = 0; i < EMPTY_MESSAGES.length; i++) {
      for (let j = i + 1; j < EMPTY_MESSAGES.length; j++) {
        expect(EMPTY_MESSAGES[i]).not.toBe(EMPTY_MESSAGES[j]);
      }
    }
  });
});
