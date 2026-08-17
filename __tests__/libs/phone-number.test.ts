import {
  MAX_E164_DIGITS,
  isValidNationalDigits,
  phoneEntryHint,
  toE164,
  toNationalDigits,
} from "../../libs/phone-number";

describe("toNationalDigits", () => {
  it("keeps digits and drops every separator a pasted number carries", () => {
    expect(toNationalDigits("+44 7911 123456")).toBe("447911123456");
    expect(toNationalDigits("+1.415.555.2671")).toBe("14155552671");
    expect(toNationalDigits("+1 (415) 555-2671")).toBe("14155552671");
  });

  it("drops the 00 international access prefix, which is what the + replaces", () => {
    expect(toNationalDigits("0044 7911 123456")).toBe("447911123456");
    expect(toNationalDigits("00")).toBe("");
  });

  it("drops a parenthesised trunk zero as a group, not just its brackets", () => {
    // "+44 (0)7911 123456" is 447911123456. Stripping only the brackets would
    // leave 4407911123456 — one digit too long, and still valid-looking.
    expect(toNationalDigits("+44 (0)7911 123456")).toBe("447911123456");
    expect(toNationalDigits("+49 (0) 151 23456789")).toBe("4915123456789");
  });

  it("keeps a bare national trunk 0 so it fails validation instead of dialling elsewhere", () => {
    // "07911123456" with the 0 stripped would be a valid-looking +7 (Russia)
    // number and would get an SMS sent to it.
    expect(toNationalDigits("07911123456")).toBe("07911123456");
    expect(isValidNationalDigits(toNationalDigits("07911123456"))).toBe(false);
  });

  it("never truncates — an over-long number must fail, not become a valid prefix", () => {
    const tooLong = "1".repeat(20);
    expect(toNationalDigits(tooLong)).toHaveLength(20);
    expect(isValidNationalDigits(toNationalDigits(tooLong))).toBe(false);
  });

  it("tolerates empty and letter-only input", () => {
    expect(toNationalDigits("")).toBe("");
    expect(toNationalDigits("abc")).toBe("");
  });
});

describe("isValidNationalDigits", () => {
  it("accepts 7 to 15 digits starting non-zero", () => {
    expect(isValidNationalDigits("1234567")).toBe(true);
    expect(isValidNationalDigits("447911123456")).toBe(true);
    expect(isValidNationalDigits("9".repeat(MAX_E164_DIGITS))).toBe(true);
  });

  it("rejects too short, too long, and leading zero", () => {
    expect(isValidNationalDigits("123456")).toBe(false);
    expect(isValidNationalDigits("9".repeat(16))).toBe(false);
    expect(isValidNationalDigits("0447911123")).toBe(false);
    expect(isValidNationalDigits("")).toBe(false);
  });

  it("agrees with the edge function's own E.164 regex once the + is added", () => {
    const edgeRegex = /^\+[1-9]\d{6,14}$/;
    const cases = ["1234567", "447911123456", "9".repeat(15), "123456", "0447911123", "9".repeat(16)];
    for (const digits of cases) {
      expect(edgeRegex.test(toE164(digits))).toBe(isValidNationalDigits(digits));
    }
  });
});

describe("phoneEntryHint", () => {
  it("calls out the trunk prefix, the one mistake that looks right", () => {
    expect(phoneEntryHint("07911123456", "07911123456")).toMatch(/country code/i);
  });

  it("counts out an over-long number", () => {
    const digits = "1".repeat(18);
    expect(phoneEntryHint(digits, digits)).toMatch(/18 digits/);
  });

  it("flags a formatted paste that carries no international prefix", () => {
    // Reduces to 4155552671, which is a well-formed number in Switzerland.
    // Nothing about the digits alone reveals the missing country code.
    expect(phoneEntryHint("(415) 555-2671", "4155552671")).toMatch(/country code/i);
  });

  it("stays quiet when the paste says which country it is", () => {
    expect(phoneEntryHint("+44 7911 123456", "447911123456")).toBeNull();
    expect(phoneEntryHint("0044 7911 123456", "447911123456")).toBeNull();
  });

  it("stays quiet for a number keyed straight in", () => {
    expect(phoneEntryHint("", "")).toBeNull();
    expect(phoneEntryHint("4479", "4479")).toBeNull();
    expect(phoneEntryHint("447911123456", "447911123456")).toBeNull();
  });
});
