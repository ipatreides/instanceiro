import { isValidUsername } from "@/hooks/use-username-check";

describe("isValidUsername", () => {
  it('returns true for "marcel"', () => {
    expect(isValidUsername("marcel")).toBe(true);
  });

  it('returns true for "abc" (minimum 3 chars)', () => {
    expect(isValidUsername("abc")).toBe(true);
  });

  it('returns true for "a1b2c3" (alphanumeric mix)', () => {
    expect(isValidUsername("a1b2c3")).toBe(true);
  });

  it("returns true for a 20-char string (maximum length)", () => {
    expect(isValidUsername("a".repeat(20))).toBe(true);
  });

  it('returns true for "123" (all numbers)', () => {
    expect(isValidUsername("123")).toBe(true);
  });

  it('returns false for "ab" (too short)', () => {
    expect(isValidUsername("ab")).toBe(false);
  });

  it("returns false for a 21-char string (too long)", () => {
    expect(isValidUsername("a".repeat(21))).toBe(false);
  });

  it('returns false for "" (empty string)', () => {
    expect(isValidUsername("")).toBe(false);
  });

  it('returns false for "Marcel" (uppercase)', () => {
    expect(isValidUsername("Marcel")).toBe(false);
  });

  it('returns false for "mar cel" (space)', () => {
    expect(isValidUsername("mar cel")).toBe(false);
  });

  it('returns false for "mar_cel" (underscore)', () => {
    expect(isValidUsername("mar_cel")).toBe(false);
  });

  it('returns false for "mar-cel" (hyphen)', () => {
    expect(isValidUsername("mar-cel")).toBe(false);
  });

  it('returns false for "mar.cel" (dot)', () => {
    expect(isValidUsername("mar.cel")).toBe(false);
  });

  it('returns false for "@marcel" (special char)', () => {
    expect(isValidUsername("@marcel")).toBe(false);
  });
});
