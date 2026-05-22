/**
 * @jest-environment node
 *
 * Unit tests for maskPhone / maskEmail per Wave 3 §03 §5.4 sub-unit A.4.
 */

import { maskPhone, maskEmail } from "../mask";

describe("maskPhone", () => {
  it("masks a typical RO E.164 number keeping country code + last 2 digits", () => {
    expect(maskPhone("+40712345689")).toBe("+40 •• ••• •89");
  });

  it("returns empty string for null", () => {
    expect(maskPhone(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(maskPhone(undefined)).toBe("");
  });

  it("returns the original value when too short to mask meaningfully", () => {
    expect(maskPhone("123")).toBe("123");
  });
});

describe("maskEmail", () => {
  it("masks a typical email keeping first + last char of local part", () => {
    expect(maskEmail("alice@example.com")).toBe("a•••e@example.com");
  });

  it("uses the short-local form for 2-char locals", () => {
    expect(maskEmail("ab@x.com")).toBe("a•@x.com");
  });

  it("uses the short-local form for 1-char locals", () => {
    expect(maskEmail("a@x.com")).toBe("a•@x.com");
  });

  it("returns empty string for null", () => {
    expect(maskEmail(null)).toBe("");
  });

  it("returns the value as-is when there is no local part", () => {
    expect(maskEmail("@x.com")).toBe("@x.com");
  });
});
