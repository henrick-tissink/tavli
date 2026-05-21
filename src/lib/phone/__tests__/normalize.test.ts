import { normalizePhone } from "../normalize";

describe("normalizePhone", () => {
  it("normalises RO local format to +40 E.164", () => {
    expect(normalizePhone("0712345678")).toEqual({
      ok: true,
      e164: "+40712345678",
    });
  });

  it("is idempotent on already-E.164 inputs", () => {
    expect(normalizePhone("+40712345678")).toEqual({
      ok: true,
      e164: "+40712345678",
    });
  });

  it("parses international E.164 with explicit country prefix regardless of defaultCountry", () => {
    expect(normalizePhone("+1 415 555 0100")).toEqual({
      ok: true,
      e164: "+14155550100",
    });
  });

  it("rejects empty / whitespace input with reason 'empty'", () => {
    expect(normalizePhone("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone("   ")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(null)).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(undefined)).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects garbage / un-parseable input with reason 'invalid'", () => {
    expect(normalizePhone("abc123")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizePhone("12")).toEqual({ ok: false, reason: "invalid" });
  });
});
