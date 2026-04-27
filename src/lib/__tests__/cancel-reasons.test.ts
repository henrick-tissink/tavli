import { CANCEL_REASONS, isCancelReasonKey } from "@/lib/cancel-reasons";

describe("CANCEL_REASONS", () => {
  test("contains the five expected keys", () => {
    expect(Object.keys(CANCEL_REASONS).sort()).toEqual([
      "kitchen_issue",
      "other",
      "overbooked",
      "private_event",
      "restaurant_closed",
    ]);
  });

  test("every reason has both partnerLabel and guestMessage as non-empty strings", () => {
    for (const [key, value] of Object.entries(CANCEL_REASONS)) {
      expect(typeof value.partnerLabel).toBe("string");
      expect(value.partnerLabel.length).toBeGreaterThan(0);
      expect(typeof value.guestMessage).toBe("string");
      expect(value.guestMessage.length).toBeGreaterThan(0);
      // Guest message should not contain partner-only language
      expect(value.guestMessage.toLowerCase()).not.toContain("internal");
    }
  });
});

describe("isCancelReasonKey", () => {
  test("accepts each known key", () => {
    expect(isCancelReasonKey("restaurant_closed")).toBe(true);
    expect(isCancelReasonKey("overbooked")).toBe(true);
    expect(isCancelReasonKey("kitchen_issue")).toBe(true);
    expect(isCancelReasonKey("private_event")).toBe(true);
    expect(isCancelReasonKey("other")).toBe(true);
  });

  test("rejects unknown values", () => {
    expect(isCancelReasonKey("")).toBe(false);
    expect(isCancelReasonKey("nope")).toBe(false);
    expect(isCancelReasonKey("Restaurant_Closed")).toBe(false); // case-sensitive
    expect(isCancelReasonKey("__proto__")).toBe(false); // prototype safety
  });
});
